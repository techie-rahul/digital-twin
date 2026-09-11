"""Lightweight tree-based scoring model for attack transition prioritization."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, roc_auc_score


DEFAULT_MODEL_PATH = Path(__file__).parent / "weights" / "transition_scorer.joblib"


class TransitionScorer:
    """Predicts likelihood that a feasible transition leads to the crown jewel."""

    def __init__(self, model: Optional[HistGradientBoostingClassifier] = None):
        self.model = model or HistGradientBoostingClassifier(
            max_iter=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        self.is_fitted = False
        self.metadata: Dict[str, Any] = {
            "model_type": "HistGradientBoostingClassifier",
            "train_samples": 0,
            "test_accuracy": 0.0,
            "test_roc_auc": 0.0,
        }

    def fit(
        self,
        X_train: List[List[float]],
        y_train: List[int],
        X_val: Optional[List[List[float]]] = None,
        y_val: Optional[List[int]] = None,
    ) -> "TransitionScorer":
        """Fit model on synthetic simulation experiences and evaluate on validation split."""
        self.model.fit(X_train, y_train)
        self.is_fitted = True
        self.metadata["train_samples"] = len(X_train)

        if X_val and y_val and len(set(y_val)) > 1:
            y_pred = self.model.predict(X_val)
            y_proba = self.model.predict_proba(X_val)[:, 1]
            self.metadata["test_accuracy"] = round(float(accuracy_score(y_val, y_pred)), 4)
            self.metadata["test_roc_auc"] = round(float(roc_auc_score(y_val, y_proba)), 4)
        return self

    def predict_score(self, features: List[float]) -> float:
        """Predict priority score in [0.0, 1.0] for a single feature vector."""
        if not self.is_fitted:
            # Fallback heuristic if not fitted: high destination criticality, lower distance
            crit = features[0] if len(features) > 0 else 1.0
            dist = features[9] if len(features) > 9 else 8.0
            return float(crit / (dist + 1.0))
        try:
            proba = self.model.predict_proba([features])[0]
            return float(proba[1]) if len(proba) > 1 else float(proba[0])
        except Exception:
            # Safe analytical fallback on any evaluation exception
            crit = features[0] if len(features) > 0 else 1.0
            dist = features[9] if len(features) > 9 else 8.0
            return float(crit / (dist + 1.0))

    def predict_batch(self, feature_batch: List[List[float]]) -> List[float]:
        """Predict scores for a batch of candidate transitions."""
        if not feature_batch:
            return []
        if not self.is_fitted:
            return [self.predict_score(f) for f in feature_batch]
        try:
            probas = self.model.predict_proba(feature_batch)
            return [float(p[1]) if len(p) > 1 else float(p[0]) for p in probas]
        except Exception:
            return [self.predict_score(f) for f in feature_batch]

    def save(self, path: Optional[Path] = None) -> Path:
        target = path or DEFAULT_MODEL_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model": self.model,
            "metadata": self.metadata,
        }
        joblib.dump(payload, target)
        return target

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "TransitionScorer":
        target = path or DEFAULT_MODEL_PATH
        if not target.exists():
            return cls()
        try:
            data = joblib.load(target)
            if isinstance(data, dict) and "model" in data:
                scorer = cls(model=data["model"])
                scorer.metadata = data.get("metadata", {})
                scorer.is_fitted = True
                return scorer
            else:
                # Raw model fallback
                scorer = cls(model=data)
                scorer.is_fitted = True
                return scorer
        except Exception:
            # Graceful fallback: unfitted instance using analytical heuristic
            return cls()
