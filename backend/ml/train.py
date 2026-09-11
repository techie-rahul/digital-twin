"""Offline training script for the Digital Twin transition scoring heuristic."""
from __future__ import annotations

import time
from backend.ml.dataset import generate_synthetic_experiences
from backend.ml.model import TransitionScorer


def train_heuristic_model() -> TransitionScorer:
    """Generate experiences and train transition scoring model."""
    print("[1/3] Generating synthetic simulation experiences from Digital Twin...")
    start_t = time.time()
    X, y = generate_synthetic_experiences(num_variations=30, seed=42)
    gen_duration = time.time() - start_t
    print(f"      Generated {len(X)} state-transition pairs in {gen_duration:.2f}s.")
    print(f"      Positive samples (on winning paths): {sum(y)} / {len(y)}")

    print("[2/3] Training HistGradientBoostingClassifier model...")
    scorer = TransitionScorer()
    train_start = time.time()
    scorer.fit(X, y)
    train_duration = time.time() - train_start
    print(f"      Model trained in {train_duration:.2f}s.")

    print("[3/3] Saving model weights...")
    saved_path = scorer.save()
    print(f"      Saved model to: {saved_path}")

    return scorer


if __name__ == "__main__":
    train_heuristic_model()
