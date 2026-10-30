# CampusFix manager integration

## Checkout and ownership

The work stays on `feature/manager-dashboard` in `E:\Campusfix`. Its initial commit contained only the root README. The existing scaffold was read from the local `origin/main` snapshot and reused in `campusfix/` without switching branches, merging, committing or pushing. Local `feature/smart-assignment` added a GenAI dependency but contained no callable engine or shared API. No student portal, technician portal or assignment-engine source was changed.

Manager implementation: `app/manager/`, `components/manager/`, `lib/manager/`, `app/api/manager/`. The new root page redirects to `/manager` for the hackathon; teammates can replace that redirect with their landing page during integration. The base Next.js config, layout, styling and package manifest are scaffolding files shared at eventual merge time and should be reviewed with the team.

## Run locally

Use Node.js 24 LTS (node:sqlite required). From `E:\Campusfix\campusfix`:

```powershell
npm install
# Only on a fresh clone: copy .env.example to .env.local and fill your server values.
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/manager`. If npm is not on PATH on this Windows machine, use `& 'C:\Program Files\nodejs\npm.cmd'` in place of `npm`.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

`npm exec tsx -- tests/api-smoke.mts` runs an HTTP lifecycle test against the dev server and leaves one clearly named demo walkthrough record with its history. Unit tests use their own ignored SQLite database under `work/`. These tests never call Gemma. Real model validation is performed explicitly from the application.

## Persistence and scope

Development uses `data/manager.sqlite`, initialized once with three properties, six verified technicians and sixty realistic complaint records. All complaint mutations, assignments, repair reports, costs, history and settings are persisted. SQLite uses WAL, transactions and a busy timeout. `MANAGER_DB_PATH` changes the file location. Keep its directory on persistent storage. Restarting the application does not reseed existing records.

Set `MANAGER_DATABASE_URL` to use the PostgreSQL adapter in `lib/manager/store.ts`. It creates only `campusfix_manager_state`, an isolated singleton JSONB row, and serializes writes using `SELECT FOR UPDATE`. SQLite uses `manager_state`. This compact snapshot design is intended for a small hackathon property cluster. Large networks should normalize tables, paginate server queries and move image data to object storage.

Both adapters implement `readState()` and `mutateState(callback)`. Every mutation increments the workspace revision. Complaint actions require the complaint's current `version`; settings and technician availability require the workspace `revision`. A conflict returns HTTP 409. Failed writes roll back. Costs of verified historical repairs remain visible after reopening; they are not counted twice. Estimates must cover the repair cost before verification.

One authenticated manager controls this workspace and its listed properties. This is not a multi-tenant authorization system. Replace the isolated session boundary with the team's authenticated manager identity and property authorization before onboarding unrelated organizations. In-app notification preferences work; no email, SMS or push service is configured.

## HTTP contract

All routes are same-origin under `/api/manager`; browser code never handles provider credentials. Non-GET requests use JSON, an authenticated manager session in production and same-origin validation. Mutation bodies are validated with Zod. Responses are `Cache-Control: no-store`.

| Method / path                             | Contract                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET `/health`                             | Public liveness, no workspace data                                                                                     |
| POST `/session`                           | `{ password }`; sets an HttpOnly signed 8-hour session cookie                                                          |
| DELETE `/session`                         | Clears the session cookie                                                                                              |
| GET `/`                                   | `Snapshot` from `lib/manager/domain.ts`, including all property-scoped data and capability metadata                    |
| POST `/complaints`                        | `createSchema`: title, description, reporter, propertyId, room, category, urgency, images; returns complaint, HTTP 201 |
| PATCH `/complaints/:id`                   | `actionSchema`: version, action, note and action-specific data                                                         |
| GET `/complaints/:id/recommendations`     | Eligible ranked candidates from matching rules or the configured team engine                                           |
| POST `/complaints/:id/recommendations-ai` | `{ version }`; Gemma compares eligible candidates; response cannot invent or assign technicians                        |
| POST `/complaints/:id/analyze`            | `{ version }`; validated Gemma summary, category, urgency and specialization persisted with model provenance           |
| POST `/assistant`                         | `{ question }`; structured summary, recurring issues, urgent issues and suggested actions                              |
| PATCH `/settings`                         | `{ revision, settings, properties: [{id,name,address,rooms}] }`                                                        |
| PATCH `/technicians/:id`                  | `{ revision, available }`                                                                                              |

Actions: `approve`, `reject`, `prioritize`, `reopen`, `assign`, `start`, `estimate`, `report`, `verify`. The exported `actionSchema` is the canonical payload contract. Rejection/reopening require a reason. Assignment requires a verified, available technician with matching specialization and fewer than four other active jobs. A technician report recorded here is explicitly attributed to the manager acting on the technician's behalf.

Team integration: map incoming student complaints to `createSchema` at a trusted backend boundary; map the technician completion event to `report`. Do not grant student/technician clients the manager password or expose unrestricted manager APIs. No existing portal was altered. Shared identity, event ingestion, schema agreement and external backend URLs must be supplied by the team; the current demo operates independently until then.

