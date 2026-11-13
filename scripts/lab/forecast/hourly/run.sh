#!/usr/bin/env bash
set -euo pipefail
# Run from repository root. Pinned packages in an isolated uv env; no project dependency change.
export PYTHONDONTWRITEBYTECODE=1
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
packages=(--no-project --python 3.12 --with scikit-learn==1.7.2 --with numpy==2.3.4 --with scipy==1.16.3 --with joblib==1.5.2 --with threadpoolctl==3.6.0)
uv run "${packages[@]}" python -m unittest discover -s scripts/lab/forecast/hourly -p 'test_hourly.py' -v
uv run "${packages[@]}" python scripts/lab/forecast/hourly/build.py
