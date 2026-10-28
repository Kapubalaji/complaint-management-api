# ResolveIT — Deployment Guide

Deployment targets used by this project:

| Layer | Platform | URL |
|---|---|---|
| Frontend (React + Vite) | Vercel | https://complaint-management-api-theta.vercel.app |
| Backend (FastAPI) | Render | https://complaint-management-api-zkpx.onrender.com |
| Database | PostgreSQL (local dev / Render-managed or external in prod) | set via `DATABASE_URL` |

Configuration files in this repo:

- `render.yaml` — Render blueprint for the backend service (secrets excluded).
- `frontend/vercel.json` — Vercel build settings for the Vite frontend.
- `.env.example` / `frontend/.env.example` — environment variable templates.

Nothing is deployed by these files alone. Syncing the Render blueprint or
running `vercel` triggers deployment — only do that after explicit approval.

---

## 1. Environment variables

### Backend (Render dashboard → Environment)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql+psycopg2://user:pass@host:5432/dbname` |
| `SECRET_KEY` | Yes | JWT signing key. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FRONTEND_URL` | Yes (prod) | Exact deployed frontend origin, no trailing slash: `https://complaint-management-api-theta.vercel.app` |
| `CORS_ORIGINS` | No | Comma-separated extra origins (preview deployments, custom domains) |
| `OPENAI_API_KEY` | No | Enables AI triage; without it the rule-based engine is used |
| `AI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `PYTHON_VERSION` | No | Set to `3.12.7` by `render.yaml` |
| `PORT` | Set by Render | Do not override; uvicorn binds to `$PORT` |

Local backend reads these from the project-root `.env` (gitignored). Copy
`.env.example` → `.env` and fill in real values.

### Frontend (Vercel dashboard → Settings → Environment Variables)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Backend base URL, no trailing slash. Baked into the bundle **at build time** |

Local frontend reads `frontend/.env` (gitignored). Copy
`frontend/.env.example` → `frontend/.env`.

**Secrets policy**

- `.env` and `frontend/.env` are gitignored (never tracked; verified with
  `git ls-files`). `.env.*` variants are ignored too, with `.env.example`
  explicitly allowed.
- **Historical incident (resolved):** an early commit hardcoded the local
  database password in `backend/database.py` and was pushed to this public
  repository. The local credential was **rotated on 2026-10-28** — the leaked
  value no longer authenticates anywhere it was valid locally. Git history
  still contains the old value; an optional history rewrite remains an open
  decision (see §9). The production credential must be verified/rotated in
  the Render dashboard per §4.
- Only `VITE_`-prefixed variables reach the browser bundle, and the only one
  used is `VITE_API_BASE_URL` (a public URL, not a secret). A production build
  without it logs a console warning instead of silently pointing at localhost.
- Database credentials, `SECRET_KEY`, and `OPENAI_API_KEY` live exclusively in
  server-side environment variables — never in Vercel, never in the repo.
- `render.yaml` marks all secrets as `sync: false` so the blueprint file
  itself contains no credentials.

---

## 2. Database migration

Migrations are **automatic and non-destructive**: `backend/server.py` calls
`run_migrations()` on startup (`backend/migrate.py`), which:

1. Creates any missing tables (`Base.metadata.create_all` — never drops).
2. Adds missing columns to `users` and `complaints` (`ALTER TABLE ... ADD
   COLUMN` only when the column is absent).
3. Creates `complaint_comments` if missing.

Existing rows are never modified or deleted, so it is safe to run against the
live database with current data.

Manual run (optional, same code path as startup):

```bash
python -m backend.migrate
```

> If you later adopt a full migration tool (Alembic), keep
> `backend/migrate.py` for the legacy column backfill described above.

---

## 3. Initial admin setup

Registration always creates `role="user"` accounts. The first admin must be
promoted once from the project root (backend env active):

```bash
# Promote an account that already registered in the app:
python -m backend.create_admin <username>

# Or create a brand-new admin account directly (prompts for password, hidden):
python -m backend.create_admin <username> --new --email you@example.com

# Reversible if needed:
python -m backend.create_admin <username> --demote
```

The script is idempotent and only changes the `role` column — passwords,
emails, and all complaints are preserved. Repeat it for staff accounts
(`staff` role must be set via SQL or by an admin in the UI's User Management
page; the CLI targets admin specifically).

Verify by signing in and opening **User Management** in the dashboard.

---

## 4. Backend deployment (Render)

1. Push the repository to GitHub (only after explicit approval — the working
   tree currently contains uncommitted work that must be preserved).
2. Render → **New +** → **Blueprint** → select the repo. Render reads
   `render.yaml` and creates the `resolveit-api` web service.
3. In the service's **Environment** tab, set the secrets the blueprint marks
   `sync: false`:
   - `DATABASE_URL` — connection string of your **existing** PostgreSQL
     instance (Render Postgres → Connect → *External Database URL*, or your
     own host). Do not provision a second database if one already exists.
   - `SECRET_KEY` — a fresh random value.
   - Optional: `OPENAI_API_KEY`, `CORS_ORIGINS`.
   `FRONTEND_URL` is pre-filled with the Vercel URL by the blueprint.
4. Deploy. The start command is:
   `uvicorn backend.server:app --host 0.0.0.0 --port $PORT --workers 1`
   On boot it runs migrations, then serves `/` (health check) and `/docs`.
5. Confirm: `https://complaint-management-api-zkpx.onrender.com/` returns
   `{"message": "ResolveIT Complaint Management API is running", ...}`.

