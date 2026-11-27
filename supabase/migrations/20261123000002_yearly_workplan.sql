-- Yearly workplan: a workplan year is a budget_periods row. Each year has objectives, outcomes,
-- activities, indicators, responsible people and site selections. Closed years are read-only,
-- enforced here by triggers. Years are written only through admin-checked functions.

-- Years
ALTER TABLE public.budget_periods ADD COLUMN copied_from_id text;
ALTER TABLE public.budget_periods ADD CONSTRAINT budget_periods_copied_from_fkey
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.budget_periods(id, study_id)
  ON DELETE SET NULL (copied_from_id);
CREATE INDEX ON public.budget_periods(copied_from_id);

-- Master site list: one per study. Sites are archived, not deleted.
CREATE TABLE public.sites (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  UNIQUE (id, study_id)
);
CREATE UNIQUE INDEX sites_study_name_key ON public.sites (study_id, lower(btrim(name)));
CREATE INDEX ON public.sites(study_id);

-- Workplan tree. Codes are free text and may repeat.
CREATE TABLE public.objectives (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  period_id text NOT NULL,
  code text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (btrim(title) <> ''),
  sort_order integer NOT NULL DEFAULT 0,
  copied_from_id text,
  UNIQUE (id, study_id),
  FOREIGN KEY (period_id, study_id) REFERENCES public.budget_periods(id, study_id) ON DELETE CASCADE,
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.objectives(id, study_id)
    ON DELETE SET NULL (copied_from_id)
);
CREATE INDEX ON public.objectives(study_id);
CREATE INDEX ON public.objectives(period_id);
CREATE INDEX ON public.objectives(copied_from_id);

CREATE TABLE public.outcomes (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  objective_id text NOT NULL,
  code text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (btrim(title) <> ''),
  sort_order integer NOT NULL DEFAULT 0,
  copied_from_id text,
  UNIQUE (id, study_id),
  FOREIGN KEY (objective_id, study_id) REFERENCES public.objectives(id, study_id) ON DELETE CASCADE,
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.outcomes(id, study_id)
    ON DELETE SET NULL (copied_from_id)
);
CREATE INDEX ON public.outcomes(study_id);
CREATE INDEX ON public.outcomes(objective_id);
CREATE INDEX ON public.outcomes(copied_from_id);

CREATE TABLE public.activities (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  outcome_id text NOT NULL,
  code text NOT NULL DEFAULT '',
  title text NOT NULL CHECK (btrim(title) <> ''),
  kind text NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'site')),
  output text NOT NULL DEFAULT '',
  means_of_verification text NOT NULL DEFAULT '',
  frequency_label text NOT NULL DEFAULT '',
  repeat_every integer CHECK (repeat_every IS NULL OR repeat_every > 0),
  repeat_unit text CHECK (repeat_unit IN ('weeks', 'months')),
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  copied_from_id text,
  CHECK ((repeat_every IS NULL) = (repeat_unit IS NULL)),
  UNIQUE (id, study_id),
  FOREIGN KEY (outcome_id, study_id) REFERENCES public.outcomes(id, study_id) ON DELETE CASCADE,
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.activities(id, study_id)
    ON DELETE SET NULL (copied_from_id)
);
CREATE INDEX ON public.activities(study_id);
CREATE INDEX ON public.activities(outcome_id);
CREATE INDEX ON public.activities(copied_from_id);

CREATE TABLE public.activity_indicators (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  target numeric CHECK (target IS NULL OR target >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  copied_from_id text,
  UNIQUE (id, study_id),
  FOREIGN KEY (activity_id, study_id) REFERENCES public.activities(id, study_id) ON DELETE CASCADE,
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.activity_indicators(id, study_id)
    ON DELETE SET NULL (copied_from_id)
);
CREATE INDEX ON public.activity_indicators(study_id);
CREATE INDEX ON public.activity_indicators(activity_id);
CREATE INDEX ON public.activity_indicators(copied_from_id);

CREATE TABLE public.activity_responsibles (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (id, study_id),
  FOREIGN KEY (activity_id, study_id) REFERENCES public.activities(id, study_id) ON DELETE CASCADE
);
CREATE INDEX ON public.activity_responsibles(study_id);
CREATE INDEX ON public.activity_responsibles(activity_id);
CREATE INDEX ON public.activity_responsibles(user_id);

CREATE TABLE public.activity_sites (
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  site_id text NOT NULL,
  PRIMARY KEY (activity_id, site_id),
  FOREIGN KEY (activity_id, study_id) REFERENCES public.activities(id, study_id) ON DELETE CASCADE,
  FOREIGN KEY (site_id, study_id) REFERENCES public.sites(id, study_id) ON DELETE RESTRICT
);
CREATE INDEX ON public.activity_sites(study_id);
CREATE INDEX ON public.activity_sites(site_id);

-- Row rules
CREATE FUNCTION public.check_activity_site() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.activities WHERE id = NEW.activity_id AND study_id = NEW.study_id AND kind = 'site'
  ) THEN
    RAISE EXCEPTION 'Only site activities can have sites';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sites WHERE id = NEW.site_id AND study_id = NEW.study_id AND archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'That site is archived. Restore it before using it';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activity_sites_check BEFORE INSERT ON public.activity_sites
  FOR EACH ROW EXECUTE FUNCTION public.check_activity_site();

