"""
Payment Fraud Scorer
Gradient Boosting classifier on payment velocity and behavioural features.

Features:
  - amount_normalised:      amount vs user's 30-day average
  - velocity_1h:            payments in last hour
  - velocity_24h:           payments in last 24h
  - failed_ratio_1h:        failed attempts / total attempts in last hour
  - new_device:             first time seeing this device fingerprint
  - new_location:           IP geolocation differs from usual
  - account_age_days:       how long the account has existed
  - method_risk:            risk score per payment method
"""

import numpy as np
import joblib
import logging
from pathlib import Path
import os
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger("mobo.ml.payment")

MODEL_PATH  = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "payment_gbm.joblib"
SCALER_PATH = Path(os.getenv("MODEL_DIR", "/tmp/models")) / "payment_scaler.joblib"

METHOD_RISK = {
    "card":            0.3,
    "mtn_mobile_money": 0.2,
    "orange_money":    0.2,
    "wave":            0.15,
    "wallet":          0.1,
    "cash":            0.05,
}

def extract_features(data: dict) -> np.ndarray:
    amount        = float(data.get("amount_xaf", 0))
    avg_amount    = float(data.get("avg_amount_30d") or amount or 1000)
    amount_norm   = amount / max(avg_amount, 1)

    vel_1h        = int(data.get("payments_last_1h", 0))
    vel_24h       = int(data.get("payments_last_24h", 0))
    failed_1h     = int(data.get("failed_attempts_last_1h", 0))
    failed_ratio  = failed_1h / max(vel_1h + failed_1h, 1)

    new_device    = float(data.get("new_device", False))
    new_location  = float(data.get("new_location", False))
    acct_age      = min(int(data.get("account_age_days", 365)), 1825) / 1825  # norm to 5yr

    method        = data.get("method", "card")
    method_risk   = METHOD_RISK.get(method, 0.3)

    return np.array([
        min(amount_norm, 10),   # cap at 10x average
        min(vel_1h, 20),
        min(vel_24h, 100),
        failed_ratio,
        new_device,
        new_location,
        acct_age,
        method_risk,
    ], dtype=np.float32)

def _generate_training_data(n_clean=8000, n_fraud=800):
    rng = np.random.default_rng(42)
    # Clean payments: normal amounts, low velocity
    clean = np.column_stack([
        rng.lognormal(0, 0.3, n_clean),     # amount_norm ~1.0
        rng.poisson(0.5, n_clean),           # vel_1h
        rng.poisson(3, n_clean),             # vel_24h
        rng.beta(1, 10, n_clean),            # failed_ratio
        rng.binomial(1, 0.05, n_clean),      # new_device
        rng.binomial(1, 0.08, n_clean),      # new_location
        rng.uniform(0.3, 1, n_clean),        # acct_age
        rng.choice([0.1, 0.15, 0.2, 0.3], n_clean),  # method_risk
    ])
    y_clean = np.zeros(n_clean)

    # Fraudulent: high velocity, new device, abnormal amounts
    fraud = np.column_stack([
        rng.lognormal(1.5, 0.8, n_fraud),   # amount_norm >> 1
        rng.poisson(5, n_fraud),             # vel_1h high
        rng.poisson(15, n_fraud),            # vel_24h high
        rng.beta(3, 2, n_fraud),             # high failed_ratio
        rng.binomial(1, 0.7, n_fraud),       # new_device likely
        rng.binomial(1, 0.6, n_fraud),       # new_location likely
        rng.uniform(0, 0.2, n_fraud),        # new account
        rng.choice([0.2, 0.3], n_fraud),
    ])
    y_fraud = np.ones(n_fraud)

    X = np.vstack([clean, fraud]).astype(np.float32)
    y = np.concatenate([y_clean, y_fraud])
    return X, y

class PaymentFraudScorer:
    version = "1.0.0-gbm"

    def __init__(self):
        self.model  = None
        self.scaler = None

    def load_or_train(self, force=False):
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not force and MODEL_PATH.exists() and SCALER_PATH.exists():
            self.model  = joblib.load(MODEL_PATH)
            self.scaler = joblib.load(SCALER_PATH)
            logger.info("[PaymentFraudScorer] Loaded from disk.")
            return
        logger.info("[PaymentFraudScorer] Training GBM classifier...")
        X, y = _generate_training_data()
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        self.model = GradientBoostingClassifier(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=4,
            subsample=0.8,
            random_state=42,
        )
        self.model.fit(X_scaled, y)
        joblib.dump(self.model,  MODEL_PATH)
        joblib.dump(self.scaler, SCALER_PATH)
        logger.info("[PaymentFraudScorer] Trained and saved.")

    def score(self, data: dict) -> tuple[float, list]:
        signals = []
        feats = extract_features(data)

        # Rule-based hard signals
        if feats[0] > 5:    signals.append(f"amount_{feats[0]:.1f}x_above_average")
        if feats[1] > 3:    signals.append(f"velocity_1h_{int(feats[1])}_payments")
        if feats[3] > 0.5:  signals.append(f"high_failure_rate_{feats[3]:.0%}")
        if feats[4] > 0.5:  signals.append("new_device")
        if feats[5] > 0.5:  signals.append("new_location")
        if feats[6] < 0.01: signals.append("very_new_account")

        if self.model and self.scaler:
            X = self.scaler.transform(feats.reshape(1, -1))
            prob = float(self.model.predict_proba(X)[0][1])
        else:
            # Heuristic fallback
            prob = 0.0
            if feats[0] > 5: prob += 0.3
            if feats[1] > 3: prob += 0.2
            if feats[3] > 0.5: prob += 0.2
            if feats[4] > 0.5 and feats[5] > 0.5: prob += 0.25

        return float(np.clip(prob, 0, 1)), signals
