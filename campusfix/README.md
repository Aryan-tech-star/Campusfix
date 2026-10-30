# CampusFix

Shared maintenance for small hostels and PGs: REPORT → UNDERSTAND → ASSIGN → REPAIR → VERIFY.

Students report and track their own issues, managers coordinate the verified local technician pool, and technicians repair assigned jobs. Only managers verify completion. Students are not charged by CampusFix.

## Architecture

- Next.js 16 / React 19, TypeScript, Tailwind and the existing manager design system.
- Express 5 API, PostgreSQL 17 and Prisma 7 relational persistence.
- Database sessions with opaque, hashed tokens in HTTP-only cookies; scrypt passwords; server-side role and record ownership checks.
- One shared real Gemma service: `gemma-4-26b-a4b-it` using Google AI Studio's API. No Gemini substitution or fabricated AI output.
- Browser → same-origin Next API proxy → Express → PostgreSQL. No separate dashboard databases.

## Run locally

Use Node 24 and PostgreSQL. From this application directory:

```sh
npm install
# Configure .env.local from .env.example; keep populated secrets out of Git.
npm run db:generate
npm run db:migrate
# Development demo only: SEED_DEMO=true and a DEMO_PASSWORD (12+ characters).
npm run db:seed
npm run dev:api
# In another terminal:
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000/login. API health: http://127.0.0.1:4000/health.

For this Windows checkout, the private portable PostgreSQL runtime is already installed under ignored `work/`. Start it with `& .\work\postgres-local\manage.ps1 Start`; its data lives in ignored `data/postgres`. Do not commit or share those directories.

Demo emails: `manager@campusfix.demo`, `student@campusfix.demo`, `student2@campusfix.demo`, `plumber@campusfix.demo`, `electrician@campusfix.demo`, `carpenter@campusfix.demo`. Use the locally configured DEMO_PASSWORD. Student demo hostel invitation code: `CAMPUS-DEMO`. Demo seeding refuses production and never resets existing passwords.

## Checks

```sh
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build:api
npm run build
npm run test:production
```

Unit tests stub provider responses. Integration tests use real PostgreSQL and disable AI requests. Production smoke uses a disposable database (requires local CREATEDB) and dedicated ports 3107/4107; it never deploys infrastructure.

## Deployment and credentials

See [the integration guide](docs/PORTALS.md) for endpoints, migrations, authentication, production bootstrap, Vercel, DigitalOcean, Gemma testing and limitations. `.env.example` documents every variable. Frontend hosting only needs `API_BASE_URL`; secrets and `DATABASE_URL` belong on the Express server. Public administrator registration is deliberately disabled.

The previous manager SQLite file remains intact as an import source. Active API requests exclusively use PostgreSQL. The old single-password manager bypass and SQLite runtime adapter have been removed. The prior manager guide is historical design context; current setup is in PORTALS.md.

No deployment, commit or push is part of local setup.
