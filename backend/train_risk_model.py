"""
Train the student academic-risk model and export it as JSON for PHP inference.

Run once (Python is a build-time dependency only -- the Laravel app never shells
out to Python at runtime):

    python train_risk_model.py

Writes storage/app/ml/risk_model.json, which PHP scores with plain arithmetic:
    z = (x - mean) / scale
    p = sigmoid(intercept + dot(coefficients, z))
"""

import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

RANDOM_STATE = 42
N_SAMPLES = 2000

FEATURES = [
    "attendance_pct",
    "quiz1",
    "quiz2",
    "quiz3",
    "midterm_pct",
    "assignment_delay_count",
    "quiz_slope",
    "quiz_volatility",
    "midterm_vs_quiz",
]

OUTPUT_PATH = Path(__file__).resolve().parent / "storage" / "app" / "ml" / "risk_model.json"

# Latent archetypes. `quiz` is the opening quiz level, `drift` the per-assessment
# trend, `midterm_off` the midterm's offset from the student's quiz mean, and
# `delays` the Poisson rate for late assignments.
ARCHETYPES = {
    "steady-strong": dict(
        share=0.35, attendance=(92, 5), quiz=(82, 8), drift=(0.5, 3),
        midterm_off=(2, 6), delays=0.4,
    ),
    "steady-weak": dict(
        share=0.25, attendance=(74, 10), quiz=(58, 10), drift=(0.0, 4),
        midterm_off=(-3, 8), delays=1.6,
    ),
    "late-collapse": dict(
        share=0.22, attendance=(83, 8), quiz=(76, 9), drift=(-11, 5),
        midterm_off=(-14, 9), delays=2.4,
    ),
    "chronic-disengaged": dict(
        share=0.18, attendance=(52, 13), quiz=(45, 12), drift=(-3, 6),
        midterm_off=(-6, 10), delays=4.2,
    ),
}

# The logit weights below are on the raw 0-100 scale, so the linear part sits far
# below zero for every realistic student. This constant shifts the whole logit up
# so the generated cohort has a plausible base rate instead of a degenerate
# all-negative label column. It changes the intercept only, never the shape.
LOGIT_CALIBRATION = 9.3


def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))


def clip_pct(a):
    return float(np.clip(a, 0.0, 100.0))


def synthesize(n, rng):
    """Draw n students from the archetype mixture and build the feature matrix."""
    names = list(ARCHETYPES)
    probs = np.array([ARCHETYPES[k]["share"] for k in names], dtype=float)
    probs /= probs.sum()
    assigned = rng.choice(len(names), size=n, p=probs)

    rows, archetypes = [], []
    for idx in assigned:
        spec = ARCHETYPES[names[idx]]
        attendance = clip_pct(rng.normal(*spec["attendance"]))
        base = rng.normal(*spec["quiz"])
        drift_mu, drift_sd = spec["drift"]

        # Each quiz carries the archetype trend plus its own measurement noise.
        quiz1 = clip_pct(base + rng.normal(0, 5))
        quiz2 = clip_pct(base + rng.normal(drift_mu, drift_sd) + rng.normal(0, 5))
        quiz3 = clip_pct(base + 2 * rng.normal(drift_mu, drift_sd) + rng.normal(0, 5))

        quizzes = [quiz1, quiz2, quiz3]
        quiz_mean = statistics.fmean(quizzes)
        midterm = clip_pct(quiz_mean + rng.normal(*spec["midterm_off"]))
        delays = int(np.clip(rng.poisson(spec["delays"]), 0, 6))

        rows.append([
            attendance,
            quiz1,
            quiz2,
            quiz3,
            midterm,
            float(delays),
            (quiz3 - quiz1) / 2.0,          # quiz_slope
            statistics.stdev(quizzes),      # quiz_volatility
            midterm - quiz_mean,            # midterm_vs_quiz
        ])
        archetypes.append(names[idx])

    return np.array(rows, dtype=float), np.array(archetypes)


