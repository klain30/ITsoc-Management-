# Progress

Last updated: 2026-09-29. **Status: complete.**

## What was built

| Area | Contents |
|---|---|
| Database | Prisma schema, a migration with hand-written constraints and triggers, demo seed, and a deploy-time bootstrap script |
| API | Every module in the spec, plus roles, organization settings, and an event-reminder job. See [api.md](api.md). |
| Frontend | React SPA covering sign-in, invitations, the dashboard, events and registration, QR check-in with a projector view, certificates and public verification, members, officers, finance, documents, announcements, notifications, reports, the audit log, profile, and settings. Supports light and dark mode and is responsive. |
| Delivery | Docker images for the API and web (nginx), `docker-compose.prod.yml`, and GitHub Actions CI |

## Verification record

| Check | Result |
|---|---|
| Backend lint, typecheck, build | Clean |
| Backend integration tests (`npm test`) | 48 passed (real PostgreSQL) |
| Frontend lint (warnings fail), typecheck, build | Clean |
| Frontend unit tests | 4 passed |
| Browser smoke test (headless Edge) | All 6 demo roles signed in, visited every page they can access plus the event, member, budget, and expense detail pages, and signed out. The member role was refused on officer pages. The public verification page works. No runtime errors, no API 5xx, no error screens. |
| Production stack (`docker-compose.prod.yml`) | Migrations applied, bootstrap ran, and the first president was activated via the invitation link through nginx. Security headers and CSP are present, and the browser showed no CSP violations. The session survives a reload, and the audit log records the real client IP. |

## Ideas for later (not required by the spec)

- Email delivery for invitations, resets and reminders. Today officers copy the link.
- An in-app QR scanner. Today members scan with the phone camera, which opens the check-in link.
- S3-compatible storage (`lib/storage.ts` is already an interface).
- Component tests for the frontend, and running the browser smoke test in CI.
- Charts with more history, such as attendance trends per semester.

## Housekeeping

- `legacy/` holds the original scaffold. It is git-ignored and safe to delete.
- The project is not a git repository yet. Run `git init`, commit, and push to GitHub to enable CI.
- Dev database: Docker on port 5433 (a local PostgreSQL 18 already uses 5432).
