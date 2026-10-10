#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
if [ ! -d .venv ]; then
  echo "Membuat virtual environment..."
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
echo "Buka http://127.0.0.1:5000 di browser"
python app.py
