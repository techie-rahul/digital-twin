"""Offline training script for the Digital Twin transition scoring heuristic."""
from __future__ import annotations

import time
from sklearn.metrics import accuracy_score, roc_auc_score
from backend.ml.dataset import generate_synthetic_experiences
from backend.ml.model import TransitionScorer


def train_heuristic_model() -> TransitionScorer:
    """Generate experiences and train transition scoring model with split validation."""
    print("================================================================")
    print(" Digital Twin ML Heuristic Training Pipeline")
    print("================================================================")
    print("[1/4] Generating synthetic simulation experiences across independent twins...")
    start_t = time.time()
    splits = generate_synthetic_experiences(
        num_train_twins=30,
        num_val_twins=8,
        num_test_twins=8,
        seed=42,
    )
    X_train, y_train = splits["train"]
    X_val, y_val = splits["val"]
    X_test, y_test = splits["test"]

    gen_duration = time.time() - start_t
    print(f"      Generation completed in {gen_duration:.2f}s.")
    print(f"      Train set: {len(X_train)} samples ({sum(y_train)} positive / {len(y_train) - sum(y_train)} negative)")
    print(f"      Val set:   {len(X_val)} samples ({sum(y_val)} positive)")
    print(f"      Test set:  {len(X_test)} samples ({sum(y_test)} positive)")

    print("\n[2/4] Training HistGradientBoostingClassifier model...")
    scorer = TransitionScorer()
    train_start = time.time()
    scorer.fit(X_train, y_train, X_val, y_val)
    train_duration = time.time() - train_start
    print(f"      Model trained in {train_duration:.2f}s.")

    print("\n[3/4] Evaluating generalization on held-out test split...")
    y_test_pred = scorer.model.predict(X_test)
    y_test_proba = scorer.model.predict_proba(X_test)[:, 1]
    acc = accuracy_score(y_test, y_test_pred)
    roc_auc = roc_auc_score(y_test, y_test_proba)

    scorer.metadata["test_accuracy"] = round(float(acc), 4)
    scorer.metadata["test_roc_auc"] = round(float(roc_auc), 4)

    print(f"      Test Accuracy: {acc * 100:.2f}%")
    print(f"      Test ROC-AUC:  {roc_auc:.4f}")

    print("\n[4/4] Serializing model artifact...")
    saved_path = scorer.save()
    print(f"      Saved weights to: {saved_path}")
    print("================================================================")

    return scorer


if __name__ == "__main__":
    train_heuristic_model()
