# API reference

Base URL: `/api/v1`. All requests and responses are JSON unless noted. Authenticated routes need `Authorization: Bearer <accessToken>`.

## Conventions

| | |
|---|---|
| Single resource | `{ "data": { … } }` |
| List | `{ "data": [ … ], "meta": { "page", "pageSize", "total", "totalPages" } }`. Use `?page=1&pageSize=20` (max 100). |
| Error | `{ "error": { "code": "EVENT_FULL", "message": "This event is full.", "details": { … } } }` |
| Validation error | `400 VALIDATION_ERROR` with `details.fieldErrors: { field: [messages] }` |
| Money | Decimal strings with 2 places: `"12500.00"` |
| Dates | ISO 8601. Date-time inputs must include a timezone offset (`Z` or `+08:00`). Expense dates are `YYYY-MM-DD`. |
| State changes | `PATCH /resource/:id/<action>` (e.g. `/expenses/:id/approve`) |

Status codes:

| Code | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Not signed in, or the token expired (`TOKEN_EXPIRED`) |
| 403 | Missing permission |
| 404 | Not found, or not visible to you |
| 409 | Conflict (duplicate, concurrent change) |
| 413 | File too large |
| 422 | Breaks a business rule |
| 423 | Account temporarily locked |
| 429 | Rate limited |

