# QuoteFlow REST API

Base URL `http://localhost:8788`. `/api/*` routes (except login/health) need `Authorization: Bearer <token>`. Errors: `{error, message}` with HTTP status 400/401/403/404/409.

## Auth & company
`POST /api/auth/login {email,password}` → `{token,user}` · `POST /api/auth/logout` · `GET /api/auth/me` · `GET /api/users` · `GET /api/company` · `PATCH /api/company` (admin) · `GET /api/health`

## Services catalogue
`GET /api/services?all=1` · `POST /api/services {code,name_en,name_ar,category,unit,base_rate}` (manager) · `PATCH /api/services/:id`

## Clients
`GET /api/clients?search=` (with inquiry counts and won value) · `GET /api/clients/:id` (with inquiries) · `POST /api/clients` · `PATCH /api/clients/:id`

## Inquiries
| Method | Path | Body / Query |
|---|---|---|
| GET | `/api/inquiries` | `status` (`open` or a status), `client_id`, `assigned_to`, `priority`, `search`, `from`, `to`, `limit`, `offset` → `{total, rows}`; each row carries `sla {due, responded, overdue, hours_left, at_risk}`, `quote_total`, `quote_status`, `next_followup` |
| POST | `/api/inquiries` | `{client_id, subject, details?, channel?, location?, required_by?, priority?, assigned_to?, est_value?}` → numbered `INQ-YYYY-NNNN`; `sla_hours` from priority |
| GET | `/api/inquiries/:id` | with `quotations[]`, `followups[]`, `activity[]` |
| PATCH | `/api/inquiries/:id` | editable fields |
| POST | `/api/inquiries/:id/assign` | `{user_id}` — also stops the SLA clock |
| POST | `/api/inquiries/:id/respond` | `{note?}` — marks first response |
| POST | `/api/inquiries/:id/status` | `{status, reason?, note?}` — `lost` needs a reason; `won/lost` need a sent quotation |
| POST | `/api/inquiries/:id/notes` | `{text}` |
| GET | `/api/inquiries/:id/draft` | proposed line items from the inquiry text |

## Quotations
| Method | Path | Notes |
|---|---|---|
| POST | `/api/quotations` | `{inquiry_id, items?, auto?}` — `auto` drafts items from the text; number `QT-YYYY-NNNN`, revision 0 |
| GET | `/api/quotations/:id` | with items and `can_edit` |
| PATCH | `/api/quotations/:id` | `{items?[], discount_pct?, scope_notes?, terms?, internal_notes?, valid_until?}` — totals recomputed (discount before VAT) |
| POST | `/api/quotations/:id/submit` | draft → pending_approval |
| POST | `/api/quotations/:id/approve` | manager: → sent; inquiry → quoted; older quotes superseded |
| POST | `/api/quotations/:id/reject` | manager: `{comment}` → back to draft |
| POST | `/api/quotations/:id/revise` | new revision R(n+1) as draft; previous → superseded; inquiry → negotiation |
| DELETE | `/api/quotations/:id` | drafts only |

Item shape: `{service_id?, description, unit, qty, rate}` → `amount` computed.

## Follow-ups
`GET /api/followups?scope=open|today|overdue|done&user_id=` · `POST /api/followups {inquiry_id, due_at, type, note, user_id?}` · `POST /api/followups/:id/complete {outcome}`

## Dashboard, reports, audit
`GET /api/dashboard` · `GET /api/reports?from=&to=` · `GET /api/audit?limit=` (manager)

## Intake (public, for forms/automations)
`POST /intake` with header `x-intake-token` when `INTAKE_TOKEN` is set. Body `{name, company, phone, email, subject, message, channel, location, priority, client_id?}`. Matches an existing client by phone/e-mail or creates one, then opens an inquiry.
