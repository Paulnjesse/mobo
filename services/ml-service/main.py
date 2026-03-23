"""
MOBO ML Fraud Detection Service
FastAPI microservice providing real-time fraud scoring for:
  1. GPS spoofing (Isolation Forest on trajectory features)
  2. Payment fraud (Gradient Boosting on payment velocity features)
  3. Ride collusion (Random Forest on behavioral features)
  4. Account takeover (anomaly detection on auth patterns)
"""

import os
import time
import numpy as np
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
import joblib
from pathlib import Path

from models.fraud_detector import FraudDetector
from models.gps_anomaly import GPSAnomalyDetector
from models.payment_scorer import PaymentFraudScorer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mobo.ml")

# ── Metrics ──────────────────────────────────────────────────────────────────
SCORE_COUNTER   = Counter("ml_fraud_scores_total", "Total fraud scoring requests", ["type", "verdict"])
SCORE_LATENCY   = Histogram("ml_fraud_score_latency_seconds", "Scoring latency", ["type"])
FLAG_COUNTER    = Counter("ml_fraud_flags_total", "Total fraud flags raised", ["type", "severity"])

# ── Global model instances ────────────────────────────────────────────────────
gps_model:     GPSAnomalyDetector  = None
payment_model: PaymentFraudScorer  = None
fraud_model:   FraudDetector       = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global gps_model, payment_model, fraud_model
    logger.info("[ML Service] Loading models...")
    gps_model     = GPSAnomalyDetector()
    payment_model = PaymentFraudScorer()
    fraud_model   = FraudDetector()
    gps_model.load_or_train()
    payment_model.load_or_train()
    fraud_model.load_or_train()
    logger.info("[ML Service] All models ready.")
    yield
    logger.info("[ML Service] Shutdown.")

app = FastAPI(title="MOBO ML Fraud Detection", version="1.0.0", lifespan=lifespan)

# ── Request / Response schemas ────────────────────────────────────────────────

class GPSScoringRequest(BaseModel):
    user_id: str
    ride_id: Optional[str] = None
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    timestamp_ms: int
    prev_lat: Optional[float] = None
    prev_lng: Optional[float] = None
    prev_timestamp_ms: Optional[int] = None
    speed_kmh: Optional[float] = None        # device-reported speed
    accuracy_m: Optional[float] = None       # GPS accuracy in metres
    trajectory_window: Optional[List[dict]] = None  # last N GPS points

class PaymentScoringRequest(BaseModel):
    user_id: str
    ride_id: Optional[str] = None
    amount_xaf: float
    method: str
    device_fingerprint: Optional[str] = None
    ip_address: Optional[str] = None
    # Historical context (injected by payment-service)
    payments_last_1h: int = 0
    payments_last_24h: int = 0
    failed_attempts_last_1h: int = 0
    avg_amount_30d: Optional[float] = None
    new_device: bool = False
    new_location: bool = False
    account_age_days: int = 365

class RideCollusionRequest(BaseModel):
    ride_id: str
    driver_id: str
    rider_id: str
    driver_device_id: Optional[str] = None
    rider_device_id: Optional[str] = None
    driver_ip: Optional[str] = None
    rider_ip: Optional[str] = None
    # Historical pair metrics
    pair_rides_7d: int = 0
    pair_rides_30d: int = 0
    driver_avg_route_deviation: Optional[float] = None   # % deviation from expected route
    pickup_dropoff_distance_km: Optional[float] = None
    time_of_day_hour: Optional[int] = None

class FraudScoreResponse(BaseModel):
    fraud_score: float = Field(..., ge=0.0, le=1.0, description="0=clean, 1=definite fraud")
    verdict: str         # 'clean' | 'review' | 'block'
    severity: str        # 'low' | 'medium' | 'high' | 'critical'
    signals: List[str]   # human-readable reasons
    model_version: str
    latency_ms: float

# ── Helper ────────────────────────────────────────────────────────────────────

def score_to_verdict(score: float) -> tuple[str, str]:
    """Convert numeric score to verdict + severity."""
    if score < 0.3:
        return "clean",  "low"
    elif score < 0.55:
        return "review", "medium"
    elif score < 0.8:
        return "review", "high"
    else:
        return "block",  "critical"

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "healthy", "service": "mobo-ml-service", "models_loaded": all([gps_model, payment_model, fraud_model])}

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/score/gps", response_model=FraudScoreResponse)
def score_gps(req: GPSScoringRequest):
    t0 = time.time()
    try:
        score, signals = gps_model.score(req.model_dump())
        verdict, severity = score_to_verdict(score)
        latency = (time.time() - t0) * 1000
        SCORE_COUNTER.labels(type="gps", verdict=verdict).inc()
        SCORE_LATENCY.labels(type="gps").observe(latency / 1000)
        if verdict != "clean":
            FLAG_COUNTER.labels(type="gps_spoofing", severity=severity).inc()
        return FraudScoreResponse(
            fraud_score=round(score, 4),
            verdict=verdict, severity=severity,
            signals=signals, model_version=gps_model.version,
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error(f"[GPS Score] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/score/payment", response_model=FraudScoreResponse)
def score_payment(req: PaymentScoringRequest):
    t0 = time.time()
    try:
        score, signals = payment_model.score(req.model_dump())
        verdict, severity = score_to_verdict(score)
        latency = (time.time() - t0) * 1000
        SCORE_COUNTER.labels(type="payment", verdict=verdict).inc()
        SCORE_LATENCY.labels(type="payment").observe(latency / 1000)
        if verdict != "clean":
            FLAG_COUNTER.labels(type="payment_fraud", severity=severity).inc()
        return FraudScoreResponse(
            fraud_score=round(score, 4),
            verdict=verdict, severity=severity,
            signals=signals, model_version=payment_model.version,
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error(f"[Payment Score] Error: {e}")
        raise HTTPException(status_code=500, detail=500)

@app.post("/score/collusion", response_model=FraudScoreResponse)
def score_collusion(req: RideCollusionRequest):
    t0 = time.time()
    try:
        score, signals = fraud_model.score_collusion(req.model_dump())
        verdict, severity = score_to_verdict(score)
        latency = (time.time() - t0) * 1000
        SCORE_COUNTER.labels(type="collusion", verdict=verdict).inc()
        SCORE_LATENCY.labels(type="collusion").observe(latency / 1000)
        if verdict != "clean":
            FLAG_COUNTER.labels(type="ride_collusion", severity=severity).inc()
        return FraudScoreResponse(
            fraud_score=round(score, 4),
            verdict=verdict, severity=severity,
            signals=signals, model_version=fraud_model.version,
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error(f"[Collusion Score] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/retrain")
def trigger_retrain(request: Request):
    """Trigger model retraining from latest labeled data. Protected by internal key."""
    key = request.headers.get("X-Internal-Service-Key")
    if key != os.getenv("INTERNAL_SERVICE_KEY", ""):
        raise HTTPException(status_code=403, detail="Forbidden")
    # In production: enqueue a background retraining job
    gps_model.load_or_train(force=True)
    payment_model.load_or_train(force=True)
    fraud_model.load_or_train(force=True)
    return {"retrained": True}
