# Study Budget Tracker

Tracks a project budget in Kenyan shillings. Plan components and budget lines, split each line into events, record what every event actually cost, and attach evidence. The dashboard shows burn rate and spend against plan.

Built with TanStack Start, React 19, Tailwind v4 and shadcn/ui. Data, sign-in and evidence files live in a Supabase project.

## Setup

You need Node 24 (`nvm use` reads `.nvmrc`), npm and a Supabase project. npm is the only package manager; `.npmrc` pins exact versions and skips releases younger than a day.

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key from Supabase (Project Settings, API).

3. Apply the database schema. Add `SUPABASE_DB_URL` to `.env.local` (dashboard, Connect, Session pooler, with your database password), then:

   ```sh
   npm run db:push   # runs everything in supabase/migrations
   ```

4. In the Supabase dashboard, open Authentication, URL Configuration. Set the Site URL to where the app runs (`http://localhost:8080` for local work) and add it to the redirect URLs, so confirmation emails link back to the app.

5. Start the app:

   ```sh
   npm run dev
   ```

The first person to sign in claims the team and becomes admin. Everyone else signs up, then a team member adds them under Settings, Team. An account that has not been added sees a waiting screen.

## Scripts

| Script             | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `npm run dev`      | Dev server on port 8080                                            |
| `npm run build`    | Production build (Nitro server in `.output/`)                      |
| `npm test`         | Vitest                                                             |
| `npm run lint`     | ESLint                                                             |
| `npm run db:push`  | Apply new migrations to the database in `SUPABASE_DB_URL`          |
| `npm run db:types` | Regenerate `src/integrations/supabase/types.ts` from that database |

## Changing the schema

Add a new timestamped SQL file to `supabase/migrations/`, run `npm run db:push`, then `npm run db:types`. Don't edit a migration that has already been applied.
