# ITSoc Management System

A web platform that runs the day-to-day operations of a university student organization: members and officers, events, QR attendance, certificates, budgets and expenses, documents, announcements, notifications, reports, and a tamper-evident audit log.

> **Status:** complete. The backend and frontend are both done, tested, containerised and covered by CI. See [docs/PROGRESS.md](docs/PROGRESS.md) for the verification record and ideas for later.

## Highlights

- **Permissions enforced by the API.** 16 permission keys across 6 roles, stored in the database. Every route checks them. The frontend only hides what the API would refuse anyway.
- **Secure sessions.**
  - 15-minute access tokens kept in memory, with rotating httpOnly refresh cookies.
  - Reusing a stolen refresh token revokes every session from that login.
  - Accounts lock after repeated failures, and auth endpoints are rate-limited.
- **QR attendance that resists sharing.** The code rotates every 30 seconds and is signed by the server. The server also checks for duplicates, registration, and lateness.
- **Verifiable certificates.** PDFs with a QR code that opens a public verification page showing only what's printed on the certificate.
- **Finance you can audit.**
  - Amounts are stored as `Decimal`, and every total is computed on the server.
  - Whoever files an expense can't approve it.
  - Approval can't overspend a budget.
  - Expenses are never deleted, and their status history is append-only.
- **Rules the database enforces itself.** Triggers make the audit log append-only and lock finalized expenses. Unique constraints stop duplicate registrations and check-ins. Row locks prevent overbooking.
- **Tested.**
  - 48 backend integration tests run against real PostgreSQL. They cover auth, permissions, concurrency, attendance, finance, audit, and certificates.
  - Frontend unit tests.
  - A browser smoke test signs in as all six roles and visits every page.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, Axios, React Hook Form, Zod |
| Backend | Node.js, Express 5, TypeScript, Zod, Prisma 5, PostgreSQL 16 |
| Security | bcrypt, JWT, helmet, CORS allow-list, express-rate-limit, file-type sniffing |
| Other | pdfkit (certificates), qrcode, pino (logs), Vitest + Supertest, Docker, GitHub Actions |

## Getting started (development)

Prerequisites: Node.js 20+ and Docker Desktop.

```bash
# 1. Database (PostgreSQL on host port 5434)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env              # then set JWT_ACCESS_SECRET (command is in the file)
npm install
npm run db:migrate                # apply migrations
npm run db:seed                   # roles, permissions + demo data
npm run dev                       # http://localhost:4000

# 3. Frontend
cd ../frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :4000)
```

### Demo accounts

After `npm run db:seed`, each of these accounts uses the password `ItsocDemo2026!`:

| Email | Role |
|---|---|
| president@itsoc.test | President |
| vp@itsoc.test | Vice President |
| secretary@itsoc.test | Secretary |
| treasurer@itsoc.test | Treasurer |
| auditor@itsoc.test | Auditor |
| member@itsoc.test | Member |

The seed also creates 36 members, events in every status (one ongoing, ready for a QR demo), attendance records, issued certificates, three budgets including the ₱32,000 → ₱4,000 example from the spec, announcements, and notifications.

### Backend scripts

| Command | What it does |
|---|---|
| `npm run dev` | API with reload on change |
| `npm test` | Integration tests (uses the `itsoc_test` database; needs `docker compose up -d`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run db:migrate` / `db:seed` / `db:reset` / `db:studio` | Prisma helpers |

Frontend: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

## Production

```bash
cp .env.prod.example .env.prod    # fill in secrets and the first president's details
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod logs api   # first-president invitation link
```

The app is served on `WEB_PORT` (default 8080). nginx serves the frontend and proxies `/api` to the API over the internal network, so the site and the API share one origin. Put a TLS-terminating proxy in front of it in production.

On every start the API container:

1. applies pending migrations,
2. syncs roles and permissions,
3. creates the first president if none exists yet, and prints that president's one-time invitation link to the logs,
4. starts the server.

Only the web container is exposed to the host; the API and the database are not.

## Documentation

- [docs/architecture.md](docs/architecture.md): architecture, database design (ERD), authentication, the permission matrix, and workflows
- [docs/api.md](docs/api.md): endpoint reference
- [docs/PROGRESS.md](docs/PROGRESS.md): verification record and ideas for later

## Project structure

```
backend/     Express + Prisma API (src/modules/<domain>/{routes,service,schemas})
frontend/    React SPA (src/features/<domain>, src/components/ui)
docs/        Architecture, API reference, progress
legacy/      The original scaffold, kept for reference (git-ignored; safe to delete)
.github/     CI workflow
```