Permissions are listed in the tables below as `members:read` etc.; see [architecture.md](architecture.md#authorization) for which roles have which permission. A dash means any signed-in user; *public* means no token is needed.

## Auth — `/auth`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{ email, password }` → `{ user, accessToken }` and sets the refresh cookie. Rate limited. |
| POST | `/auth/refresh` | cookie | Requires `X-Requested-With: XMLHttpRequest`. Rotates the cookie and returns a new `{ user, accessToken }`. |
| POST | `/auth/logout` | cookie | Requires `X-Requested-With`. Revokes the session. Returns `204`. |
| GET | `/auth/me` | — | Current user, including `role`, `position`, and `permissions[]`. |
| POST | `/auth/change-password` | — | `{ currentPassword, newPassword }`. Signs out other devices. |
| GET | `/auth/account-tokens/:token` | public | Preview of an invitation or reset link: `{ type, email, firstName, expiresAt }`. |
| POST | `/auth/set-password` | public | `{ token, password }`. Activates the account (or resets the password) and signs in. |

## Organization, roles, profile

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/organization` | public | Name, short name, university |
| PATCH | `/organization` | roles:assign | |
| GET | `/roles` | members:read or roles:assign | Role → permission matrix from the database |
| GET | `/profile` | — | Your member record with a summary |
| PATCH | `/profile` | — | `{ contactNumber?, section?, middleName? }` |
| PUT | `/profile/avatar` | — | multipart `file` (JPG, PNG, or WEBP) |

## Members — `/members`

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/members` | members:read | Filters: `search`, `status`, `role`, `officersOnly`, `sort` (name, studentId, dateJoined, createdAt) |
| POST | `/members` | members:manage | Creates the member and an INVITED account. Returns `{ member, invitation: { link, expiresAt } }`. |
| GET | `/members/:id` | self or members:read | Includes `summary` (registrations, attendance counts, certificates, position history) |
| PATCH | `/members/:id` | members:manage | Any member field |
| DELETE | `/members/:id` | roles:assign | Only for members with no history; otherwise `409` |
| POST | `/members/:id/access-link` | members:manage | Re-issues an invitation. For active accounts it issues a password-reset link, which requires roles:assign. |
| PATCH | `/members/:id/role` | roles:assign | `{ role }`. Not allowed on your own account or on the last president. |
| PATCH | `/members/:id/account-status` | roles:assign | `{ status: ACTIVE \| DISABLED }`. Disabling revokes all sessions. |
| GET | `/members/:id/avatar` | self or members:read | Image |

## Positions (officers)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/positions` | members:read | Each position with its current holders. Add `?includeInactive=true` (positions:manage) to see inactive ones. |
| POST | `/positions` | positions:manage | `{ name, description?, sortOrder?, isActive? }` |
| PATCH | `/positions/:id` | positions:manage | |
| POST | `/positions/:id/assignments` | positions:manage | `{ memberId, startDate }`. Ends the member's current term, if any. |
| PATCH | `/position-assignments/:id/end` | positions:manage | `{ endDate }` |

## Events & registration

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/events` | — | Filters: `search`, `status`, `timeframe` (upcoming, past, all), `mine`. Members never see drafts. Each item includes `registeredCount`, `spotsLeft`, `isRegistrationOpen`, and your own `myRegistration`, `myAttendance`, `myCertificate`. |
| POST | `/events` | events:manage | `{ name, description?, location, startsAt, endsAt, capacity, registrationDeadline }`. Created as DRAFT. |
| GET | `/events/:id` | — | Returns `404` for drafts if you lack events:manage |
| PATCH | `/events/:id` | events:manage | Only while DRAFT or PUBLISHED. Capacity cannot go below the current registrations. |
| PATCH | `/events/:id/status` | events:manage | `{ status }`. Follows the state machine; completing marks no-shows ABSENT. |
| POST | `/events/:id/register` | — | Registers **the caller** (any body is ignored) |
| DELETE | `/events/:id/register` | — | Cancels your registration before the deadline |
| GET | `/events/:id/registrations` | events:manage or attendance:read | |

## Attendance

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/events/:id/attendance-sessions` | attendance:read | |
| POST | `/events/:id/attendance-sessions` | attendance:manage | `{ name?, closesAt?, lateAfter? }`. Only one open session at a time. |
| GET | `/attendance-sessions/:id/qr` | attendance:manage | `{ qrDataUrl, url, code, rotatesAt, rotationSeconds, session }` |
| PATCH | `/attendance-sessions/:id/close` | attendance:manage | |
| POST | `/attendance/check-in` | — | `{ code }`. Errors: `INVALID_CODE`, `CODE_EXPIRED`, `SESSION_CLOSED`, `NOT_REGISTERED`, `409` if already checked in. |
| GET | `/attendance/me` | — | Your attendance history |
| GET | `/events/:id/attendance` | attendance:read | `{ event, stats, records }` |
| GET | `/events/:id/attendance.csv` | attendance:read | CSV |
| PUT | `/events/:id/attendance/:memberId` | attendance:manage | `{ status, note }`. Manual correction; `note` is required and the change is audited. |

The spec suggested `POST /events/:id/attendance/check-in`. Check-in lives at `/attendance/check-in` instead, because the event is taken from the signed QR code rather than from the URL.

## Certificates

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/events/:id/certificates` | certificates:issue | Issues to eligible attendees → `{ issued }`. Running it again issues nothing new. |
| GET | `/certificates` | certificates:issue | Filters: `eventId`, `search` |
| GET | `/certificates/me` | — | |
| GET | `/certificates/:id` | owner or certificates:issue | |
| GET | `/certificates/:id/download` | owner or certificates:issue | `application/pdf` |
| PATCH | `/certificates/:id/revoke` | certificates:issue | `{ reason }` |
| GET | `/public/certificates/:code` | public | Rate limited. Returns `{ certificateId, recipientName, event, eventDate, organization, dateIssued, status, revokedAt }`. |

## Finance

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/finance/summary` | finance:read | Totals, counts by status, spending by category, monthly spend, and active budgets |
| GET | `/budgets` | finance:read | `?status=ACTIVE\|CLOSED`. Each budget includes allocated, spent, pending, remaining, available, and utilization. |
| POST | `/budgets` | finance:manage | `{ name, description?, eventId?, allocatedAmount }` |
| GET | `/budgets/:id` | finance:read | Also returns `byCategory` |
| PATCH | `/budgets/:id` | finance:manage | The allocation cannot go below the amount already spent. Closing requires no pending expenses. |
| GET | `/expenses` | finance:read | Filters: `budgetId`, `status`, `category`, `from`, `to`, `search`. `meta.totalAmount` sums the results. |
| GET | `/expenses/export.csv` | finance:read | Same filters as the list |
| POST | `/expenses` | finance:manage | `{ budgetId, amount, category, description, expenseDate, paidByMemberId? }`. Created as PENDING. |
| GET | `/expenses/:id` | finance:read | Includes `receipts` and `history` |
| PATCH | `/expenses/:id` | finance:manage | PENDING only |
| PATCH | `/expenses/:id/approve` | expenses:approve | `{ note? }`. Not allowed for the person who filed it, or if it would exceed the budget. |
| PATCH | `/expenses/:id/reject` | expenses:approve | `{ note }` (required) |
| PATCH | `/expenses/:id/reimburse` | finance:manage | APPROVED only, and needs at least one receipt |
| POST | `/expenses/:id/receipts` | finance:manage | multipart `file` (JPG, PNG, WEBP, or PDF; max 5 MB; at most 5 per expense) |
| GET | `/receipts/:id/file` | finance:read | Shown inline in the browser |

There is no `DELETE` for expenses on purpose.

## Documents, announcements, notifications

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/documents` | — | Filters: `category`, `search`. Without documents:read you only see `MEMBERS`-visible documents. |
| POST | `/documents` | documents:manage | multipart: `file`, `title`, `category`, `visibility`, `description?` |
| GET | `/documents/:id` · `/documents/:id/file` | by visibility | Add `?inline=true` to view in the browser |
| PATCH | `/documents/:id` | documents:manage | Metadata only |
| DELETE | `/documents/:id` | documents:manage | Soft delete |
| GET | `/announcements` | — | Members see published, unexpired announcements. Managers can add `?status=DRAFT\|PUBLISHED\|ARCHIVED\|ALL`. |
| POST | `/announcements` | announcements:manage | `{ title, content, isPinned?, expiresAt?, publish? }` |
| PATCH | `/announcements/:id` | announcements:manage | |
| PATCH | `/announcements/:id/publish` | announcements:manage | Notifies all active members |
| PATCH | `/announcements/:id/archive` | announcements:manage | |
| GET | `/notifications` | — | `?unreadOnly=true`. `meta.unread` gives the unread count. |
| GET | `/notifications/unread-count` | — | |
| PATCH | `/notifications/:id/read` | — | Your own notifications only |
| PATCH | `/notifications/read-all` | — | |

## Dashboard, reports, audit

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/dashboard` | — | `{ me, organization, finance, recentActivity }`. Sections you lack permission for (reports:read, finance:read, audit:read) are `null`. |
| GET | `/reports/attendance` · `.csv` | reports:read or attendance:read | `?from&to`. Attendance per completed event, plus totals. |
| GET | `/reports/membership` | reports:read | Members by status, course, and year level, and joins per month |
| GET | `/audit-logs` | audit:read | Filters: `action`, `entityType`, `entityId`, `actorId`, `from`, `to`. Read-only; there are no write endpoints. |
| GET | `/audit-logs/actions` | audit:read | List of action names |

## Health

`GET /health` → `{ "status": "ok" }` (outside `/api/v1`, not rate limited)
