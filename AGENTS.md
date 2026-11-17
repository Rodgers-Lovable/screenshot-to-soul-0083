<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Data access goes only through repositories in `src/data/repos.ts` via TanStack Query hooks in `src/data/hooks.ts`; repos load the shared budget from Lovable Cloud (`src/data/remote.ts`), apply changes in memory and write back only changed rows, so business logic stays in the repos.
- All budget maths lives in pure `src/lib/calc.ts` (money as integer KES cents) with tests in `src/lib/calc.test.ts`.
- The app shell renders client-only (`ClientOnly` in `__root.tsx`) because the sign-in session lives in the browser; `AuthGate` shows sign-in until a team member is signed in.
- Routing uses TanStack Router (spec's React Router is not supported); sub-pages use trailing-underscore files to avoid nesting.
- Evidence files live in the private `evidence` bucket; `fileUrl` stores `storage:<path>` and is swapped for a signed link when listed.
- Budget data and evidence are readable/writable only by rows in `team_members` (`is_team_member()` in RLS); the first signed-in user claims an empty team via `join_team_if_empty`, later people are added by members with `add_team_member` — signing up alone grants no access.