Free-tier note: the service sleeps after inactivity; first request after idle
takes ~30–60s.

### Render dashboard settings you must configure manually

- **Environment variables** above (secrets are `sync: false` on purpose).
- **Health Check Path** = `/` (set by blueprint).
- **Branch** = `main`, **Auto Deploy** = on/off per your preference.
- If using an existing database: **Connect** it or just paste its URL into
  `DATABASE_URL`. Do not enable "Public IP" for the database.

---

## 5. Frontend deployment (Vercel)

1. Vercel → **Add New Project** → import the repo.
2. **Root Directory** = `frontend` (the app lives in a subfolder).
   Build settings are also pinned in `frontend/vercel.json`
   (`npm run build` → `dist/`, framework Vite), so overrides are unnecessary.
3. **Environment Variables** → add:
   - `VITE_API_BASE_URL` = `https://complaint-management-api-zkpx.onrender.com`
4. Deploy. After any change to `VITE_API_BASE_URL`, trigger a **redeploy** —
   Vite bakes it in at build time; editing the variable alone does nothing.
5. Confirm the deployed origin matches `FRONTEND_URL` on the backend exactly
   (scheme + host, no trailing slash). Vercel preview URLs
   (`*.vercel.app` variants) are **not** the same origin — add them to
   `CORS_ORIGINS` on Render if you need previews to call the API.

### Vercel dashboard settings you must configure manually

- **Root Directory**: `frontend`
- **Environment variable**: `VITE_API_BASE_URL` (and redeploy after changes)
- **Node version**: leave default (Vite 8 requires Node 18.11+/20+).

---

## 6. Production CORS

The backend allows:

- `http://localhost:5173` and `http://127.0.0.1:5173` (local dev), plus
- every origin in `FRONTEND_URL` (single URL), plus
- every origin in `CORS_ORIGINS` (comma-separated, optional).

Empty entries are dropped and trailing slashes normalized, so `FRONTEND_URL`
can be set carelessly without breaking things. Changing these requires a
service restart (Render does this automatically when env vars change).

---

## 7. Verification checklist

```bash
# Backend health
curl -s https://complaint-management-api-zkpx.onrender.com/
# -> {"message": "ResolveIT Complaint Management API is running", ...}

# Auth is enforced
curl -s -o /dev/null -w "%{http_code}\n" \
  https://complaint-management-api-zkpx.onrender.com/reports/export
# -> 401

# CORS preflight from the deployed frontend origin
curl -s -I -X OPTIONS \
  -H "Origin: https://complaint-management-api-theta.vercel.app" \
  -H "Access-Control-Request-Method: GET" \
  https://complaint-management-api-zkpx.onrender.com/reports/export \
  | grep -i access-control-allow-origin
# -> access-control-allow-origin: https://complaint-management-api-theta.vercel.app

# Frontend build (local)
cd frontend && npm run lint && npm run build

# Backend test suite (local)
python -m unittest discover -s tests
```

Then in the browser: register → log in → create a complaint → Analytics →
Export CSV (with and without a date range) → sign in as admin → User
Management.

---

## 8. Data preservation rules

- Never run `Base.metadata.drop_all` or `DROP TABLE` against the live DB.
- `backend/migrate.py` only adds; it never drops or rewrites rows.
- Promoting/demoting admins changes only the `role` column.
- This deployment preparation made **no** changes to the existing database
  (verified read-only: 6 users, 8 complaints present before and after).

---

## 9. Blockers / decisions needed before going live

1. **Production credential rotation (pending)** — the local database password
   was rotated on 2026-10-28 after a historical leak; **verify and rotate the
   production password in the Render dashboard** (Postgres → Reset
   credentials, or external host + update `DATABASE_URL`). Never paste
   credentials into chat or commits.
2. **Secrets are local-only** — `DATABASE_URL` and `SECRET_KEY` must be pasted
   into Render manually; they intentionally cannot be committed.
3. **Confirm `FRONTEND_URL`** — pre-filled with the current Vercel URL; change
   it if you redeploy the frontend under a different domain.
4. **Database choice** — attach the existing PostgreSQL instance via
   `DATABASE_URL`; only uncomment the `databases:` block in `render.yaml` if
   you are starting from zero (it provisions a *new*, empty database).
5. **AI key (optional)** — without `OPENAI_API_KEY`, triage falls back to the
   rule-based engine; nothing breaks.
6. **Password reset delivery (known tradeoff)** — the API returns the reset
   token in the response because no email service is configured; the UI
   discloses this. Before real users rely on it, add email delivery (SMTP)
   and stop returning the token in the response body.
7. **Git history rewrite (optional, open decision)** — the old leaked
   password still exists in public history but is now invalid for the local
   database; rewriting is optional cleanup with the risks documented in the
   release review notes.
8. **No deployment has been triggered** — awaiting explicit approval.
