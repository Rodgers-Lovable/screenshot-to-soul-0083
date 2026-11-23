# Study Budget Tracker

Tracks a project budget in Kenyan shillings. Plan components and budget lines, split each line into events, record what every event actually cost, and attach evidence. The dashboard shows burn rate and spend against plan.

Built with TanStack Start, React 19, Tailwind v4 and shadcn/ui. Data, sign-in and evidence files live in a Supabase project.

## Setup

You need Node 24 (`nvm use` reads `.nvmrc`), npm and a Supabase project. npm is the only package manager; `.npmrc` pins exact versions and skips releases younger than a day.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key from Supabase (Project Settings, API). Each value goes in twice: once with the `VITE_` prefix for the browser (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and once without it for server rendering (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`).

3. Apply the database schema. Add `SUPABASE_DB_URL` to `.env.local` (dashboard, Connect, Session pooler, with your database password), then:

   ```sh
   npm run db:push   # runs everything in supabase/migrations
   ```

4. In the Supabase dashboard, open Authentication, URL Configuration. Set the Site URL to where the app runs (`http://localhost:8080` for local work) and add it to the redirect URLs, so confirmation emails link back to the app.

5. Start the app:

   ```sh
   npm run dev
   ```

One app holds many studies, each with its own budget, evidence and team. After signing in, a person with no study creates one and becomes its admin. Everyone else signs up, then a member of the study adds their email under Settings, Team; the study then appears in the switcher. Admins can remove people and make other members admins, and a study always keeps at least one admin. Someone who has not been added to any study sees the create-a-study screen, not the data.

On their first visit, each team member gets a short tour of the Dashboard, Budget, Events and Settings pages. The help button in the header runs it again. The steps live in `src/components/app/tour.tsx`. After changing them, bump the version in its `SEEN_KEY` so everyone sees the new tour once.

## Scripts

| Script               | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `npm run dev`        | Dev server on port 8080                                            |
| `npm run build`      | Production build (Nitro server in `.output/`)                      |
| `npm run build:dev`  | Build in development mode                                          |
| `npm run preview`    | Serve the production build locally                                 |
| `npm test`           | Vitest, single run                                                 |
| `npm run test:watch` | Vitest in watch mode                                               |
| `npm run lint`       | ESLint                                                             |
| `npm run format`     | Prettier, rewrites files in place                                  |
| `npm run db:push`    | Apply new migrations to the database in `SUPABASE_DB_URL`          |
| `npm run db:types`   | Regenerate `src/integrations/supabase/types.ts` from that database |

## Changing the schema

Add a new timestamped SQL file to `supabase/migrations/`, run `npm run db:push`, then `npm run db:types`. Don't edit a migration that has already been applied.
