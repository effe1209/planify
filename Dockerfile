# Backend Planify (FastAPI). Funziona su Hugging Face Spaces (porta 7860) e su Render (porta in $PORT).
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# main.py espone l'API, planner.py è il motore, dxf_import.py ricostruisce le piante dai DXF di studio,
# pdf_import.py quelle dai PDF esportati da un CAD, catasto_import.py le planimetrie catastali scansionate
COPY main.py planner.py dxf_import.py pdf_import.py catasto_import.py ./

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
