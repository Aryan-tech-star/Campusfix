# CampusFix manager workspace

Responsive Next.js 16 / React 19 / TypeScript / Tailwind 4 dashboard for the shared hostel maintenance network.

```powershell
cd E:\Campusfix\campusfix
npm install
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:3000/manager. On a fresh clone, copy `.env.example` to `.env.local` and add the server-only Google AI Studio key. Do not overwrite an existing `.env.local`.

Includes complaint approval/search/filtering, verified technician matching and assignment, repair reports and cost verification, analytics, settings, persistent SQLite/PostgreSQL adapters, and real Gemma analysis, recommendations and manager briefings. The overview complaint-trends graph was removed as requested and replaced with an actionable attention queue.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

See [manager integration and deployment guide](docs/MANAGER_INTEGRATION.md) for all environment variables, API contracts, demo behavior, security limits, teammate integration and DigitalOcean deployment preparation. Nothing has been deployed.