CREATE FUNCTION public.check_activity_kind() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'general' AND EXISTS (
    SELECT 1 FROM public.activity_sites WHERE activity_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Remove the sites from this activity before making it a general activity';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activities_kind_check BEFORE UPDATE OF kind ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.check_activity_kind();

CREATE FUNCTION public.check_responsible_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.study_members WHERE study_id = NEW.study_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'A responsible person must be on the study team to be linked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER responsibles_member_check BEFORE INSERT OR UPDATE OF user_id ON public.activity_responsibles
  FOR EACH ROW EXECUTE FUNCTION public.check_responsible_member();

-- Closed years. The year of a row is found through its parents.
CREATE FUNCTION public.period_status_of(_tbl text, _r jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid := (_r->>'study_id')::uuid; _p text;
BEGIN
  _p := CASE
    WHEN _tbl = 'objectives' THEN _r->>'period_id'
    WHEN _tbl = 'components' THEN _r->>'period_id'
    WHEN _tbl = 'outcomes' THEN (
      SELECT o.period_id FROM public.objectives o WHERE o.id = _r->>'objective_id' AND o.study_id = _s)
    WHEN _tbl = 'activities' THEN (
      SELECT o.period_id FROM public.outcomes oc
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE oc.id = _r->>'outcome_id' AND oc.study_id = _s)
    WHEN _tbl IN ('activity_indicators', 'activity_responsibles', 'activity_sites') THEN (
      SELECT o.period_id FROM public.activities a
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE a.id = _r->>'activity_id' AND a.study_id = _s)
    WHEN _tbl = 'budget_lines' THEN (
      SELECT c.period_id FROM public.components c WHERE c.id = _r->>'component_id' AND c.study_id = _s)
    WHEN _tbl = 'budget_events' THEN (
      SELECT c.period_id FROM public.budget_lines l
      JOIN public.components c ON c.id = l.component_id AND c.study_id = l.study_id
      WHERE l.id = _r->>'line_id' AND l.study_id = _s)
    WHEN _tbl = 'attachments' THEN (
      SELECT c.period_id FROM public.budget_events e
      JOIN public.budget_lines l ON l.id = e.line_id AND l.study_id = e.study_id
      JOIN public.components c ON c.id = l.component_id AND c.study_id = l.study_id
      WHERE e.id = _r->>'event_id' AND e.study_id = _s)
  END;
  RETURN (SELECT status FROM public.budget_periods WHERE id = _p AND study_id = _s);
END $$;

CREATE FUNCTION public.closed_year_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o jsonb; _n jsonb; _k text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN _o := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN _n := to_jsonb(NEW); END IF;

  -- A whole study being deleted cascades through closed years.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN
    RETURN OLD;
  END IF;

  -- Foreign keys may clear a link (copied_from_id, user_id) when the target is deleted.
  IF TG_OP = 'UPDATE'
     AND (_n - 'copied_from_id' - 'user_id') = (_o - 'copied_from_id' - 'user_id')
     AND ((_n->>'copied_from_id') IS NULL OR (_n->>'copied_from_id') = (_o->>'copied_from_id'))
     AND ((_n->>'user_id') IS NULL OR (_n->>'user_id') = (_o->>'user_id')) THEN
    RETURN NEW;
  END IF;

  IF (_o IS NOT NULL AND public.period_status_of(TG_TABLE_NAME, _o) = 'closed')
     OR (_n IS NOT NULL AND public.period_status_of(TG_TABLE_NAME, _n) = 'closed') THEN
    RAISE EXCEPTION 'This year is closed, so it cannot be changed. A study admin can reopen it.'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'objectives', 'outcomes', 'activities', 'activity_indicators', 'activity_responsibles',
    'activity_sites', 'components', 'budget_lines', 'budget_events', 'attachments'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER closed_year_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.closed_year_guard()', t);
  END LOOP;
END $$;

-- Evidence files of a closed year cannot be added or removed.
CREATE FUNCTION public.evidence_year_closed(_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _e text;
BEGIN
  IF split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    _s := split_part(_name, '/', 1)::uuid;
    _e := split_part(_name, '/', 2);
    IF EXISTS (
      SELECT 1 FROM public.budget_events e
      WHERE e.id = _e AND e.study_id = _s AND public.period_status_of('budget_events', to_jsonb(e)) = 'closed'
    ) THEN RETURN true; END IF;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.attachments a
    WHERE a.file_url = 'storage:' || _name AND public.period_status_of('attachments', to_jsonb(a)) = 'closed'
  );
END $$;

CREATE OR REPLACE FUNCTION public.can_upload_evidence(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE user_id = auth.uid() AND study_id::text = split_part(_name, '/', 1)
  ) AND NOT public.evidence_year_closed(_name)
$$;
CREATE FUNCTION public.can_delete_evidence(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_access_evidence(_name) AND NOT public.evidence_year_closed(_name)
$$;
DROP POLICY "Study members delete evidence" ON storage.objects;
CREATE POLICY "Study members delete evidence" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND public.can_delete_evidence(name));

-- Access: members read and edit content in open years; only admins write sites.
-- Years are written only through the functions below, so members cannot touch them.
DROP POLICY "Study members can add" ON public.budget_periods;
DROP POLICY "Study members can edit" ON public.budget_periods;
DROP POLICY "Study members can delete" ON public.budget_periods;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.budget_periods FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sites', 'objectives', 'outcomes', 'activities', 'activity_indicators',
    'activity_responsibles', 'activity_sites'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY "Study members can read" ON public.%I FOR SELECT TO authenticated USING (public.is_study_member(study_id))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'objectives', 'outcomes', 'activities', 'activity_indicators', 'activity_responsibles', 'activity_sites'
  ] LOOP
    EXECUTE format('CREATE POLICY "Study members can add" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can delete" ON public.%I FOR DELETE TO authenticated USING (public.is_study_member(study_id))', t);
    EXECUTE format('GRANT INSERT, DELETE ON public.%I TO authenticated', t);
    IF t <> 'activity_sites' THEN
      EXECUTE format('CREATE POLICY "Study members can edit" ON public.%I FOR UPDATE TO authenticated USING (public.is_study_member(study_id)) WITH CHECK (public.is_study_member(study_id))', t);
      EXECUTE format('GRANT UPDATE ON public.%I TO authenticated', t);
    END IF;
  END LOOP;
END $$;

CREATE POLICY "Study admins can add sites" ON public.sites
  FOR INSERT TO authenticated WITH CHECK (public.is_study_admin(study_id));
CREATE POLICY "Study admins can edit sites" ON public.sites
  FOR UPDATE TO authenticated USING (public.is_study_admin(study_id)) WITH CHECK (public.is_study_admin(study_id));
GRANT INSERT, UPDATE ON public.sites TO authenticated;

-- Year functions
CREATE FUNCTION public.audit_entry(_study_id uuid, _entity text, _entity_id text, _field text, _old text, _new text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_log(id, entity, entity_id, field, old_value, new_value, changed_at, changed_by, study_id)
  VALUES (
    gen_random_uuid()::text, _entity, _entity_id, _field, _old, _new,
    to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), auth.uid()::text, 'unknown'),
    _study_id)
$$;
REVOKE EXECUTE ON FUNCTION public.audit_entry(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.check_year_fields(
  _study_id uuid, _except_id text, _name text, _start date, _end date, _fx numeric, _currency text
) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF btrim(coalesce(_name, '')) = '' THEN RAISE EXCEPTION 'A year needs a name'; END IF;
  IF _start IS NULL OR _end IS NULL THEN RAISE EXCEPTION 'A year needs a start and end date'; END IF;
  IF _end <= _start THEN RAISE EXCEPTION 'The end date must be after the start date'; END IF;
  IF _fx IS NULL OR _fx <= 0 THEN RAISE EXCEPTION 'The exchange rate must be above zero'; END IF;
  IF _currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'The currency must be a 3-letter code such as KES'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.budget_periods p
    WHERE p.study_id = _study_id AND p.id IS DISTINCT FROM _except_id
      AND p.start_date ~ '^\d{4}-\d{2}-\d{2}$' AND p.end_date ~ '^\d{4}-\d{2}-\d{2}$'
      AND p.start_date::date <= _end AND _start <= p.end_date::date
  ) THEN
    RAISE EXCEPTION 'These dates overlap another year of this study';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_year_fields(uuid, text, text, date, date, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_workplan_year(
  _study_id uuid, _name text, _start_date date, _end_date date,
  _fx_rate numeric, _currency text, _copy_from_period_id text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id text := gen_random_uuid()::text; _project text := ''; _cur text := upper(btrim(coalesce(_currency, 'KES')));
        _n_obj int := 0; _n_out int := 0; _n_act int := 0; _n_ind int := 0; _n_res int := 0; _n_site int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can create a year';
  END IF;
  -- One year change at a time per study, so overlap checks cannot race.
  PERFORM 1 FROM public.studies WHERE id = _study_id FOR UPDATE;
  PERFORM public.check_year_fields(_study_id, NULL, _name, _start_date, _end_date, _fx_rate, _cur);

  IF _copy_from_period_id IS NOT NULL THEN
    SELECT project_name INTO _project FROM public.budget_periods
    WHERE id = _copy_from_period_id AND study_id = _study_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'The year to copy from is not in this study'; END IF;
  ELSE
    SELECT project_name INTO _project FROM public.budget_periods
    WHERE study_id = _study_id ORDER BY start_date DESC LIMIT 1;
  END IF;

  INSERT INTO public.budget_periods(id, study_id, project_name, name, start_date, end_date, fx_rate, currency, status, copied_from_id)
  VALUES (_id, _study_id, coalesce(_project, ''), btrim(_name), _start_date::text, _end_date::text, _fx_rate, _cur, 'open', _copy_from_period_id);

  IF _copy_from_period_id IS NOT NULL THEN
    INSERT INTO public.objectives(id, study_id, period_id, code, title, sort_order, copied_from_id)
    SELECT gen_random_uuid()::text, o.study_id, _id, o.code, o.title, o.sort_order, o.id
    FROM public.objectives o WHERE o.study_id = _study_id AND o.period_id = _copy_from_period_id;
    GET DIAGNOSTICS _n_obj = ROW_COUNT;

    INSERT INTO public.outcomes(id, study_id, objective_id, code, title, sort_order, copied_from_id)
    SELECT gen_random_uuid()::text, oc.study_id, no.id, oc.code, oc.title, oc.sort_order, oc.id
    FROM public.outcomes oc
    JOIN public.objectives no ON no.copied_from_id = oc.objective_id AND no.study_id = _study_id AND no.period_id = _id
    WHERE oc.study_id = _study_id;
    GET DIAGNOSTICS _n_out = ROW_COUNT;

    INSERT INTO public.activities(id, study_id, outcome_id, code, title, kind, output, means_of_verification,
      frequency_label, repeat_every, repeat_unit, notes, sort_order, copied_from_id)
    SELECT gen_random_uuid()::text, a.study_id, nc.id, a.code, a.title, a.kind, a.output, a.means_of_verification,
      a.frequency_label, a.repeat_every, a.repeat_unit, a.notes, a.sort_order, a.id
    FROM public.activities a
    JOIN public.outcomes nc ON nc.copied_from_id = a.outcome_id AND nc.study_id = _study_id
    JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = _study_id AND no.period_id = _id
    WHERE a.study_id = _study_id;
    GET DIAGNOSTICS _n_act = ROW_COUNT;

    INSERT INTO public.activity_indicators(id, study_id, activity_id, name, target, sort_order, copied_from_id)
    SELECT gen_random_uuid()::text, i.study_id, na.id, i.name, i.target, i.sort_order, i.id
    FROM public.activity_indicators i
    JOIN public.activities na ON na.copied_from_id = i.activity_id AND na.study_id = _study_id
    JOIN public.outcomes nc ON nc.id = na.outcome_id AND nc.study_id = _study_id
    JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = _study_id AND no.period_id = _id
    WHERE i.study_id = _study_id;
    GET DIAGNOSTICS _n_ind = ROW_COUNT;

    INSERT INTO public.activity_responsibles(id, study_id, activity_id, name, user_id, sort_order)
    SELECT gen_random_uuid()::text, r.study_id, na.id, r.name,
      CASE WHEN EXISTS (SELECT 1 FROM public.study_members m WHERE m.study_id = r.study_id AND m.user_id = r.user_id)
           THEN r.user_id END,
      r.sort_order
    FROM public.activity_responsibles r
    JOIN public.activities na ON na.copied_from_id = r.activity_id AND na.study_id = _study_id
    JOIN public.outcomes nc ON nc.id = na.outcome_id AND nc.study_id = _study_id
    JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = _study_id AND no.period_id = _id
    WHERE r.study_id = _study_id;
    GET DIAGNOSTICS _n_res = ROW_COUNT;

    INSERT INTO public.activity_sites(study_id, activity_id, site_id)
    SELECT s.study_id, na.id, s.site_id
    FROM public.activity_sites s
    JOIN public.sites st ON st.id = s.site_id AND st.study_id = s.study_id AND st.archived_at IS NULL
    JOIN public.activities na ON na.copied_from_id = s.activity_id AND na.study_id = _study_id AND na.kind = 'site'
    JOIN public.outcomes nc ON nc.id = na.outcome_id AND nc.study_id = _study_id
    JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = _study_id AND no.period_id = _id
    WHERE s.study_id = _study_id;
    GET DIAGNOSTICS _n_site = ROW_COUNT;
  END IF;

  PERFORM public.audit_entry(_study_id, 'period', _id, '(created)', NULL, btrim(_name));
  IF _copy_from_period_id IS NOT NULL THEN
    PERFORM public.audit_entry(_study_id, 'period', _id, 'copied_from_id', NULL, _copy_from_period_id);
    PERFORM public.audit_entry(_study_id, 'period', _id, '(copied)', NULL,
      format('%s objectives, %s outcomes, %s activities, %s indicators, %s responsible, %s sites',
        _n_obj, _n_out, _n_act, _n_ind, _n_res, _n_site));
  END IF;
  RETURN _id;
END $$;

CREATE FUNCTION public.update_workplan_year(
  _period_id text, _project_name text, _name text, _start_date date, _end_date date,
  _fx_rate numeric, _currency text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.budget_periods; _cur text := upper(btrim(coalesce(_currency, 'KES')));
BEGIN
  SELECT * INTO _p FROM public.budget_periods WHERE id = _period_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_study_admin(_p.study_id) THEN
    RAISE EXCEPTION 'Only study admins can change a year';
  END IF;
  PERFORM 1 FROM public.studies WHERE id = _p.study_id FOR UPDATE;
  SELECT * INTO _p FROM public.budget_periods WHERE id = _period_id FOR UPDATE;
  IF _p.status = 'closed' THEN
    RAISE EXCEPTION 'This year is closed, so it cannot be changed. A study admin can reopen it.';
  END IF;
  PERFORM public.check_year_fields(_p.study_id, _period_id, _name, _start_date, _end_date, _fx_rate, _cur);

  UPDATE public.budget_periods SET project_name = btrim(coalesce(_project_name, '')), name = btrim(_name),
    start_date = _start_date::text, end_date = _end_date::text, fx_rate = _fx_rate, currency = _cur
  WHERE id = _period_id;

  IF _p.project_name IS DISTINCT FROM btrim(coalesce(_project_name, '')) THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'projectName', _p.project_name, btrim(coalesce(_project_name, ''))); END IF;
  IF _p.name IS DISTINCT FROM btrim(_name) THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'name', _p.name, btrim(_name)); END IF;
  IF _p.start_date IS DISTINCT FROM _start_date::text THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'startDate', _p.start_date, _start_date::text); END IF;
  IF _p.end_date IS DISTINCT FROM _end_date::text THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'endDate', _p.end_date, _end_date::text); END IF;
  IF _p.fx_rate IS DISTINCT FROM _fx_rate THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'fxRate', _p.fx_rate::text, _fx_rate::text); END IF;
  IF _p.currency IS DISTINCT FROM _cur THEN
    PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'currency', _p.currency, _cur); END IF;
