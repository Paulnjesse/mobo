"""
GPS Anomaly Detector
Uses Isolation Forest to detect GPS spoofing patterns.

Features engineered from GPS trajectory:
  - speed_kmh:          speed between consecutive points
  - acceleration:       change in speed per second
  - bearing_change:     direction change in degrees
  - time_gap_sec:       time between GPS updates
  - distance_km:        distance between consecutive points
  - jitter_score:       GPS accuracy variance
  - out_of_bounds:      outside known operating area
  - teleport_flag:      >50km jump in <30s
"""

import numpy as np
import joblib
import os
import math
import logging
from pathlib import Path
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import SGDOneClassSVM
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger("mobo.ml.gps")

MODEL_PATH  = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "gps_isolation_forest.joblib"
SCALER_PATH = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "gps_scaler.joblib"

# Cameroon + CEMAC bounding box
BOUNDS = dict(min_lat=1.6, max_lat=13.1, min_lng=8.4, max_lng=16.2)

def haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def bearing(lat1, lng1, lat2, lng2):
    dlng = math.radians(lng2 - lng1)
    x = math.sin(dlng) * math.cos(math.radians(lat2))
    y = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360

def extract_features(data: dict) -> np.ndarray:
    lat, lng = data["lat"], data["lng"]
    ts  = data.get("timestamp_ms", 0)
    prev_lat = data.get("prev_lat")
    prev_lng = data.get("prev_lng")
    prev_ts  = data.get("prev_timestamp_ms")

    speed_kmh       = 0.0
    acceleration    = 0.0
    bearing_change  = 0.0
    distance_km     = 0.0
    time_gap_sec    = 0.0
    teleport_flag   = 0.0
    out_of_bounds   = float(
        lat < BOUNDS["min_lat"] or lat > BOUNDS["max_lat"] or
        lng < BOUNDS["min_lng"] or lng > BOUNDS["max_lng"]
    )
    device_speed    = float(data.get("speed_kmh") or 0)
    accuracy_m      = float(data.get("accuracy_m") or 5)
    jitter_score    = max(0.0, (accuracy_m - 5) / 50)  # normalise: 5m=0, 55m=1

    if prev_lat is not None and prev_lng is not None and prev_ts is not None:
        delta_sec  = max((ts - prev_ts) / 1000.0, 0.001)
        time_gap_sec  = delta_sec
        distance_km   = haversine_km(prev_lat, prev_lng, lat, lng)
        speed_kmh     = (distance_km / delta_sec) * 3600
        b_new         = bearing(prev_lat, prev_lng, lat, lng)
        b_old         = bearing(prev_lat, prev_lng, lat, lng)
        bearing_change = abs(b_new - b_old)
        if bearing_change > 180:
            bearing_change = 360 - bearing_change
        # speed discrepancy: device says X but GPS math says Y
        acceleration  = abs(speed_kmh - device_speed) if device_speed > 0 else 0.0
        teleport_flag = float(distance_km > 50 and delta_sec < 30)

    return np.array([
        min(speed_kmh, 300),     # cap at 300 to bound outliers
        min(acceleration, 200),
        bearing_change,
        time_gap_sec,
        distance_km,
        jitter_score,
        out_of_bounds,
        teleport_flag,
        device_speed,
    ], dtype=np.float32)

