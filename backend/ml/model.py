"""Lightweight tree-based scoring model for attack transition prioritization."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional
import joblib
from sklearn.ensemble import HistGradientBoostingClassifier


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

    def fit(self, X: List[List[float]], y: List[int]) -> "TransitionScorer":
        """Fit model on synthetic simulation experiences."""
        self.model.fit(X, y)
        self.is_fitted = True
        return self

    def predict_score(self, features: List[float]) -> float:
        """Predict priority score in [0.0, 1.0] for a single feature vector."""
        if not self.is_fitted:
            # Fallback heuristic if not yet fitted: higher criticality, lower distance
            crit = features[0]
            dist = features[7]
            return float(crit / (dist + 1.0))
        proba = self.model.predict_proba([features])[0]
        # Return probability of positive class (label 1)
        return float(proba[1]) if len(proba) > 1 else float(proba[0])

    def predict_batch(self, feature_batch: List[List[float]]) -> List[float]:
        """Predict scores for a batch of candidate transitions."""
        if not feature_batch:
            return []
        if not self.is_fitted:
            return [self.predict_score(f) for f in feature_batch]
        probas = self.model.predict_proba(feature_batch)
        return [float(p[1]) if len(p) > 1 else float(p[0]) for p in probas]

    def save(self, path: Optional[Path] = None) -> Path:
        target = path or DEFAULT_MODEL_PATH
        target.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, target)
        return target

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "TransitionScorer":
        target = path or DEFAULT_MODEL_PATH
        if not target.exists():
            return cls()
        model = joblib.load(target)
        scorer = cls(model=model)
        scorer.is_fitted = True
        return scorer
