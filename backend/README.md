# Karaoke Backend

Minimal Django backend for song library, accounts, scores, and per-song leaderboard.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

Admin: http://localhost:8000/admin

## API

- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/refresh`
- GET `/api/songs`
- GET `/api/songs/:code`
- POST `/api/scores` (auth required)
- GET `/api/leaderboard?song=:code`

## Notes
- SQLite works for small traffic. For higher concurrency, switch to Postgres.
- Uploaded files are stored in `backend/media/` by default.