def _generate_training_data(n_clean=5000, n_fraud=500) -> np.ndarray:
    """Generate synthetic training data for initial model fitting."""
    rng = np.random.default_rng(42)

    # Clean GPS updates: low speed, consistent movement
    clean = rng.normal(
        loc=[30, 5, 20, 5, 0.15, 0.1, 0, 0, 28],
        scale=[20, 4, 15, 2, 0.1, 0.1, 0, 0, 18],
        size=(n_clean, 9)
    ).clip(0)

    # Fraudulent GPS: high speed, teleportation, out-of-bounds
    fraud_teleport = rng.normal(
        loc=[280, 100, 90, 2, 55, 0.3, 0.3, 1, 5],
        scale=[20, 30, 30, 1, 10, 0.2, 0.4, 0, 5],
        size=(n_fraud // 2, 9)
    ).clip(0)
    fraud_speed = rng.normal(
        loc=[260, 80, 30, 5, 35, 0.4, 0.1, 0, 10],
        scale=[30, 20, 20, 2, 15, 0.2, 0.3, 0, 8],
        size=(n_fraud // 2, 9)
    ).clip(0)

    return np.vstack([clean, fraud_teleport, fraud_speed])

class GPSAnomalyDetector:
    version = "1.0.0-iforest"

    ONLINE_MODEL_PATH = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "gps_online_sgd.joblib"

    def __init__(self):
        self.model        = None   # batch: IsolationForest
        self.scaler       = None
        self.online_model = None   # online: SGDOneClassSVM — supports partial_fit
        self._online_samples = 0

    def load_or_train(self, force=False):
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not force and MODEL_PATH.exists() and SCALER_PATH.exists():
            self.model  = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            logger.info("[GPSAnomalyDetector] Loaded from disk.")
        else:
            logger.info("[GPSAnomalyDetector] Training Isolation Forest...")
            X = _generate_training_data()
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            self.model = IsolationForest(
                n_estimators=200,
                contamination=0.08,
                max_features=0.8,
                random_state=42,
                n_jobs=-1,
            )
            self.model.fit(X_scaled)
            joblib.dump(self.model,  MODEL_PATH)
            joblib.dump(self.scaler, SCALER_PATH)
            logger.info("[GPSAnomalyDetector] Trained and saved.")
        # Load or initialise online model
        if not force and self.ONLINE_MODEL_PATH.exists():
            self.online_model = joblib.load(self.ONLINE_MODEL_PATH)
        else:
            self.online_model = SGDOneClassSVM(nu=0.08, random_state=42)

    def partial_fit(self, features: np.ndarray, label: int):
        """Incrementally update the online model with a single labeled sample.
        label: 1=fraud (anomaly), 0=legitimate.
        SGDOneClassSVM.partial_fit expects X only (unsupervised), so we feed
        confirmed anomalies to push the decision boundary.
        """
        if self.scaler is None:
            return
        X_scaled = self.scaler.transform(features.reshape(1, -1))
        # Initialise online model on first sample using batch scaler's feature count
        if self._online_samples == 0:
            self.online_model.fit(X_scaled)
        else:
            self.online_model.partial_fit(X_scaled)
        self._online_samples += 1
        try:
            joblib.dump(self.online_model, self.ONLINE_MODEL_PATH)
        except Exception as e:
            logger.warning(f"[GPSAnomalyDetector] Could not save online model: {e}")

    def score(self, data: dict) -> tuple[float, list]:
        feats = extract_features(data)
        signals = []

        # Rule-based hard signals (fast path, no ML needed)
        if feats[7] > 0.5:   # teleport_flag
            signals.append("teleportation_detected")
            return 0.95, signals
        if feats[0] > 250:   # speed_kmh
            signals.append(f"impossible_speed_{int(feats[0])}kmh")
        if feats[6] > 0.5:   # out_of_bounds
            signals.append("coordinates_out_of_bounds")

        # Batch ML score (IsolationForest)
        if self.model and self.scaler:
            X = self.scaler.transform(feats.reshape(1, -1))
            raw = self.model.decision_function(X)[0]
            batch_score = float(np.clip(0.5 - raw, 0, 1))
        else:
            batch_score = 0.0

        # Online model score (SGDOneClassSVM) — blended in when warmed up
        online_score = 0.0
        if self.online_model and self._online_samples >= 5 and self.scaler:
            X = self.scaler.transform(feats.reshape(1, -1))
            raw_online = self.online_model.decision_function(X)[0]
            online_score = float(np.clip(0.5 - raw_online, 0, 1))

        # Blend: weight online model more as it accumulates real labels
        online_weight = min(0.4, self._online_samples / 100 * 0.4)
        ml_score = (1 - online_weight) * batch_score + online_weight * online_score

        if ml_score > 0.6:
            signals.append(f"ml_anomaly_score_{ml_score:.2f}")

        combined = max(ml_score, 0.9 if feats[7] > 0.5 else 0.0)
        if feats[0] > 250:
            combined = max(combined, 0.8)

        return float(np.clip(combined, 0, 1)), signals
