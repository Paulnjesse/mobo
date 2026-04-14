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
import asyncio
import threading
import numpy as np
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
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

# ── Internal service authentication ──────────────────────────────────────────
# All scoring endpoints require the same X-Internal-Service-Key shared secret
# used by every other MOBO service for inter-service auth.  The key is injected
# at deploy time via the INTERNAL_SERVICE_KEY environment variable.
#
# /health and /metrics are intentionally left open for load balancers and
# Prometheus scrapers which cannot inject service keys.

_INTERNAL_KEY_HEADER = APIKeyHeader(name="X-Internal-Service-Key", auto_error=False)

def require_internal_key(key: str = Depends(_INTERNAL_KEY_HEADER)) -> None:
    expected = os.getenv("INTERNAL_SERVICE_KEY", "")
    if not expected:
        # INTERNAL_SERVICE_KEY not configured — log a warning but allow through.
        # This keeps local dev (no secrets set) working without extra setup.
        logger.warning(
            "[ML Service] INTERNAL_SERVICE_KEY is not set — "
            "scoring endpoints are unprotected. Set this in production."
        )
        return
    if not key or key != expected:
        raise HTTPException(status_code=403, detail="Forbidden")

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
def score_gps(req: GPSScoringRequest, _auth: None = Depends(require_internal_key)):
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
def score_payment(req: PaymentScoringRequest, _auth: None = Depends(require_internal_key)):
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
def score_collusion(req: RideCollusionRequest, _auth: None = Depends(require_internal_key)):
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
    gps_model.load_or_train(force=True)
    payment_model.load_or_train(force=True)
    fraud_model.load_or_train(force=True)
    feedback_store.clear()
    logger.info("[ML Service] Retrain complete. Feedback store cleared.")
    return {"retrained": True, "feedback_consumed": 0}

# ── Feedback store & auto-retrain loop ───────────────────────────────────────
# Labeled samples submitted by ride/payment services after human review.
# When enough accumulate the models are retrained automatically.

import json
from pydantic import field_validator

FEEDBACK_FILE = os.getenv("FEEDBACK_STORE_PATH", "/tmp/mobo_ml_feedback.jsonl")
RETRAIN_THRESHOLD = int(os.getenv("RETRAIN_THRESHOLD", "50"))  # full batch retrain every N samples

# Prevent concurrent full retraining runs
_retrain_lock = threading.Lock()

# In-memory accumulator — persisted to FEEDBACK_FILE for crash recovery
feedback_store: list = []

try:
    if os.path.exists(FEEDBACK_FILE):
        with open(FEEDBACK_FILE) as f:
            feedback_store = [json.loads(l) for l in f if l.strip()]
        logger.info(f"[ML Service] Loaded {len(feedback_store)} existing feedback samples.")
except Exception as e:
    logger.warning(f"[ML Service] Could not load feedback store: {e}")

class FeedbackSample(BaseModel):
    """Labeled sample submitted after human review of a flagged event."""
    event_type: str          # 'gps' | 'payment' | 'collusion'
    event_id: str            # ride_id or payment_id
    features: dict           # raw features used during original scoring
    label: str               # 'fraud' | 'legitimate' | 'uncertain'
    reviewer_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("event_type")
    @classmethod
    def valid_event_type(cls, v):
        if v not in ("gps", "payment", "collusion"):
            raise ValueError("event_type must be gps, payment, or collusion")
        return v

    @field_validator("label")
    @classmethod
    def valid_label(cls, v):
        if v not in ("fraud", "legitimate", "uncertain"):
            raise ValueError("label must be fraud, legitimate, or uncertain")
        return v

def _extract_features_for_type(event_type: str, features: dict):
    """Extract numpy feature vector from raw features dict for a given model type."""
    import numpy as np
    from models.gps_anomaly import extract_features as gps_extract
    from models.fraud_detector import extract_collusion_features
    from models.payment_scorer import extract_features as pay_extract
    try:
        if event_type == "gps":
            return gps_extract(features)
        elif event_type == "collusion":
            return extract_collusion_features(features)
        elif event_type == "payment":
            return pay_extract(features)
    except Exception as e:
        logger.warning(f"[Feedback] Feature extraction failed for {event_type}: {e}")
    return None

def _background_full_retrain():
    """Full batch retrain — run in a thread so it never blocks the API."""
    if not _retrain_lock.acquire(blocking=False):
        logger.info("[Feedback] Retrain already in progress — skipping.")
        return
    try:
        logger.info("[Feedback] Starting full batch retrain...")
        gps_model.load_or_train(force=True)
        payment_model.load_or_train(force=True)
        fraud_model.load_or_train(force=True)
        feedback_store.clear()
        open(FEEDBACK_FILE, "w").close()
        logger.info("[Feedback] Full batch retrain complete. Feedback store cleared.")
    except Exception as e:
        logger.error(f"[Feedback] Full batch retrain failed: {e}")
    finally:
        _retrain_lock.release()

@app.post("/feedback", status_code=202)
async def submit_feedback(
    sample: FeedbackSample,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """
    Accept a labeled fraud sample.
    Protected by internal service key.

    Behaviour (Uber-style near-real-time loop):
      1. Immediately calls partial_fit on the matching model's online learner —
         the model is updated before this response is returned (sub-millisecond).
      2. Persists the sample to disk for crash recovery.
      3. When RETRAIN_THRESHOLD samples accumulate, schedules a full batch
         retrain as a FastAPI BackgroundTask (non-blocking, runs after response).
    """
    key = request.headers.get("X-Internal-Service-Key")
    if key != os.getenv("INTERNAL_SERVICE_KEY", ""):
        raise HTTPException(status_code=403, detail="Forbidden")

    record = sample.model_dump()
    record["submitted_at"] = time.time()
    feedback_store.append(record)

    # ── 1. Immediate online update (partial_fit) ──────────────────────────────
    label_int = 1 if sample.label == "fraud" else 0
    feats = _extract_features_for_type(sample.event_type, sample.features)
    if feats is not None:
        try:
            if sample.event_type == "gps":
                gps_model.partial_fit(feats, label_int)
            elif sample.event_type == "collusion":
                fraud_model.partial_fit(feats, label_int)
            elif sample.event_type == "payment":
                payment_model.partial_fit(feats, label_int)
            logger.info(
                f"[Feedback] partial_fit applied — {sample.event_type}/{sample.event_id} "
                f"label={sample.label}"
            )
        except Exception as e:
            logger.warning(f"[Feedback] partial_fit failed: {e}")

    # ── 2. Persist to disk ────────────────────────────────────────────────────
    try:
        with open(FEEDBACK_FILE, "a") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as e:
        logger.warning(f"[Feedback] Could not persist sample: {e}")

    pending = len(feedback_store)
    logger.info(f"[Feedback] Accepted {sample.event_type}/{sample.event_id}. Pending: {pending}")

    # ── 3. Schedule full batch retrain in background when threshold reached ───
    will_retrain = False
    if pending >= RETRAIN_THRESHOLD:
        background_tasks.add_task(
            asyncio.get_event_loop().run_in_executor, None, _background_full_retrain
        )
        will_retrain = True
        logger.info(f"[Feedback] Threshold {RETRAIN_THRESHOLD} reached — background retrain scheduled.")

    return {
        "accepted": True,
        "online_updated": feats is not None,
        "pending_samples": pending,
        "threshold": RETRAIN_THRESHOLD,
        "full_retrain_scheduled": will_retrain,
    }