Images: up to three JPEG/PNG/WebP files, 1 MB each, stored as data URLs in the private database. SVG/HTML and arbitrary remote URLs are rejected. Public response error messages never include keys or upstream response bodies. The API caps request text at 4.5 MB; enforce the same limit at a production reverse proxy before buffering.

## Gemma, genuinely hosted

Provider: Google AI Studio / Google Generative Language API. Its product endpoint is called the Gemini API, but the requested model is explicitly **`gemma-4-26b-a4b-it`**. Non-Gemma model names are rejected. No Gemini fallback or mock AI response exists.

Official model documentation: https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api
API keys: https://aistudio.google.com/apikey

Set `GEMMA_API_KEY` only in ignored `.env.local` or an encrypted runtime environment variable. `GEMMA_MODEL` defaults to the model above. Keys are sent in the `x-goog-api-key` server header, never URLs, browser bundles or logs. `.env*`, runtime data and test artifacts are excluded from Docker build context and standalone output tracing. Do not paste keys into source or commit `.env.local`.

All AI output is parsed as JSON and validated with Zod. Unknown complaint/technician IDs, duplicate recommendations, invalid enum values and incomplete output are rejected. A 45-second total timeout, one bounded retry for HTTP 5xx, and explicit provider/quota/validation errors preserve saved data without claiming a result. Analysis may categorize unassigned complaints and raise urgency; it never automatically lowers manager priority, assigns a worker, approves costs or verifies work. Prompt text is treated as untrusted evidence. It is an advisory system, so the manager reviews its reasoning.

The local matching score uses specialization eligibility, verified status, availability, straight-line Haversine distance, active workload and network reliability. It is visibly labeled **CampusFix matching rules**, separate from **Gemma recommendations**. Gemma can rank and explain only the eligible set. Final assignment rechecks eligibility transactionally.

## Optional team assignment adapter

Set `SMART_ASSIGNMENT_URL` (HTTPS in production) and optionally `SMART_ASSIGNMENT_TOKEN`. The adapter POSTs `{ complaint: { id, category, urgency, propertyId }, property, candidates }`; each candidate contains technicianId, score, distanceKm, workload, specialization and reliability. Respond with:

```json
{
  "items": [
    {
      "technicianId": "t1",
      "explanation": "Available plumbing specialist with nearby coverage and spare capacity."
    }
  ]
}
```

The response order is preserved, duplicate/unknown/ineligible candidates are rejected, and failures show an explicit error. Timeout: ten seconds. Configuring this adapter does not automatically assign anyone.

## DigitalOcean preparation (not deployed)

Use either App Platform with managed PostgreSQL or a Droplet with a persistent volume for SQLite. The PostgreSQL adapter and Dockerfile are prepared; no DigitalOcean database, application or paid infrastructure was created or tested in this environment.

For App Platform, set the source directory to `campusfix`, build using `Dockerfile.manager`, expose port 3000, and use `/api/manager/health` for liveness. Alternatively use Node 24, `npm ci && npm run build` and `npm start -- -H 0.0.0.0 -p 3000` with the Node buildpack. Standalone output supports the Docker entrypoint. Add these at runtime:

| Variable                     | Requirement                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GEMMA_API_KEY`              | Encrypted Google AI Studio secret                                                                                 |
| `GEMMA_MODEL`                | `gemma-4-26b-a4b-it`                                                                                              |
| `MANAGER_LOGIN_PASSWORD`     | Strong manager password; development-only demo bypass is disabled in production                                   |
| `MANAGER_SESSION_SECRET`     | Random secret, at least 32 characters                                                                             |
| `MANAGER_APP_URL`            | Exact HTTPS public origin, without a trailing slash                                                               |
| `MANAGER_DATABASE_URL`       | Managed PostgreSQL URI; keep encrypted                                                                            |
| `MANAGER_DATABASE_CA`        | Provider PEM CA for verified TLS; remove conflicting sslmode parameters when using this explicit CA configuration |
| `MANAGER_SEED_DEMO`          | `false` for real usage; `true` for an explicitly requested demo workspace                                         |
| `SMART_ASSIGNMENT_URL/TOKEN` | Optional team endpoint and secret                                                                                 |

Use DigitalOcean's encrypted environment-variable option and restrict database access to the application. Never disable TLS certificate verification. If using SQLite on a Droplet, mount `/app/data` persistently and back it up, including WAL consistency. App Platform ephemeral local disk is unsuitable for durable SQLite data. Production authentication fails closed when credentials are missing. Add reverse-proxy distributed rate limiting for a public/multi-instance deployment; the included AI/login limiter is per process. Configure service monitoring and managed-database backups before real onboarding.

References: https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/ and https://docs.digitalocean.com/products/databases/postgresql/how-to/connect/

## Latest verification

TypeScript, lint, production build, 13 automated domain/persistence/security tests, HTTP lifecycle smoke tests and a separate production authentication smoke test passed. Browser QA covered manager-approved assignment, verification, combined filters, CSV download, technician filtering and mobile complaint creation. Live Gemma responses were verified for analysis, technician explanations and manager briefings. Responsive checks included 1440px desktop and 390px mobile; the complaint table scrolls within its container. The overview complaint-trends graph was removed at the user's request. No external PostgreSQL cluster, team assignment service or DigitalOcean deployment was available for live integration testing.
