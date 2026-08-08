# Car Maintenance App

A garage-scoped web app for tracking vehicles and their maintenance. Users can create an account, manage vehicles, schedule maintenance, review overdue or upcoming work, manage garage members, and keep a backlog of future ideas.

## Current features

| Route | Purpose |
|---|---|
| `/login` | Sign in or create an account with email and password |
| `/` | View the garage dashboard, maintenance alerts, and vehicles |
| `/vehicle/[id]` | Add, edit, complete, or reopen maintenance items for a vehicle |
| `/profile` | Update the signed-in user's display name |
| `/members` | Add garage members and assign `owner` or `member` roles |
| `/ideas` | Track garage-scoped ideas with `open`, `planned`, and `done` statuses |

Protected routes check authentication in the browser and redirect signed-out users to `/login`.

The app currently selects the user's first garage membership as the active garage. There is not yet a garage selector.

## Technology

- Next.js 16 with the App Router
- React 19
- TypeScript with strict mode
- Supabase Auth and Postgres
- Supabase JavaScript client
- Tailwind CSS 4, although the current UI primarily uses inline React styles
- npm
- Vercel deployment

## Prerequisites

Install:

- Git
- Node.js and npm
- Access to the project's Supabase configuration

The repository does not currently pin a Node.js version. Use a currently supported Node.js version compatible with Next.js 16, and record the chosen version here if the project standardizes one.

The application also requires an existing Supabase backend with the expected tables, RLS policies, and database function. Database migrations are not currently included in this repository.

## Development setup

### Windows

In PowerShell:

```powershell
git clone <repository-url>
Set-Location car-maintenance-app
npm ci
Copy-Item .env.local.example .env.local
npm run dev
```

If PowerShell blocks `npm.ps1`, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then close and reopen PowerShell before retrying the npm command.

### macOS

In Terminal:

```bash
git clone <repository-url>
cd car-maintenance-app
npm ci
cp .env.local.example .env.local
npm run dev
```

## Environment variables

Copy `.env.local.example` to `.env.local`, then supply the project-specific values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Obtain the values from the project's Supabase configuration. Never commit `.env.local` or expose a Supabase service-role key through a `NEXT_PUBLIC_*` variable.

## Running locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other commands:

```bash
npm run lint
npm run build
npm run start
```

`npm run start` requires a successful `npm run build` first.

There is no automated test suite yet. The current lint baseline also contains existing errors and a warning; distinguish those from problems introduced by new work.

## Supabase dependency and security

The browser communicates directly with Supabase for authentication and application data. Row Level Security and reviewed database functions are therefore the primary authorization boundary; client-side checks are not sufficient security.

The frontend currently references:

- `garage_members`
- `profiles`
- `vehicles`
- `maintenance_items`
- `ideas`
- `add_garage_member` RPC

The exact schema, constraints, triggers, RPC implementation, and RLS policies are not included in this repository, so a fresh Supabase project cannot currently be reconstructed from source alone. The process for creating a user's initial garage membership is also not documented.

Before changing schema, SQL, RPCs, RLS policies, or production data, explain the proposed change and obtain explicit approval. Provide SQL separately for review before running it.

## Git workflow

The current workflow is to work directly on `main`.

Before starting work:

```bash
git status
git switch main
git pull
```

Make focused local changes, then review and validate them:

```bash
git status
git diff
npm run lint
npm run build
```

Commit and push intentionally after validation:

```bash
git add <files>
git commit -m "Describe the change"
git push origin main
```

Feature branches are optional and may be useful for larger or experimental work.

Do not commit, push, merge, or deploy unless that action is explicitly intended. Local implementation and validation should normally happen first.

## Vercel deployment

GitHub is connected to the existing Vercel `car-maintenance-app` project. Pushes to `main` currently trigger a production deployment.

The required Supabase variables must be configured in the Vercel project's environment settings. Assign them to the appropriate Development, Preview, and Production environments when those environments are used.

The repository does not contain a tracked `vercel.json`; deployment behavior beyond the existing GitHub integration is controlled through the Vercel project settings.

Run `npm run build` locally before intentionally pushing a production change.

## Returning to the project later

1. Read `README.md` and `AGENTS.md`.
2. Run `git status`, switch to `main`, and run `git pull` before changing anything.
3. Review recent commits to recall the current state.
4. Confirm `.env.local` exists without displaying or sharing its values.
5. Check the Supabase project status before troubleshooting application code; Supabase may pause the project after prolonged inactivity.
6. Run `npm ci` if dependencies may have changed.
7. Start the app with `npm run dev`.
8. Verify sign-in, garage access, and the affected route.
9. Run lint and a production build before shipping.
10. Review Supabase and Vercel settings before any backend or deployment action.

## Future AI-assisted document processing

A future version of the app could act as a more complete digital glovebox by letting users upload documents for a specific vehicle. Initial document types could include inspection reports, registration documents, and repair invoices.

The intended experience is:

- Save each original document in private Supabase Storage with access limited to authorized garage members.
- Process documents on the server with OpenAI so API credentials and document-processing logic are never exposed to the browser.
- Extract inspection and registration expiration dates for review.
- Extract structured repair-invoice details such as the repair date, shop, services performed, parts, totals, and other useful vehicle-maintenance information when present.
- Preserve structured extraction results as a reviewable draft rather than treating AI output as authoritative.
- Require the user to review, correct, and explicitly approve extracted information before it is written to application records.

### Staged implementation plan

1. Define the supported document types, review experience, privacy expectations, and extraction fields.
2. Add authenticated vehicle document uploads and private original-file storage.
3. Add a server-side processing workflow that sends supported documents to OpenAI and returns structured draft results.
4. Build a review screen where users can compare the original document with extracted fields and make corrections.
5. Add explicit approval and persistence of reviewed results, followed by retry handling, processing status, and operational monitoring.

Any required database schema, SQL, Storage policy, RLS policy, or RPC changes must be designed and reviewed separately before implementation.

## Known project gaps

- No pinned Node.js version
- No checked-in Supabase migrations or generated database types
- No documented initial garage provisioning process
- No automated tests
- No centralized server-side authentication guard
