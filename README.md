# Study Budget Tracker

Tracks a project budget in Kenyan shillings. Plan each year's objectives, outcomes and activities, put budget lines under each activity, split each line into events, record what every event actually cost, and attach evidence. The dashboard shows burn rate and spend against plan.

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

One app holds many studies, each with its own budget, evidence and team. Only platform admins can create a study, and they become its admin. Everyone else signs up, then a study admin adds their email under Settings, Team; the study then appears in the switcher. Study admins also remove people and make other members admins, and a study always keeps at least one admin. Someone who has not been added to any study sees a "Waiting for access" screen, not the data. Platform admins see no study's data unless they are on its team.

To make someone a platform admin, they sign up first. Then run this once in the Supabase SQL Editor, with their sign-up email in place of the placeholder:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'person@example.org';
```

The list has no client access, so the SQL Editor (or the service role) is the only way to change it.

On their first visit, each team member gets a short tour of the Dashboard, Activities, Budget, Spending and Settings pages. The help button in the header runs it again. The steps live in `src/components/app/tour.tsx`. After changing them, bump the version in its `SEEN_KEY` so everyone sees the new tour once.

## Workplan years

Each study plans and budgets by year. A year (Settings, Years) has its own dates, exchange rate, currency, workplan and budget. The year switcher in the header changes which year every page shows; the choice is remembered per study.

- Only study admins create years, edit a year's dates and exchange rate, close or reopen a year, and manage the study's site list (Settings, Sites). A study with no year asks an admin to create the first one.
- Start a new year blank, or from an earlier year. New years default to the financial year, 30 September to 29 September, and the dates stay editable. Copying brings over objectives, outcomes, activities, indicators, responsible people and site choices. Tick Include budget lines to copy the lines too, each with fresh planned records. Deliveries, spending, actuals, finance postings, receipts and evidence are never copied. Years cannot overlap.
- A closed year is read-only for everyone: workplan, budget lines, spending, actuals and evidence. The database enforces this, not just the screens. Only an admin can reopen it, and both actions go in the audit log.
- Every budget line belongs to one activity. The Budget page groups lines by objective, outcome and activity with subtotals; activities without lines show as unfunded. A line can be moved to another activity of the same year, never to another year. An activity that has lines cannot be deleted until its lines are moved. Units are free text, with suggestions from standard values and the ones already used in the year.
- Deliveries track whether an activity took place, separately from spending. Open an activity and use Create rounds: pick how many rounds and an optional first date (spaced by the activity's repeat rule when it has one), check the preview, and confirm. A site activity gets one delivery per chosen site per round, a general activity one per round. Running it again only adds what is missing. Ad hoc work uses Add one. Each delivery has a status (planned, in progress, completed), dates, notes, proof files, indicator results and optional links to spending records from the same activity. Completing a delivery needs the date it took place, and a completed delivery with no proof is flagged. An activity's status is calculated from its deliveries: none started is Planned, all completed is Completed, anything else is In progress. The Activities page shows it with a count such as 2 of 5 and can filter by status.
- A delivery that will no longer happen is deleted, and the deletion is audited. Deleting is blocked while spending is linked or proof files exist, so remove those first. Activities, outcomes and objectives with deliveries cannot be deleted, an activity with deliveries cannot change between general and site, and a site cannot be removed from it while deliveries exist there. Archiving a site keeps its deliveries visible. New years never copy deliveries, results, proof or links.
- Proof of delivery uploads to `<studyId>/deliveries/<deliveryId>/` in the evidence bucket; spending receipts keep their existing paths. The Spending page shows the linked delivery on each record, can filter by delivery, and the record form can link a record to a delivery of the same activity. Linking never changes amounts.
- Pages: Activities (`/activities`) is the workplan tree, with a detail page per activity (`/activities/:id`) for deliveries, budget lines, indicators, responsible people and sites. Spending (`/spending`) is the old Events page; `/events` links still redirect to it.

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
