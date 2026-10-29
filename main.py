"""
Planify AI - FloorPlan Engine (FastAPI).

Il motore vero è in planner.py (stessa cartella). Questo file espone solo l'API.

Avvio:   uvicorn main:app --reload
Debug:   http://127.0.0.1:8000/preview?width=12&length=9&room_type=apartment&num_rooms=4&shape=l&seed=11
"""
import io
from typing import Any, Dict, Iterator, List, Literal, Optional, Tuple, Union

try:
    import ezdxf
except ImportError:  # l'export DXF ha un fallback ASCII senza dipendenze
    ezdxf = None

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

import planner

app = FastAPI(
    title="Planify AI - FloorPlan Engine",
    description="Generatore di planimetrie con sagome varie (rettangolo, L, U, T, scalare), "
                "stanze, muri, porte, finestre e arredi coerenti.",
    version="7.3.0",
)

# Funzioni del motore: il frontend le legge da /health per capire se un'opzione verrà rispettata.
# Aggiungerne una qui quando il motore impara a gestire un nuovo filtro.
FEATURES = ["room_program", "kitchen_mode", "peninsula", "furniture_v2", "dxf_import", "dxf_export",
            "needs", "design_review", "garage", "garden", "laundry", "stairs", "floor_program", "house", "garage_stairs", "wet_align",
            "garden_house", "street_garage"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # con origini "*" i browser rifiutano le credenziali: l'API non ne usa
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- MODELLI DATI -----------------------------------------------------------
class PlanRequest(BaseModel):
    width: float = Field(..., gt=0, description="Larghezza in metri (da 3.5 a 60)")
    length: float = Field(..., gt=0, description="Lunghezza in metri (da 3.5 a 60)")
    room_type: str = Field("apartment", description="apartment | open-space | office | hotel-room")
    num_rooms: int = Field(3, ge=1, le=8, description="Numero di locali principali (soggiorno/open space incluso)")
    style: Optional[str] = Field("modern", description="modern | classic | nordic | industrial | japandi | luxury")
    shape: Optional[str] = Field("auto", description="auto | rect | l | u | t | step  (auto = varia a caso)")
    seed: Optional[int] = Field(None, ge=0, description="Stesso seed = stessa pianta. Vuoto = variante nuova a ogni richiesta")
    # Solo appartamenti: se indicati hanno la precedenza su num_rooms
    double_bedrooms: Optional[int] = Field(None, ge=0, le=5, description="Camere matrimoniali")
    single_bedrooms: Optional[int] = Field(None, ge=0, le=5, description="Camere singole")
    bathrooms: Optional[int] = Field(None, ge=1, le=3, description="Bagni (vuoto = automatico)")
    kitchen: Literal["auto", "open", "closed"] = Field("auto", description="Cucina a vista nel soggiorno o separata")
    peninsula: bool = Field(False, description="Penisola in cucina, se entra")
    needs: Optional["Needs"] = Field(None, description="Bisogni dell'utente (solo appartamenti)")
    # Case su più piani (solo appartamenti)
    program: Literal["full", "day", "night"] = Field("full", description="Locali del piano: tutti, zona giorno o zona notte")
    access: Literal["street", "stairs", "both"] = Field("street", description="Da dove si entra: porta sulla facciata, scala o entrambe")
    stair_type: Literal["auto", "u", "l", "straight"] = Field("auto", description="Scala a U, a L o a rampa unica")
    core: Optional["StairCore"] = Field(None, description="Scala di un altro piano (plan.stairs[i].core): va nello stesso punto")
    wet: Optional[List[Dict[str, float]]] = Field(None, description="Bagni del piano accanto ({x, y, w, h}): si cerca di sovrapporli")
    house: Optional[Dict[str, Any]] = Field(None, description="Solo giardino: facciata della casa {w, door: {x, w}, garage: {x, w, side, ramp}}")


class StairCore(BaseModel):
    x: float
    y: float
    w: float
    h: float
    type: Literal["u", "l", "straight"] = "u"
    entry: Literal["N", "E", "S", "W"] = "S"
    hand: Literal["N", "E", "S", "W"] = "W"


class HouseFloor(BaseModel):
    level: int = Field(0, ge=-3, le=5, description="-1 interrato, 0 terra, 1 primo…")
    program: Literal["full", "day", "night", "garage"] = "full"
    double_bedrooms: Optional[int] = Field(None, ge=0, le=5)
    single_bedrooms: Optional[int] = Field(None, ge=0, le=5)
    bathrooms: Optional[int] = Field(None, ge=1, le=3)
    kitchen: Literal["auto", "open", "closed"] = "auto"
    peninsula: bool = False
    needs: Optional["Needs"] = None


class HouseRequest(BaseModel):
    width: float = Field(..., gt=0)
    length: float = Field(..., gt=0)
    style: Optional[str] = "modern"
    seed: Optional[int] = Field(None, ge=0)
    stair_type: Literal["auto", "u", "l", "straight"] = "auto"
    floors: List[HouseFloor] = Field(..., min_length=1, max_length=5)


class Needs(BaseModel):
    entry: Union[bool, Literal["auto"]] = Field("auto", description="Ingresso separato")
    suite: bool = Field(False, description="Camera padronale con bagno privato e cabina armadio")
    study: bool = Field(False, description="Studio / smart working")
    storage: Optional[bool] = Field(None, description="Ripostiglio (nel garage: ripostiglio/cantina, attivo se non indicato)")
    laundry: Optional[bool] = Field(None, description="Lavanderia (nel garage: attiva se non indicato)")


PlanRequest.model_rebuild()
HouseFloor.model_rebuild()


class DxfImportRequest(BaseModel):
    dxf_content: str
    style: Optional[str] = "modern"


class Room(BaseModel):
    id: int
    name: str
    kind: str = ""
    x: float
    y: float
    w: float
    h: float
    area: float = 0.0       # m² (w * h)
    zone: int = 0           # stanze con lo stesso valore formano un unico spazio aperto
    color: str
    size: str = ""          # camere: "double" (matrimoniale) | "single"
    poly: Optional[List[List[float]]] = None   # contorno libero (schizzi): se presente vale questo, non il rettangolo


class Wall(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Door(BaseModel):
    x: float
    y: float
    w: float
    rot: float
    openDir: int
    entrance: bool = False  # True = porta d'ingresso dell'unità
    kind: str = ""          # "" porta | "garage" basculante | "gate" cancello del giardino


class Window(BaseModel):
    x: float
    y: float
    w: float
    rot: float


class FurnitureItem(BaseModel):
    type: str
    x: float
    y: float
    w: float
    h: float
    rot: float
    facing: str = ""   # lato verso cui è rivolto l'arredo (N/E/S/W)
    room: int = 0      # id della stanza che lo contiene
    flip: bool = False # disegno specchiato (doccia angolare, divano angolare, penisola)
    parts: Optional[Dict[str, float]] = None   # posizioni interne (piano cucina: hob, sink in metri dall'inizio)


class Notch(BaseModel):
    """Parte del riquadro esterno non occupata dall'edificio (rientranza di una pianta a L/U/T)."""
    x: float
    y: float
    w: float
    h: float


class PlanResponse(BaseModel):
    dimensions: dict
    svgWidth: float
    svgHeight: float
    scale: float
    wallThickness: float
    shape: str = "rect"            # sagoma effettiva: rect | l | u | t | step
    seed: int = 0                  # da rimandare nella richiesta per riottenere la stessa pianta
    stats: Dict[str, float] = {}
    notches: List[Notch] = []
    rooms: List[Room]
    walls: List[Wall]
    doors: List[Door]
    windows: List[Window]
    furniture: List[FurnitureItem]
    notes: List[str] = []
    design: Optional[Dict[str, Any]] = None   # valutazione progettuale: punteggio, punti di forza, criticità
    stairs: List[Dict[str, Any]] = []          # vani scala: ingombro (core) da passare agli altri piani e rampe
    house: Optional[Dict[str, Any]] = None     # giardino: dove sta la casa sul lato nord ({x, w} in metri)


class HouseFloorPlan(BaseModel):
    level: int
    program: str
    plan: PlanResponse


class HouseResponse(BaseModel):
    floors: List[HouseFloorPlan]
    seed: int
    notes: List[str] = []


# --- ENDPOINT ---------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "version": app.version, "features": FEATURES}


@app.post("/generate-plan", response_model=PlanResponse)
def generate_floor_plan(request: PlanRequest):
    try:
        return planner.generate(
            width=request.width,
            length=request.length,
            room_type=request.room_type,
            num_rooms=request.num_rooms,
            style=request.style or "modern",
            shape=request.shape or "auto",
            seed=request.seed,
            double_bedrooms=request.double_bedrooms,
            single_bedrooms=request.single_bedrooms,
            bathrooms=request.bathrooms,
            kitchen=request.kitchen,
            peninsula=request.peninsula,
            needs=request.needs.model_dump() if request.needs else None,
            program=request.program,
            access=request.access,
            stair_type=request.stair_type,
            core=request.core.model_dump() if request.core else None,
            wet=request.wet,
            house=request.house,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Errore nella generazione: {e}")


@app.post("/generate-house", response_model=HouseResponse)
def generate_house(request: HouseRequest):
    """Casa su più piani generata insieme (zona giorno / zona notte) con la scala allineata."""
    try:
        return planner.generate_house(
            width=request.width,
            length=request.length,
            style=request.style or "modern",
            seed=request.seed,
            stair_type=request.stair_type,
            floors=[{**f.model_dump(), "needs": f.needs.model_dump() if f.needs else None} for f in request.floors],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Errore nella generazione: {e}")


@app.get("/preview")
def preview(
    width: float = Query(10, gt=0),
    length: float = Query(8, gt=0),
    room_type: str = "apartment",
    num_rooms: int = Query(3, ge=1, le=8),
    style: str = "modern",
    shape: str = "auto",
    seed: Optional[int] = Query(None, ge=0),
):
    """Anteprima SVG nel browser, per verificare il motore senza il frontend."""
    plan = planner.generate(width, length, room_type, num_rooms, style, shape, seed)
    return Response(content=planner.to_svg(plan), media_type="image/svg+xml")

Polyline = Tuple[str, List[Tuple[float, float]], bool]   # (layer, punti, chiusa)


def _rect(o: dict) -> List[Tuple[float, float]]:
    x, y, w, h = (float(o.get(k, 0)) for k in ("x", "y", "w", "h"))
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def _plan_polylines(plan: dict) -> Iterator[Polyline]:
    """Tutte le geometrie della pianta, con la y ribaltata (nel DXF cresce verso l'alto)."""
    L = float(plan.get("dimensions", {}).get("length", 0))
    flip = lambda pts: [(round(x, 4), round(L - y, 4)) for x, y in pts]
    for room in plan.get("rooms", []):
        yield "AREE", flip(room.get("poly") or _rect(room)), True
    for wall in plan.get("walls", []):
        yield "MURI", flip(_rect(wall)), True
    for line in plan.get("wallLines", []):
        yield "MURI", flip(line.get("pts", [])), bool(line.get("closed"))
    for item in plan.get("furniture", []):
        yield "ARREDI", flip(_rect(item)), True


def _dxf_with_ezdxf(plan: dict) -> str:
    doc = ezdxf.new("R2010")
    doc.header["$MEASUREMENT"] = 1   # metrico
    doc.header["$INSUNITS"] = 6      # metri
    for name, color in (("MURI", 7), ("ARREDI", 3), ("AREE", 8)):
        doc.layers.add(name, color=color)
    msp = doc.modelspace()
    for layer, pts, closed in _plan_polylines(plan):
        msp.add_lwpolyline(pts, close=closed, dxfattribs={"layer": layer})
    L = float(plan.get("dimensions", {}).get("length", 0))
    for room in plan.get("rooms", []):
        if room.get("name"):
            cx, cy = room.get("label") or (room.get("x", 0) + room.get("w", 0) / 2, room.get("y", 0) + room.get("h", 0) / 2)
            msp.add_text(room["name"], dxfattribs={"layer": "AREE", "height": 0.2}).set_placement((cx, L - cy))
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue()


def _dxf_ascii(plan: dict) -> str:
    """DXF minimale senza dipendenze (solo sezione ENTITIES)."""
    out = ["0", "SECTION", "2", "ENTITIES"]
    for layer, pts, closed in _plan_polylines(plan):
        out += ["0", "LWPOLYLINE", "8", layer, "90", str(len(pts)), "70", "1" if closed else "0"]
        for x, y in pts:
            out += ["10", str(x), "20", str(y)]
    out += ["0", "ENDSEC", "0", "EOF"]
    return "\n".join(out)


@app.post("/export-dxf")
def export_dxf(plan: dict):
    try:
        content = _dxf_with_ezdxf(plan) if ezdxf is not None else _dxf_ascii(plan)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Errore interno DXF: {e}")
    return Response(
        content=content,
        media_type="application/dxf",
        headers={"Content-Disposition": "attachment; filename=planimetria.dxf"},
    )


@app.post("/import-dxf", response_model=PlanResponse)
def import_dxf_endpoint(req: DxfImportRequest):
    """Riceve il testo di un file DXF e genera una planimetria arredata completa."""
    try:
        return planner.import_dxf_data(req.dxf_content, style=req.style or "modern")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Errore nell'importazione DXF: {e}")
