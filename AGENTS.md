# AGENTS.md

## Project overview

This repository contains a Next.js App Router car-maintenance application backed by Supabase.

Core technologies:

- Next.js 16
- React 19
- TypeScript in strict mode
- Supabase Auth and Postgres
- Tailwind CSS 4, although most current UI styling uses inline React styles
- npm and `package-lock.json`

The application is garage-scoped. Users access vehicles, maintenance items, members, and ideas through their garage membership.

## Repository map

- `app/page.tsx`: authenticated garage dashboard
- `app/login/page.tsx`: password sign-in and sign-up
- `app/profile/page.tsx`: Auth metadata profile editing
- `app/members/page.tsx`: garage membership and role management
- `app/ideas/page.tsx`: garage-scoped idea tracker
- `app/vehicle/[id]/page.tsx`: vehicle maintenance management
- `app/uiStyles.ts`: shared inline style primitives
- `app/globals.css`: Tailwind import and global styles
- `lib/supabaseClient.ts`: browser Supabase client
- `public/`: static assets

There are currently no server routes, middleware, automated tests, checked-in Supabase migrations, or generated database types.

## Commands

Use npm because `package-lock.json` is authoritative.

- Install: `npm ci`
- Develop: `npm run dev`
- Lint: `npm run lint`
- Production build: `npm run build`
- Start production build: `npm run start`

Before completing a code change, run the narrowest relevant checks and normally run `npm run lint`. Run `npm run build` for changes affecting routing, rendering, configuration, types, or production behavior.

The lint baseline may already contain known failures. Do not silently fix unrelated warnings or errors; report baseline issues separately from issues introduced by the change.

## Environment and secrets

The browser client requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never print, commit, copy, or expose values from `.env.local` or other `.env*` files.

Never introduce a Supabase service-role key into browser code or any `NEXT_PUBLIC_*` variable. Administrative operations belong in a trusted server environment.

## Supabase safety

The application currently calls Supabase directly from client components. Treat Row Level Security and database functions as the security boundary.

Tables currently referenced:

- `garage_members`
- `profiles`
- `vehicles`
- `maintenance_items`
- `ideas`

RPC currently referenced:

- `add_garage_member`

Before changing queries or mutations:

1. Preserve garage scoping.
2. Preserve authenticated-user ownership fields such as `created_by`.
3. Do not assume client-side checks provide authorization.
4. Verify that sensitive writes are protected by RLS or a security-reviewed RPC.
5. Avoid broad unscoped selects, updates, or deletes.
6. Do not invent schema fields, policies, triggers, or RPC behavior that are not documented or represented in migrations.
7. If a task depends on unknown database behavior, state the assumption and ask for the schema or Supabase migration source.

Any schema or RLS change should be represented by a reviewed migration rather than described only as a dashboard operation.

Do not execute or propose executing schema changes, RLS policy changes, SQL, RPC changes, or destructive database operations without first explaining the change and receiving explicit user approval. Provide SQL separately for review before it is run.

## Current domain assumptions

- A user can have one or more `garage_members` rows.
- The UI currently treats the first returned membership as the active garage.
- Vehicles and ideas belong to a garage.
- Maintenance items belong to both a garage and a vehicle.
- Roles currently used by the UI are `owner` and `member`.
- Idea statuses currently used are `open`, `planned`, and `done`.
- A maintenance item is completed when `completed_at` is non-null.
- An incomplete item is overdue before today and upcoming when due within 30 days.

Do not change these rules incidentally. If business behavior must change, make it explicit and keep all screens consistent.

## Authentication and routing

Protected routes currently perform client-side authentication checks and redirect to `/login`.

When editing authentication:

- Preserve redirect behavior unless the task changes it.
- Avoid exposing protected data during loading.
- Keep sign-out behavior consistent.
- Remember that route guards improve UX but do not replace RLS.
- Do not add middleware or server-side auth architecture as an incidental refactor.

Routes:

- `/login`
- `/`
- `/profile`
- `/members`
- `/ideas`
- `/vehicle/[id]`

## UI conventions

The existing UI uses:

- A dark gray palette
- Centered page widths around 720–820px
- Inline `CSSProperties`
- Shared primitives from `app/uiStyles.ts`
- Rounded panels, inputs, and buttons
- Red/amber maintenance urgency states

For small changes, follow the existing visual language and reuse `app/uiStyles.ts` where possible.

Do not introduce a new component library, state library, form library, or styling system without explicit approval. Tailwind is installed, but converting existing inline styles to Tailwind should be treated as a deliberate migration.

When a pattern repeats across multiple pages, prefer a small typed reusable component or helper over another copied implementation, provided the task scope allows refactoring.

Maintain keyboard usability, visible focus behavior, semantic labels, and mobile layouts. Modals should include dialog semantics and focus handling.

## TypeScript and code quality

- Keep strict TypeScript enabled.
- Avoid introducing new `any` types when practical. Do not perform unrelated type cleanup solely to remove existing `any` usage.
- Prefer shared domain types or generated Supabase types over repeated casts.
- Keep route components focused; extract reusable business logic, hooks, or components when repetition becomes material.
- Do not suppress ESLint rules without a specific documented reason.
- Preserve the `@/*` path alias.
- Avoid unrelated formatting or broad cleanup.
- Do not edit generated files such as `next-env.d.ts` or `.next/**`.

## Data and date handling

Supabase date-only values are represented as `YYYY-MM-DD`; timestamps are ISO strings.

Be careful when parsing date-only values with JavaScript because timezone conversion can shift calendar dates. Centralize maintenance status calculations if modifying them so the dashboard and vehicle view use identical rules.

Avoid destructive mutations without confirmation in the UI. Deletes must remain scoped to the intended record and rely on RLS authorization.

## Testing expectations

There is no automated test suite yet.

For changes:

- Exercise affected routes manually.
- Check unauthenticated redirects.
- Check loading, empty, success, and error states.
- Check garage isolation assumptions.
- For mutations, verify both the UI result and persisted Supabase result.
- Run lint and, when appropriate, a production build.

If adding tests, keep setup narrowly scoped and document the command in `README.md` and `package.json`.

## Change discipline

- Inspect `git status` before and after work.
- Preserve user changes and unrelated worktree modifications.
- Make the smallest coherent change that satisfies the request.
- Do not modify Supabase production data during repository validation.
- Do not deploy, change Vercel settings, or alter remote Supabase configuration unless explicitly requested.
- Do not regenerate the lockfile unless dependencies actually change.
- Clearly report files changed, checks run, known failures, and any database assumptions.

Do not commit, push, merge, or deploy changes unless explicitly requested. Local code changes and validation should normally happen before any Git or Vercel action.

## Documentation

Update `README.md` when changing:

- setup or required environment variables
- routes or user-visible features
- scripts or validation steps
- Supabase schema/RPC prerequisites
- deployment requirements
- important architectural conventions

Never place real credentials, project URLs intended to remain private, or user data in documentation.