def label(X, rng):
    """Non-linear, noisy labelling: Bernoulli draws from a latent risk logit.

    The model never sees this logit, and no student is labelled by a hard
    threshold -- two students with identical features can land on opposite
    labels, so the classifier has genuine irreducible error to fight.
    """
    attendance = X[:, 0]
    midterm = X[:, 4]
    quiz_mean = X[:, 1:4].mean(axis=1)
    delays = X[:, 5]
    slope = X[:, 6]
    volatility = X[:, 7]

    logit = (
        -4.2
        - 0.045 * attendance
        - 0.035 * midterm
        - 0.030 * quiz_mean
        - 0.28 * slope
        + 0.31 * delays
        + 0.020 * volatility
        + LOGIT_CALIBRATION
    )
    p = sigmoid(logit)
    return (rng.random(len(p)) < p).astype(int)


def main():
    rng = np.random.default_rng(RANDOM_STATE)

    X, archetypes = synthesize(N_SAMPLES, rng)
    y = label(X, rng)

    print("=" * 68)
    print("STEP 1 - synthetic cohort")
    print("=" * 68)
    print(f"samples: {len(y)}   at_risk: {y.sum()} ({y.mean():.1%})")
    for name in ARCHETYPES:
        mask = archetypes == name
        print(f"  {name:<20} n={mask.sum():>4}  at_risk={y[mask].mean():.1%}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=RANDOM_STATE
    )

    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)),
    ])
    pipe.fit(X_train, y_train)

    y_pred = pipe.predict(X_test)
    y_proba = pipe.predict_proba(X_test)[:, 1]

    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_proba)
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()

    cv = cross_val_score(
        pipe, X, y,
        cv=StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE),
        scoring="roc_auc",
    )

    print()
    print("=" * 68)
    print("STEP 2 - held-out evaluation (20% stratified test split)")
    print("=" * 68)
    print(f"accuracy   : {accuracy:.4f}")
    print(f"precision  : {precision:.4f}")
    print(f"recall     : {recall:.4f}")
    print(f"f1         : {f1:.4f}")
    print(f"roc_auc    : {roc_auc:.4f}")
    print()
    print("confusion matrix (rows = actual, cols = predicted)")
    print("              pred_safe  pred_risk")
    print(f"  act_safe    {tn:>9}  {fp:>9}")
    print(f"  act_risk    {fn:>9}  {tp:>9}")
    print()
    print(f"5-fold CV ROC-AUC: mean={cv.mean():.4f}  std={cv.std():.4f}")
    print("  folds: " + ", ".join(f"{s:.4f}" for s in cv))

    scaler = pipe.named_steps["scaler"]
    coefs = pipe.named_steps["clf"].coef_[0]
    intercept = float(pipe.named_steps["clf"].intercept_[0])

    print()
    print("=" * 68)
    print("STEP 3 - standardized coefficients (sorted by |magnitude|)")
    print("=" * 68)
    for i in np.argsort(-np.abs(coefs)):
        direction = "increases risk" if coefs[i] > 0 else "decreases risk"
        print(f"  {FEATURES[i]:<24} {coefs[i]:>8.4f}   {direction}")
    print(f"  {'(intercept)':<24} {intercept:>8.4f}")

    model = {
        "version": "1.0",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": FEATURES,
        "scaler": {
            "mean": [float(v) for v in scaler.mean_],
            "scale": [float(v) for v in scaler.scale_],
        },
        "coefficients": [float(v) for v in coefs],
        "intercept": intercept,
        "thresholds": {"moderate": 0.40, "critical": 0.70},
        "metrics": {
            "accuracy": round(float(accuracy), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "roc_auc": round(float(roc_auc), 4),
            "cv_auc_mean": round(float(cv.mean()), 4),
            "cv_auc_std": round(float(cv.std()), 4),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
            "n_train": int(len(y_train)),
            "n_test": int(len(y_test)),
            "base_rate": round(float(y.mean()), 4),
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    print()
    print(f"exported -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
