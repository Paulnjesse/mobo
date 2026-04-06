"""
General Fraud Detector (Ride Collusion + Account Anomalies)
Random Forest classifier for multi-signal fraud patterns.
"""

import numpy as np
import joblib
import logging
from pathlib import Path
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import SGDClassifier
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger("mobo.ml.fraud")

MODEL_PATH  = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "collusion_rf.joblib"
SCALER_PATH = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "collusion_scaler.joblib"

def extract_collusion_features(data: dict) -> np.ndarray:
    same_device  = float(
        data.get("driver_device_id") and
        data.get("rider_device_id") and
        data.get("driver_device_id") == data.get("rider_device_id")
    )
    same_ip      = float(
        data.get("driver_ip") and
        data.get("rider_ip") and
        data.get("driver_ip") == data.get("rider_ip") and
        data.get("driver_ip") not in ("127.0.0.1", "::1")
    )
    pair_7d  = min(int(data.get("pair_rides_7d", 0)), 50)
    pair_30d = min(int(data.get("pair_rides_30d", 0)), 200)
    route_dev = float(data.get("driver_avg_route_deviation") or 0.0)
    pd_dist   = float(data.get("pickup_dropoff_distance_km") or 5.0)
    hour      = int(data.get("time_of_day_hour") or 12)
    off_hours = float(hour < 5 or hour > 23)

    return np.array([
        same_device,
        same_ip,
        pair_7d,
        pair_30d,
        route_dev,
        pd_dist,
        off_hours,
    ], dtype=np.float32)

def _generate_collusion_data(n_clean=6000, n_fraud=600):
    rng = np.random.default_rng(42)
    clean = np.column_stack([
        rng.binomial(1, 0.01, n_clean),   # same_device rare
        rng.binomial(1, 0.03, n_clean),   # same_ip rare
        rng.poisson(0.5, n_clean),         # pair_7d low
        rng.poisson(1.5, n_clean),         # pair_30d low
        rng.exponential(0.1, n_clean),    # route_dev low
        rng.normal(5, 3, n_clean).clip(0.1),  # pd_dist normal
        rng.binomial(1, 0.1, n_clean),    # off_hours occasional
    ])
    y_clean = np.zeros(n_clean)

    fraud = np.column_stack([
        rng.binomial(1, 0.4, n_fraud),    # same_device frequent
        rng.binomial(1, 0.5, n_fraud),    # same_ip frequent
        rng.poisson(8, n_fraud),           # pair_7d high
        rng.poisson(25, n_fraud),          # pair_30d high
        rng.normal(0.4, 0.2, n_fraud).clip(0), # route_dev high
        rng.exponential(1, n_fraud).clip(0.1),  # pd_dist unusual
        rng.binomial(1, 0.4, n_fraud),    # off_hours frequent
    ])
    y_fraud = np.ones(n_fraud)

    X = np.vstack([clean, fraud]).astype(np.float32)
    y = np.concatenate([y_clean, y_fraud])
    return X, y

ONLINE_MODEL_PATH = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "collusion_online_sgd.joblib"

class FraudDetector:
    version = "1.0.0-rf+online"

    def __init__(self):
        self.model        = None   # batch: RandomForest
        self.scaler       = None
        self.online_model = None   # online: SGDClassifier — supports partial_fit
        self._online_samples = 0

    def load_or_train(self, force=False):
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not force and MODEL_PATH.exists() and SCALER_PATH.exists():
            self.model  = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            logger.info("[FraudDetector] Loaded from disk.")
        else:
            logger.info("[FraudDetector] Training Random Forest...")
            X, y = _generate_collusion_data()
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X)
            self.model = RandomForestClassifier(
                n_estimators=200,
                max_depth=8,
                min_samples_leaf=5,
                class_weight="balanced",
                random_state=42,
                n_jobs=-1,
            )
            self.model.fit(X_scaled, y)
            joblib.dump(self.model,  MODEL_PATH)
            joblib.dump(self.scaler, SCALER_PATH)
            logger.info("[FraudDetector] Trained and saved.")
        # Load or initialise SGD online model
        if not force and ONLINE_MODEL_PATH.exists():
            self.online_model = joblib.load(ONLINE_MODEL_PATH)
        else:
            self.online_model = SGDClassifier(
                loss="log_loss", penalty="l2", random_state=42, warm_start=True
            )

    def partial_fit(self, features: np.ndarray, label: int):
        """Incrementally update the online classifier with a single labeled sample."""
        if self.scaler is None:
            return
        X_scaled = self.scaler.transform(features.reshape(1, -1))
        self.online_model.partial_fit(X_scaled, [label], classes=[0, 1])
        self._online_samples += 1
        try:
            joblib.dump(self.online_model, ONLINE_MODEL_PATH)
        except Exception as e:
            logger.warning(f"[FraudDetector] Could not save online model: {e}")

    def score_collusion(self, data: dict) -> tuple[float, list]:
        signals = []
        feats = extract_collusion_features(data)

        if feats[0] > 0.5: signals.append("same_device_id")
        if feats[1] > 0.5: signals.append("same_ip_address")
        if feats[2] > 5:   signals.append(f"pair_rides_7d_{int(feats[2])}")
        if feats[3] > 15:  signals.append(f"pair_rides_30d_{int(feats[3])}")
        if feats[4] > 0.3: signals.append(f"route_deviation_{feats[4]:.0%}")
        if feats[6] > 0.5: signals.append("off_hours_ride")

        # Hard rule: same device = almost certain collusion
        if feats[0] > 0.5:
            return 0.97, signals

        # Batch RF score
        if self.model and self.scaler:
            X = self.scaler.transform(feats.reshape(1, -1))
            batch_prob = float(self.model.predict_proba(X)[0][1])
        else:
            batch_prob = 0.0
            if feats[1] > 0.5: batch_prob += 0.4
            if feats[2] > 5:   batch_prob += 0.3
            if feats[3] > 15:  batch_prob += 0.2

        # Online SGD score — blended in progressively as it accumulates labels
        online_prob = 0.0
        if self.online_model and self._online_samples >= 5 and self.scaler:
            try:
                X = self.scaler.transform(feats.reshape(1, -1))
                online_prob = float(self.online_model.predict_proba(X)[0][1])
            except Exception:
                pass

        online_weight = min(0.4, self._online_samples / 100 * 0.4)
        prob = (1 - online_weight) * batch_prob + online_weight * online_prob

        return float(np.clip(prob, 0, 1)), signals
