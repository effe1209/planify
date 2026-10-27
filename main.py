"""
Planify AI - FloorPlan Engine (FastAPI).

Il motore vero è in planner.py (stessa cartella). Questo file espone solo l'API.

Avvio:   uvicorn main:app --reload
Debug:   http://127.0.0.1:8000/preview?width=12&length=9&room_type=apartment&num_rooms=4&shape=l&seed=11
"""
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

import planner

app = FastAPI(
    title="Planify AI - FloorPlan Engine",
    description="Generatore di planimetrie con sagome varie (rettangolo, L, U, T, scalare), "
                "stanze, muri, porte, finestre e arredi coerenti.",
    version="5.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- MODELLI DATI -----------------------------------------------------------
class PlanRequest(BaseModel):
    width: float = Field(..., gt=0, description="Larghezza in metri (min 5, max 60: valori fuori range vengono limitati)")
    length: float = Field(..., gt=0, description="Lunghezza in metri (min 5, max 60)")
    room_type: str = Field("apartment", description="apartment | open-space | office")
    num_rooms: int = Field(3, ge=1, le=8, description="Numero di locali principali (soggiorno/open space incluso)")
    style: Optional[str] = Field("modern", description="modern | classic")
    shape: Optional[str] = Field("auto", description="auto | rect | l | u | t | step  (auto = varia a caso)")
    seed: Optional[int] = Field(None, ge=0, description="Stesso seed = stessa pianta. Vuoto = variante nuova a ogni richiesta")


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


# --- ENDPOINT ---------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "version": app.version}


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
