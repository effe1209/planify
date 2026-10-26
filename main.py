"""
Backend Python per la Generazione Gratuita di Piante tramite AI.
Adatto al nuovo frontend "Apple Style" con planimetrie architettoniche dettagliate.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="Planify AI - FloorPlan Generator API",
    description="Generatore di layout architettonici e posizionamento arredi con esportazione vettoriale",
    version="2.0.0"
)

# Abilita le chiamate dal Frontend Vercel (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC MODELS (Definizione della struttura dati) ---

class PlanRequest(BaseModel):
    width: float
    length: float
    room_type: str = "apartment"
    num_rooms: int = 3
    style: Optional[str] = "modern"

class Room(BaseModel):
    id: int
    name: str
    x: float
    y: float
    w: float
    h: float
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

class PlanResponse(BaseModel):
    dimensions: dict
    svgWidth: float
    svgHeight: float
    scale: float
    wallThickness: float
    rooms: List[Room]
    walls: List[Wall]
    doors: List[Door]
    windows: List[Window]
    furniture: List[FurnitureItem]


@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Architectural Generator v2",
        "message": "AI Floor Plan Backend operativo."
    }

@app.post("/generate-plan", response_model=PlanResponse)
def generate_floor_plan(request: PlanRequest):
    """
    Algoritmo procedurale (Predisposto per AI):
    Calcola la suddivisione ottimale dello spazio, erige i muri, apre varchi (porte/finestre)
    e posiziona gli arredi in base alla tipologia di ambiente.
    """
    try:
        # Assicuriamoci che non vengano inserite misure troppo piccole
        w = max(3.0, request.width)
        l = max(3.0, request.length)
        
        # Parametri di visualizzazione per il frontend vettoriale
        scale = 45.0
        wt = 0.2  # Spessore dei muri reali (20 cm)

        rooms = []
        walls = []
        doors = []
        windows = []
        furniture = []

        # LOGICA 1: Stanza Singola / Ufficio
        if request.room_type in ["single-room", "open-space", "office"] or request.num_rooms == 1:
            rooms = [Room(id=1, name="Open Space", x=0, y=0, w=w, h=l, color="#f8fafc")]
            
            # 4 Muri perimetrali
            walls = [
                Wall(x=0, y=0, w=w, h=wt),          # Nord
                Wall(x=0, y=l-wt, w=w, h=wt),       # Sud
                Wall(x=0, y=0, w=wt, h=l),          # Ovest
                Wall(x=w-wt, y=0, w=wt, h=l),       # Est
            ]
            
            # Porta d'ingresso
            doors = [Door(x=w/2 - 0.45, y=l-wt, w=0.9, rot=0, openDir=-1)]
            
            # Finestre ampie
            windows = [
                Window(x=w*0.2, y=0, w=w*0.6, rot=0), # Grande vetrata a nord
            ]

            if request.room_type == "office":
                furniture = [
                    FurnitureItem(type="table", x=w*0.3, y=l*0.3, w=1.6, h=0.8, rot=0),
                    FurnitureItem(type="table", x=w*0.3, y=l*0.6, w=1.6, h=0.8, rot=0),
                    FurnitureItem(type="sofa", x=w*0.7, y=l*0.1, w=1.8, h=0.9, rot=90),
                ]
            else:
                furniture = [
                    FurnitureItem(type="bed", x=wt, y=l*0.2, w=1.8, h=2.1, rot=0),
                    FurnitureItem(type="sofa", x=w*0.5, y=l*0.6, w=2.2, h=0.9, rot=0),
                    FurnitureItem(type="tv", x=w*0.5, y=l*0.9, w=1.5, h=0.3, rot=0),
                    FurnitureItem(type="kitchen_counter", x=w-wt-0.6, y=wt, w=0.6, h=2.5, rot=0),
                ]

        # LOGICA 2: Appartamento Completo Multi-stanza
        else:
            # Calcolo le proporzioni per i divisori interni
            cx = w * 0.55  # Divisorio centrale verticale
            cy_living = l * 0.55 # Divisorio orizzontale zona giorno
            cy_bath = l * 0.45   # Divisorio orizzontale bagni

            rooms = [
                Room(id=1, name="Soggiorno", x=0, y=0, w=cx, h=cy_living, color="#f8fafc"),
                Room(id=2, name="Cucina", x=cx, y=0, w=w-cx, h=cy_bath, color="#f8fafc"),
                Room(id=3, name="Camera", x=0, y=cy_living, w=cx, h=l-cy_living, color="#f8fafc"),
                Room(id=4, name="Bagno", x=cx, y=cy_bath, w=w-cx, h=(l-cy_bath)*0.5, color="#f8fafc"),
                Room(id=5, name="Ingresso", x=cx, y=cy_bath+((l-cy_bath)*0.5), w=w-cx, h=(l-cy_bath)*0.5, color="#f8fafc"),
            ]

            # Generazione strutturale Muri
            walls = [
                Wall(x=0, y=0, w=w, h=wt),                # Nord (Perimetro)
                Wall(x=0, y=l-wt, w=w, h=wt),             # Sud (Perimetro)
                Wall(x=0, y=0, w=wt, h=l),                # Ovest (Perimetro)
                Wall(x=w-wt, y=0, w=wt, h=l),             # Est (Perimetro)
                Wall(x=cx, y=0, w=wt, h=l),               # Divisorio Verticale Centrale
                Wall(x=0, y=cy_living, w=cx, h=wt),       # Divisorio Orizzontale Camera
                Wall(x=cx, y=cy_bath, w=w-cx, h=wt),      # Divisorio Orizzontale Cucina/Bagno
                Wall(x=cx, y=cy_bath+((l-cy_bath)*0.5), w=w-cx, h=wt), # Divisorio Orizzontale Bagno/Ingresso
            ]

            # Porte (Varchi di 90cm = 0.9m)
            doors = [
                Door(x=cx - 0.9, y=l*0.75 - wt, w=0.9, rot=0, openDir=-1),  # Ingresso->Soggiorno
                Door(x=wt, y=cy_living - wt, w=0.9, rot=0, openDir=-1),      # Soggiorno->Camera
                Door(x=cx + wt, y=cy_bath - 0.9, w=0.9, rot=90, openDir=1),  # Ingresso->Bagno
            ]

            # Finestre
            windows = [
                Window(x=w*0.2, y=0, w=1.5, rot=0),          # Soggiorno
                Window(x=w*0.7, y=0, w=1.2, rot=0),          # Cucina
                Window(x=0, y=l*0.75, w=1.2, rot=90),        # Camera
                Window(x=w-wt, y=cy_living, w=0.8, rot=90),  # Bagno
            ]

            # Arredamento avanzato e dimensionato per ogni stanza
            furniture = [
                # Camera
                FurnitureItem(type="bed", x=wt*2, y=cy_living + wt*2, w=1.8, h=2.1, rot=0),
                # Soggiorno
                FurnitureItem(type="sofa", x=wt*2, y=wt*2, w=2.2, h=0.9, rot=0),
                FurnitureItem(type="tv", x=wt*2, y=cy_living*0.7, w=1.5, h=0.3, rot=0),
                # Cucina
                FurnitureItem(type="table", x=cx + (w-cx)*0.2, y=cy_bath*0.2, w=1.6, h=0.9, rot=0),
                FurnitureItem(type="kitchen_counter", x=cx + wt, y=wt, w=0.6, h=cy_bath*0.8, rot=0),
                # Bagno
                FurnitureItem(type="bath", x=cx + wt, y=cy_bath + wt, w=1.7, h=0.8, rot=0)
            ]

        # Costruisci il payload da inviare al front-end
        return PlanResponse(
            dimensions={"width": w, "length": l},
            svgWidth=w * scale,
            svgHeight=l * scale,
            scale=scale,
            wallThickness=wt * scale,
            rooms=rooms,
            walls=walls,
            doors=doors,
            windows=windows,
            furniture=furniture
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))