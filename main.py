"""
Backend Python - Generatore Architettonico Dettagliato.
Supporta: Appartamenti, Loft/Open-Space e Uffici con posizionamento arredi sensato.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="Planify AI - FloorPlan Engine",
    description="Motore di simulazione architettonica con topologia rigorosa.",
    version="3.0.0"
)

# Abilita le chiamate dal Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODELLI DATI ---
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

@app.post("/generate-plan", response_model=PlanResponse)
def generate_floor_plan(request: PlanRequest):
    try:
        # Vincoli minimi per evitare stanze impossibili (minimo 5x5 metri)
        w = max(5.0, request.width)
        l = max(5.0, request.length)
        
        scale = 45.0
        wt = 0.2  # Spessore dei muri reali (20 cm)

        rooms, walls, doors, windows, furniture = [], [], [], [], []

        # ---------------------------------------------------------
        # LAYOUT 1: UFFICIO MODERNO (Open space + Sala Riunioni + Bagno)
        # ---------------------------------------------------------
        if request.room_type == "office":
            cx = w * 0.65  # Linea divisoria verticale
            cy = l * 0.4   # Linea divisoria orizzontale a destra
            
            # Stanze
            rooms = [
                Room(id=1, name="Area Operativa", x=0, y=0, w=cx, h=l, color="#f8fafc"),
                Room(id=2, name="Sala Riunioni", x=cx, y=0, w=w-cx, h=l-cy, color="#f1f5f9"),
                Room(id=3, name="Bagno", x=cx, y=l-cy, w=w-cx, h=cy, color="#f8fafc")
            ]
            
            # Muri (Perimetro + Tramezzi)
            walls = [
                Wall(x=0, y=0, w=w, h=wt), Wall(x=0, y=l-wt, w=w, h=wt), # Sud e Nord
                Wall(x=0, y=0, w=wt, h=l), Wall(x=w-wt, y=0, w=wt, h=l), # Ovest ed Est
                Wall(x=cx, y=0, w=wt, h=l),                              # Tramezzo verticale
                Wall(x=cx, y=l-cy, w=w-cx, h=wt)                         # Tramezzo orizzontale
            ]
            
            # Porte e Finestre
            doors = [
                Door(x=cx/2 - 0.45, y=l-wt, w=0.9, rot=0, openDir=-1),     # Ingresso principale (Nord)
                Door(x=cx, y=(l-cy)/2 - 0.45, w=0.9, rot=90, openDir=1),   # Porta Sala Riunioni
                Door(x=cx, y=l - cy/2 - 0.45, w=0.9, rot=90, openDir=1)    # Porta Bagno
            ]
            windows = [
                Window(x=cx/2-1.5, y=0, w=3.0, rot=0),         # Finestra grande ufficio (Sud)
                Window(x=w-wt, y=(l-cy)/2-1, w=2.0, rot=90)    # Finestra Sala Riunioni (Est)
            ]
            
            # Arredi Sensati per Ufficio
            # 1. Reception
            furniture.append(FurnitureItem(type="kitchen_counter", x=cx/2-1, y=l-1.5, w=2, h=0.6, rot=0))
            # 2. Scrivanie in fila (calcolo dinamico)
            desk_y = 1.0
            while desk_y < l - 3.0:
                furniture.append(FurnitureItem(type="desk", x=wt*2, y=desk_y, w=1.6, h=0.8, rot=0))
                if cx > 4.0:
                    furniture.append(FurnitureItem(type="desk", x=cx-wt-1.6, y=desk_y, w=1.6, h=0.8, rot=0))
                desk_y += 2.0
            # 3. Sala Riunioni
            furniture.append(FurnitureItem(type="table", x=cx + (w-cx)/2 - 1.2, y=(l-cy)/2 - 0.5, w=2.4, h=1.0, rot=0))
            # 4. Bagno (WC e Lavabo)
            furniture.append(FurnitureItem(type="toilet", x=w-wt-0.5, y=l-cy+wt*2, w=0.5, h=0.7, rot=0))
            furniture.append(FurnitureItem(type="sink", x=cx+wt, y=l-wt-0.5, w=0.8, h=0.5, rot=0))

        # ---------------------------------------------------------
        # LAYOUT 2: LOFT / OPEN SPACE (Tutto aperto tranne il bagno)
        # ---------------------------------------------------------
        elif request.room_type == "open-space":
            bw, bh = 2.5, 2.5 # Dimensione fissa del bagno (in alto a destra)
            
            # Stanze (Loft avvolge il bagno)
            rooms = [
                Room(id=1, name="Loft (Living/Notte)", x=0, y=0, w=w, h=l, color="#f8fafc"),
                Room(id=2, name="Bagno", x=w-bw, y=l-bh, w=bw, h=bh, color="#f1f5f9")
            ]
            
            # Muri
            walls = [
                Wall(x=0, y=0, w=w, h=wt), Wall(x=0, y=l-wt, w=w, h=wt),
                Wall(x=0, y=0, w=wt, h=l), Wall(x=w-wt, y=0, w=wt, h=l),
                Wall(x=w-bw, y=l-bh, w=bw, h=wt), # Muro bagno orizzontale
                Wall(x=w-bw, y=l-bh, w=wt, h=bh)  # Muro bagno verticale
            ]
            
            # Porte e Finestre
            doors = [
                Door(x=w/2 - 0.45, y=0, w=0.9, rot=0, openDir=1),        # Ingresso Principale (Sud)
                Door(x=w-bw-0.9, y=l-bh/2, w=0.9, rot=90, openDir=1)     # Porta Bagno
            ]
            windows = [
                Window(x=wt, y=l/2-1.5, w=3.0, rot=90),  # Mega vetrata Ovest
                Window(x=w-bw/2-0.5, y=l-wt, w=1.0, rot=0) # Finestrella Bagno
            ]
            
            # Arredi Open Space
            # 1. Zona Notte (In alto a sinistra)
            furniture.append(FurnitureItem(type="bed", x=wt*2, y=l-2.1-wt*2, w=1.8, h=2.1, rot=0))
            # 2. Cucina (Isola centrale)
            furniture.append(FurnitureItem(type="kitchen_counter", x=w/2-1.2, y=l/2-0.5, w=2.4, h=1.0, rot=0))
            # 3. Zona Living (In basso)
            furniture.append(FurnitureItem(type="sofa", x=wt*2, y=1.0, w=2.2, h=0.9, rot=0))
            furniture.append(FurnitureItem(type="tv", x=wt*2+0.3, y=wt, w=1.6, h=0.2, rot=0))
            # 4. Bagno
            furniture.append(FurnitureItem(type="shower", x=w-wt-0.9, y=l-bh+wt*2, w=0.9, h=0.9, rot=0))
            furniture.append(FurnitureItem(type="toilet", x=w-wt-0.5, y=l-wt-0.7, w=0.5, h=0.7, rot=0))

        # ---------------------------------------------------------
        # LAYOUT 3: APPARTAMENTO COMPLETO (4 Stanze divise a croce)
        # ---------------------------------------------------------
        else:
            cx = w * 0.55
            cy = l * 0.55
            
            # 1. Stanze perfette
            rooms = [
                Room(id=1, name="Soggiorno", x=0, y=0, w=cx, h=cy, color="#f8fafc"),
                Room(id=2, name="Cucina", x=0, y=cy, w=cx, h=l-cy, color="#f1f5f9"),
                Room(id=3, name="Camera", x=cx, y=0, w=w-cx, h=cy, color="#f8fafc"),
                Room(id=4, name="Bagno", x=cx, y=cy, w=w-cx, h=l-cy, color="#f1f5f9"),
            ]

            # 2. Muri (Perimetro + Croce centrale)
            walls = [
                Wall(x=0, y=0, w=w, h=wt), Wall(x=0, y=l-wt, w=w, h=wt),
                Wall(x=0, y=0, w=wt, h=l), Wall(x=w-wt, y=0, w=wt, h=l),
                Wall(x=cx, y=0, w=wt, h=l),  # Muro Spina Verticale
                Wall(x=0, y=cy, w=w, h=wt),  # Muro Spina Orizzontale
            ]

            # 3. Porte comunicanti nei muri interni
            doors = [
                Door(x=cx/2 - 0.45, y=0, w=0.9, rot=0, openDir=1),      # Ingresso in Soggiorno
                Door(x=cx/2 - 0.45, y=cy, w=0.9, rot=0, openDir=-1),    # Soggiorno -> Cucina
                Door(x=cx, y=cy/2 - 0.45, w=0.9, rot=90, openDir=1),    # Soggiorno -> Camera
                Door(x=cx + (w-cx)/2 - 0.45, y=cy, w=0.9, rot=0, openDir=-1) # Camera -> Bagno
            ]

            # 4. Finestre rigorosamente sui muri esterni
            windows = [
                Window(x=wt, y=cy/2-0.75, w=1.5, rot=90),       # Soggiorno (Ovest)
                Window(x=wt, y=cy+(l-cy)/2-0.6, w=1.2, rot=90), # Cucina (Ovest)
                Window(x=w-wt, y=cy/2-0.6, w=1.2, rot=90),      # Camera (Est)
                Window(x=w-wt, y=cy+(l-cy)/2-0.4, w=0.8, rot=90)# Bagno (Est)
            ]

            # 5. Arredi geometricamente confinati (Appoggiati ai muri)
            furniture = [
                # Soggiorno (Divano a Ovest, TV a Est sul tramezzo)
                FurnitureItem(type="sofa", x=wt*2, y=cy/2-0.45, w=0.9, h=2.2, rot=0),
                FurnitureItem(type="tv", x=cx-wt-0.2, y=cy/2-0.75, w=0.2, h=1.5, rot=0),
                
                # Cucina (Piano lavoro in alto, tavolo al centro)
                FurnitureItem(type="kitchen_counter", x=wt, y=l-wt-0.6, w=cx-wt*2, h=0.6, rot=0),
                FurnitureItem(type="table", x=cx/2-0.8, y=cy+wt*3, w=1.6, h=0.9, rot=0),
                
                # Camera (Letto centrato in alto, comodini impliciti)
                FurnitureItem(type="bed", x=cx+wt*2, y=wt, w=1.8, h=2.1, rot=0),
                
                # Bagno (Doccia all'angolo Est-Sud, WC e Lavandino sui muri)
                FurnitureItem(type="shower", x=w-wt-0.9, y=l-wt-0.9, w=0.9, h=0.9, rot=0),
                FurnitureItem(type="toilet", x=cx+wt, y=l-wt-0.7, w=0.5, h=0.7, rot=0),
                FurnitureItem(type="sink", x=w-wt-0.6, y=cy+wt+0.5, w=0.6, h=0.8, rot=0),
            ]

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