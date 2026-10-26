"""
Backend Python per la Generazione Gratuita di Piante tramite AI.
Ospitabile gratuitamente su:
 - Hugging Face Spaces (Docker / FastAPI SDK)
 - Render.com (Web Service Gratuito)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import math

app = FastAPI(
    title="Open FloorPlan Generator API",
    description="API Gratuita basata su algoritmi di layout procedurale e Modelli AI Open-Source",
    version="1.0.0"
)

# Abilita le chiamate dal Frontend Vercel (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    border: str

class FurnitureItem(BaseModel):
    name: str
    x: float
    y: float
    type: str

class PlanResponse(BaseModel):
    dimensions: dict
    svgWidth: float
    svgHeight: float
    rooms: List[Room]
    furniture: List[FurnitureItem]

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "AI Floor Plan Backend operational. Send POST requests to /generate-plan"
    }

@app.post("/generate-plan", response_model=PlanResponse)
def generate_floor_plan(request: PlanRequest):
    """
    Genera la disposizione ottimizzata in base alle dimensioni ricevute.
    Se integrato con modelli AI come HouseDiffusion o Graph2Plan, qui avviene l'inference del modello.
    """
    try:
        w = max(2.0, request.width)
        l = max(2.0, request.length)
        scale = 25.0  # pixel per meter scale factor

        # Algoritmo di Generazione procedurale dei vani (Adattabile ad AI Inference)
        rooms = []
        furniture = []

        if request.room_type == "single-room" or request.num_rooms == 1:
            rooms.append(Room(
                id=1, name="Stanza Principale",
                x=0, y=0, w=w, h=l,
                color="rgba(59, 130, 246, 0.15)", border="#3b82f6"
            ))
            furniture.append(FurnitureItem(name="Scrivania", x=w*0.1, y=l*0.1, type="desk"))
            furniture.append(FurnitureItem(name="Letto", x=w*0.6, y=l*0.6, type="bed"))

        else:
            # Suddivisione razionale standard per Appartamenti
            rooms.append(Room(
                id=1, name="Soggiorno / Living",
                x=0, y=0, w=w*0.6, h=l*0.5,
                color="rgba(59, 130, 246, 0.15)", border="#3b82f6"
            ))
            rooms.append(Room(
                id=2, name="Cucina",
                x=w*0.6, y=0, w=w*0.4, h=l*0.4,
                color="rgba(16, 185, 129, 0.15)", border="#10b981"
            ))
            rooms.append(Room(
                id=3, name="Camera da Letto",
                x=0, y=l*0.5, w=w*0.5, h=l*0.5,
                color="rgba(139, 92, 246, 0.15)", border="#8b5cf6"
            ))
            rooms.append(Room(
                id=4, name="Bagno",
                x=w*0.5, y=l*0.4, w=w*0.5, h=l*0.3,
                color="rgba(245, 158, 11, 0.15)", border="#f59e0b"
            ))

            if request.num_rooms > 4:
                rooms.append(Room(
                    id=5, name="Studio / Ingresso",
                    x=w*0.5, y=l*0.7, w=w*0.5, h=l*0.3,
                    color="rgba(107, 114, 128, 0.15)", border="#6b7280"
                ))

            # Arredi di prova inseriti nelle posizioni calcolate
            furniture.extend([
                FurnitureItem(name="Divano", x=w*0.1, y=l*0.1, type="sofa"),
                FurnitureItem(name="Tavolo", x=w*0.65, y=l*0.1, type="table"),
                FurnitureItem(name="Letto Matrimoniale", x=w*0.1, y=l*0.6, type="bed"),
            ])

        return PlanResponse(
            dimensions={"width": w, "length": l},
            svgWidth=w * scale,
            svgHeight=l * scale,
            rooms=rooms,
            furniture=furniture
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))