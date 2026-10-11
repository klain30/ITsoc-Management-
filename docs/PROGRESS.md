# Progress

Last updated: 2026-10-03. **Status: complete.**

## What was built

| Area | Contents |
|---|---|
| Database | Prisma schema, a migration with hand-written constraints and triggers, demo seed, and a deploy-time bootstrap script |
| API | Every module in the spec, plus roles, organization settings, and an event-reminder job. See [api.md](api.md). |
| Frontend | React SPA covering sign-in, invitations, the dashboard, events and registration, QR check-in with a projector view, certificates and public verification, members, officers, finance, documents, announcements, notifications, reports, the audit log, profile, and settings. Supports light and dark mode and is responsive. |
| Delivery | Docker images for the API and web (nginx), `docker-compose.prod.yml`, and GitHub Actions CI |
| Messenger (2026-10-11) | Messages page with 1:1 chats, group chats, live delivery, typing, online status, read receipts and unread badges; voice/video calls and group meetings in the browser (WebRTC), with screen sharing; call summaries in the chat. Tables: `Conversation`, `ConversationParticipant`, `Message` (migration `messenger`). See [api.md](api.md#messenger-chat-calls-meetings). |
| Branding (2026-10-03) | ITSoc seal and cover photo (`frontend/public/itsoc-*.png`), palette taken from the seal (tokens in `frontend/src/index.css`), Montserrat for titles, circuit-trace graphic (`CircuitPattern`), branded dashboard banner, and CSS-only motion: button press, popover/dialog/toast entry, page fade, staggered cards, growing chart bars. All motion respects `prefers-reduced-motion`. |

## Verification record

| Check | Result |
|---|---|
| Backend lint, typecheck, build | Clean |
| Backend integration tests (`npm test`) | 53 passed (real PostgreSQL), including 5 chat tests |
| Frontend lint (warnings fail), typecheck, build | Clean |
| Frontend unit tests | 4 passed |
| Browser smoke test (headless Edge) | All 6 demo roles signed in, visited every page they can access plus the event, member, budget, and expense detail pages, and signed out. The member role was refused on officer pages. The public verification page works. No runtime errors, no API 5xx, no error screens. |
| Production stack (`docker-compose.prod.yml`) | Migrations applied, bootstrap ran, and the first president was activated via the invitation link through nginx. Security headers and CSP are present, and the browser showed no CSP violations. The session survives a reload, and the audit log records the real client IP. |

## Ideas for later (not required by the spec)

- Email delivery for invitations, resets and reminders. Today officers copy the link.
- An in-app QR scanner. Today members scan with the phone camera, which opens the check-in link.
- S3-compatible storage (`lib/storage.ts` is already an interface).
- Component tests for the frontend, and running the browser smoke test in CI.
- A TURN server for calls between people on very strict networks (today only public STUN is configured in `frontend/src/features/chat/CallProvider.tsx`).
- An SFU (for example LiveKit or mediasoup) if meetings need more than about 6 people on video.
- Charts with more history, such as attendance trends per semester.

## Housekeeping

- `legacy/` holds the original scaffold. It is git-ignored and safe to delete.
- The project is not a git repository yet. Run `git init`, commit, and push to GitHub to enable CI.
- Dev database: Docker on port 5434 (a local PostgreSQL 18 uses 5432 and another project's container uses 5433).
