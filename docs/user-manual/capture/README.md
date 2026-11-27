# Manual screenshots

Recreates the images in `../images` from made-up demo data. No real Supabase project or login is used: every request to `demo.supabase.co` is answered from `fixtures.cjs`.

1. Start the app against the fake backend:

   ```sh
   VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_demo \
   SUPABASE_URL=https://demo.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_demo \
   npx vite dev --port 8181 --strictPort
   ```

2. In another terminal, from a folder with Playwright installed (`npm i playwright`):

   ```sh
   node docs/user-manual/capture/capture.cjs            # all shots
   node docs/user-manual/capture/capture.cjs 17-budget  # one group
   ```

3. Rebuild the PDF behind the Download PDF button on `/help`:

   ```sh
   node docs/user-manual/capture/pdf.cjs   # writes public/user-manual.pdf
   ```

Demo dates are fixed around 27 November 2026, so some flags (overdue, upcoming) change with today's date.
