CREATE TABLE public.budget_periods (id text PRIMARY KEY, project_name text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', start_date text NOT NULL DEFAULT '', end_date text NOT NULL DEFAULT '', fx_rate numeric NOT NULL DEFAULT 125);
CREATE TABLE public.components (id text PRIMARY KEY, period_id text NOT NULL, code text NOT NULL DEFAULT '', name text NOT NULL, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE public.budget_lines (id text PRIMARY KEY, component_id text NOT NULL REFERENCES public.components(id) ON DELETE CASCADE, group_label text, description text NOT NULL, quantity numeric NOT NULL, quantity_unit text NOT NULL, unit_cost_cents bigint NOT NULL, duration numeric NOT NULL, duration_unit text NOT NULL, occurrences integer NOT NULL, justification text, cost_category text, finance_posted_cents bigint, sort_order integer NOT NULL DEFAULT 0);
CREATE TABLE public.budget_events (id text PRIMARY KEY, line_id text NOT NULL REFERENCES public.budget_lines(id) ON DELETE CASCADE, sequence integer NOT NULL, title text NOT NULL, planned_date text, location text, status text NOT NULL DEFAULT 'planned', actual_date text, actual_quantity numeric, actual_unit_cost_cents bigint, actual_duration numeric, notes text);
CREATE TABLE public.attachments (id text PRIMARY KEY, event_id text NOT NULL REFERENCES public.budget_events(id) ON DELETE CASCADE, file_name text NOT NULL, file_url text NOT NULL, mime_type text NOT NULL DEFAULT '', size_bytes bigint NOT NULL DEFAULT 0, label text, uploaded_at text NOT NULL);
CREATE TABLE public.audit_log (id text PRIMARY KEY, entity text NOT NULL, entity_id text NOT NULL, field text NOT NULL, old_value text, new_value text, changed_at text NOT NULL, changed_by text NOT NULL);
CREATE INDEX ON public.budget_lines(component_id);
CREATE INDEX ON public.budget_events(line_id);
CREATE INDEX ON public.attachments(event_id);
CREATE INDEX ON public.audit_log(changed_at);
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['budget_periods','components','budget_lines','budget_events','attachments','audit_log'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "Team members can read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
  EXECUTE format('CREATE POLICY "Team members can add" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t);
  EXECUTE format('CREATE POLICY "Team members can edit" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
  EXECUTE format('CREATE POLICY "Team members can delete" ON public.%I FOR DELETE TO authenticated USING (true)', t);
END LOOP; END $$;
CREATE POLICY "Team members read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "Team members upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Team members delete evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence');