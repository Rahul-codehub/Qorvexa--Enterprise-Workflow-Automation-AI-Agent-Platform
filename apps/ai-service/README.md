# Qorvexa AI Service

Run locally with Python 3.11+:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The default `AI_PROVIDER=mock` is intentionally deterministic and visibly labeled. It is suitable for local development and tests only.
