FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 7860

# Comando per avviare il server FastAPI compatibile con Hugging Face Spaces
CMD ["uvicorn", "main.py:app", "--host", "0.0.0.0", "--port", "7860"]