END $$;

CREATE FUNCTION public.set_workplan_year_status(_period_id text, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.budget_periods;
BEGIN
  IF _status NOT IN ('open', 'closed') THEN RAISE EXCEPTION 'A year is either open or closed'; END IF;
  SELECT * INTO _p FROM public.budget_periods WHERE id = _period_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_study_admin(_p.study_id) THEN
    RAISE EXCEPTION 'Only study admins can close or reopen a year';
  END IF;
  SELECT * INTO _p FROM public.budget_periods WHERE id = _period_id FOR UPDATE;
  IF _p.status = _status THEN RETURN; END IF;
  UPDATE public.budget_periods SET status = _status WHERE id = _period_id;
  PERFORM public.audit_entry(_p.study_id, 'period', _period_id, 'status', _p.status, _status);
END $$;

-- Function access: signed-in users only. Trigger functions are never called directly.
REVOKE EXECUTE ON FUNCTION public.create_workplan_year(uuid, text, date, date, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_workplan_year(text, text, text, date, date, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_workplan_year_status(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workplan_year(uuid, text, date, date, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workplan_year(text, text, text, date, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workplan_year_status(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_activity_site() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_activity_kind() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_responsible_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.period_status_of(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.closed_year_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evidence_year_closed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_delete_evidence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_evidence(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_upload_evidence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_evidence(text) TO authenticated;
