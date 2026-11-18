## Project rules

- Data access goes only through repositories in `src/data/repos.ts` via TanStack Query hooks in `src/data/hooks.ts`; repos load the shared budget from Supabase (`src/data/remote.ts`), apply changes in memory and write back only changed rows, so business logic stays in the repos.
- All budget maths lives in pure `src/lib/calc.ts` (money as integer KES cents) with tests in `src/lib/calc.test.ts`.
- The app shell renders client-only (`ClientOnly` in `__root.tsx`) because the sign-in session lives in the browser; `AuthGate` shows sign-in until a team member is signed in.
- Routing uses TanStack Router (spec's React Router is not supported); sub-pages use trailing-underscore files to avoid nesting.
- Evidence files live in the private `evidence` bucket; `fileUrl` stores `storage:<path>` and is swapped for a signed link when listed.
- Budget data and evidence are readable/writable only by rows in `team_members` (`is_team_member()` in RLS); the first signed-in user claims an empty team via `join_team_if_empty`, later people are added by members with `add_team_member` and removed only by admins (`user_roles`, `has_role`) via `remove_team_member`; admins grant or revoke admin with `set_team_admin`, which always leaves at least one admin — signing up alone grants no access.
- Backend is the team's own hosted Supabase project. Schema changes are new SQL files in `supabase/migrations/` (timestamped, never edit an applied one), pushed with `npm run db:push`; regenerate `src/integrations/supabase/types.ts` with `npm run db:types` afterwards.
- Supabase credentials live in `.env.local` (untracked, see `.env.example`). Not `.env`: an old commit tracked `.env`, so checking out history can overwrite or delete it. Never commit keys; the service role key stays server-only.
