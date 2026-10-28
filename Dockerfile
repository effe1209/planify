# Backend Planify (FastAPI). Funziona su Hugging Face Spaces (porta 7860) e su Render (porta in $PORT).
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# main.py espone l'API, planner.py è il motore: servono entrambi
COPY main.py planner.py ./

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
