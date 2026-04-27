FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Create model directory and run as non-root
RUN mkdir -p /tmp/models && \
    groupadd -r appgroup && useradd -r -g appgroup appuser && \
    chown -R appuser:appgroup /app /tmp/models

USER appuser

EXPOSE 8000

# Uvicorn with multiple workers for production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-level", "info"]
