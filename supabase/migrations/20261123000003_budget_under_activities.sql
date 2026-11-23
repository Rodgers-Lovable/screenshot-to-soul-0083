-- Budget under activities: every budget line belongs to one activity of a workplan year.
-- Components are retired. The table and budget_lines.component_id stay as rollback data only.
BEGIN;

ALTER TABLE public.budget_lines
  ADD COLUMN activity_id text,
  ADD COLUMN copied_from_id text;

-- Backfill. A component that has lines becomes an objective, an outcome and a general activity,
-- all with the component's code and name, in the component's year. Empty components are skipped.
-- A component whose year is missing is placed in its study's latest year. A study with no year
-- at all stops the migration, so no line is ever lost or left without a home.
-- The closed-year triggers would block writes into closed years, so only they are switched off,
-- only on the four tables written here, and they are switched back on and checked below.
ALTER TABLE public.objectives DISABLE TRIGGER closed_year_guard;
ALTER TABLE public.outcomes DISABLE TRIGGER closed_year_guard;
ALTER TABLE public.activities DISABLE TRIGGER closed_year_guard;
ALTER TABLE public.budget_lines DISABLE TRIGGER closed_year_guard;

DO $$
DECLARE
  c record; l record;
  _actor constant text := 'system: budget under activities migration';
  _now constant text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  _period text; _title text; _obj text; _out text; _act text; _order int; _n int;
BEGIN
  FOR c IN
    SELECT * FROM public.components k
    WHERE EXISTS (SELECT 1 FROM public.budget_lines b WHERE b.component_id = k.id AND b.study_id = k.study_id)
    ORDER BY k.study_id, k.sort_order, k.code, k.id
  LOOP
    SELECT p.id INTO _period FROM public.budget_periods p
    WHERE p.id = c.period_id AND p.study_id = c.study_id;
    IF _period IS NULL THEN
      SELECT p.id INTO _period FROM public.budget_periods p
      WHERE p.study_id = c.study_id ORDER BY p.start_date DESC, p.id DESC LIMIT 1;
      IF _period IS NULL THEN
        RAISE EXCEPTION 'Cannot move budget lines under activities: component % has lines but its study has no year. Create a year for the study, then apply this migration again.', c.id;
      END IF;
      INSERT INTO public.audit_log(id, entity, entity_id, field, old_value, new_value, changed_at, changed_by, study_id)
      VALUES (gen_random_uuid()::text, 'component', c.id, 'periodId', c.period_id, _period, _now, _actor, c.study_id);
    END IF;

    _title := coalesce(nullif(btrim(c.name), ''), 'Untitled');
    _obj := gen_random_uuid()::text; _out := gen_random_uuid()::text; _act := gen_random_uuid()::text;

    SELECT coalesce(max(sort_order), 0) + 1 INTO _order FROM public.objectives
    WHERE study_id = c.study_id AND period_id = _period;
    INSERT INTO public.objectives(id, study_id, period_id, code, title, sort_order)
    VALUES (_obj, c.study_id, _period, c.code, _title, _order);
    INSERT INTO public.outcomes(id, study_id, objective_id, code, title, sort_order)
    VALUES (_out, c.study_id, _obj, c.code, _title, 1);
    INSERT INTO public.activities(id, study_id, outcome_id, code, title, kind, sort_order)
    VALUES (_act, c.study_id, _out, c.code, _title, 'general', 1);

    UPDATE public.budget_lines SET activity_id = _act
    WHERE component_id = c.id AND study_id = c.study_id;
    GET DIAGNOSTICS _n = ROW_COUNT;

    INSERT INTO public.audit_log(id, entity, entity_id, field, old_value, new_value, changed_at, changed_by, study_id)
    VALUES
      (gen_random_uuid()::text, 'objective', _obj, '(created)', NULL, _title, _now, _actor, c.study_id),
      (gen_random_uuid()::text, 'outcome', _out, '(created)', NULL, _title, _now, _actor, c.study_id),
      (gen_random_uuid()::text, 'activity', _act, '(created)', NULL, _title, _now, _actor, c.study_id),
      (gen_random_uuid()::text, 'component', c.id, '(converted)', NULL,
        format('%s budget lines moved to activity %s', _n, _act), _now, _actor, c.study_id);
    FOR l IN SELECT id FROM public.budget_lines WHERE activity_id = _act AND study_id = c.study_id LOOP
      INSERT INTO public.audit_log(id, entity, entity_id, field, old_value, new_value, changed_at, changed_by, study_id)
      VALUES (gen_random_uuid()::text, 'line', l.id, 'activityId', NULL, _act, _now, _actor, c.study_id);
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.budget_lines WHERE activity_id IS NULL) THEN
    RAISE EXCEPTION 'Some budget lines still have no activity, so the migration is stopped';
  END IF;
END $$;

ALTER TABLE public.objectives ENABLE TRIGGER closed_year_guard;
ALTER TABLE public.outcomes ENABLE TRIGGER closed_year_guard;
ALTER TABLE public.activities ENABLE TRIGGER closed_year_guard;
ALTER TABLE public.budget_lines ENABLE TRIGGER closed_year_guard;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM pg_trigger
    WHERE tgname = 'closed_year_guard' AND tgenabled = 'O'
      AND tgrelid IN ('public.objectives'::regclass, 'public.outcomes'::regclass,
                      'public.activities'::regclass, 'public.budget_lines'::regclass)
  ) <> 4 THEN
    RAISE EXCEPTION 'The closed-year triggers are not all enabled again';
  END IF;
END $$;

-- Links. An activity with lines cannot be deleted, and a study delete still cascades.
ALTER TABLE public.budget_lines ALTER COLUMN activity_id SET NOT NULL;
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_activity_study_fkey
  FOREIGN KEY (activity_id, study_id) REFERENCES public.activities(id, study_id);
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_copied_from_fkey
  FOREIGN KEY (copied_from_id, study_id) REFERENCES public.budget_lines(id, study_id)
  ON DELETE SET NULL (copied_from_id);
CREATE INDEX ON public.budget_lines(activity_id);
CREATE INDEX ON public.budget_lines(copied_from_id);

-- component_id is rollback data now. Deleting a component can never delete lines.
ALTER TABLE public.budget_lines ALTER COLUMN component_id DROP NOT NULL;
ALTER TABLE public.budget_lines DROP CONSTRAINT budget_lines_component_study_fkey;
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_component_study_fkey
  FOREIGN KEY (component_id, study_id) REFERENCES public.components(id, study_id)
  ON DELETE SET NULL (component_id);

-- The app no longer reads or writes components.
DROP POLICY "Study members can read" ON public.components;
DROP POLICY "Study members can add" ON public.components;
DROP POLICY "Study members can edit" ON public.components;
DROP POLICY "Study members can delete" ON public.components;
REVOKE ALL ON public.components FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.components TO service_role;

-- A year is now found through activity, outcome and objective.
CREATE OR REPLACE FUNCTION public.period_status_of(_tbl text, _r jsonb) RETURNS text
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
      SELECT o.period_id FROM public.activities a
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE a.id = _r->>'activity_id' AND a.study_id = _s)
    WHEN _tbl = 'budget_events' THEN (
      SELECT o.period_id FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE l.id = _r->>'line_id' AND l.study_id = _s)
    WHEN _tbl = 'attachments' THEN (
      SELECT o.period_id FROM public.budget_events e
      JOIN public.budget_lines l ON l.id = e.line_id AND l.study_id = e.study_id
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE e.id = _r->>'event_id' AND e.study_id = _s)
  END;
  RETURN (SELECT status FROM public.budget_periods WHERE id = _p AND study_id = _s);
END $$;

-- Foreign keys may also clear component_id when a component is deleted.
CREATE OR REPLACE FUNCTION public.closed_year_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o jsonb; _n jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN _o := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN _n := to_jsonb(NEW); END IF;

  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (_n - 'copied_from_id' - 'user_id' - 'component_id')
       = (_o - 'copied_from_id' - 'user_id' - 'component_id')
     AND ((_n->>'copied_from_id') IS NULL OR (_n->>'copied_from_id') = (_o->>'copied_from_id'))
     AND ((_n->>'user_id') IS NULL OR (_n->>'user_id') = (_o->>'user_id'))
     AND ((_n->>'component_id') IS NULL OR (_n->>'component_id') = (_o->>'component_id')) THEN
    RETURN NEW;
  END IF;

  IF (_o IS NOT NULL AND public.period_status_of(TG_TABLE_NAME, _o) = 'closed')
     OR (_n IS NOT NULL AND public.period_status_of(TG_TABLE_NAME, _n) = 'closed') THEN
    RAISE EXCEPTION 'This year is closed, so it cannot be changed. A study admin can reopen it.'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- A line stays in its year: it can move between activities of the same year only.
CREATE FUNCTION public.check_line_same_year() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from text; _to text;
BEGIN
  IF NEW.activity_id IS NOT DISTINCT FROM OLD.activity_id THEN RETURN NEW; END IF;
  SELECT o.period_id INTO _from FROM public.activities a
    JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
    JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
    WHERE a.id = OLD.activity_id AND a.study_id = OLD.study_id;
  SELECT o.period_id INTO _to FROM public.activities a
    JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
    JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
    WHERE a.id = NEW.activity_id AND a.study_id = NEW.study_id;
  IF _from IS DISTINCT FROM _to THEN
    RAISE EXCEPTION 'A budget line cannot move to an activity in another year.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lines_same_year BEFORE UPDATE OF activity_id ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.check_line_same_year();

-- Funded workplan items cannot be deleted or moved to another year by accident.
CREATE FUNCTION public.block_funded_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- A whole study being deleted removes the lines too.
  IF NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'activities' AND EXISTS (
    SELECT 1 FROM public.budget_lines l WHERE l.activity_id = OLD.id AND l.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This activity has budget lines. Move or delete the lines before deleting the activity.'
      USING ERRCODE = '23503';
  ELSIF TG_TABLE_NAME = 'outcomes' AND EXISTS (
    SELECT 1 FROM public.budget_lines l
    JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
    WHERE a.outcome_id = OLD.id AND l.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This outcome has activities with budget lines. Move or delete the lines before deleting the outcome.'
      USING ERRCODE = '23503';
  ELSIF TG_TABLE_NAME = 'objectives' AND EXISTS (
    SELECT 1 FROM public.budget_lines l
    JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
    JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
    WHERE oc.objective_id = OLD.id AND l.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This objective has activities with budget lines. Move or delete the lines before deleting the objective.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER block_funded_delete BEFORE DELETE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_delete();
CREATE TRIGGER block_funded_delete BEFORE DELETE ON public.outcomes
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_delete();
CREATE TRIGGER block_funded_delete BEFORE DELETE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_delete();

CREATE FUNCTION public.block_funded_year_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from text; _to text; _funded boolean;
BEGIN
  IF TG_TABLE_NAME = 'objectives' THEN
    _from := OLD.period_id; _to := NEW.period_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      WHERE oc.objective_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
  ELSIF TG_TABLE_NAME = 'outcomes' THEN
    SELECT period_id INTO _from FROM public.objectives WHERE id = OLD.objective_id AND study_id = OLD.study_id;
    SELECT period_id INTO _to FROM public.objectives WHERE id = NEW.objective_id AND study_id = NEW.study_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      WHERE a.outcome_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
  ELSE
    SELECT o.period_id INTO _from FROM public.outcomes oc
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE oc.id = OLD.outcome_id AND oc.study_id = OLD.study_id;
    SELECT o.period_id INTO _to FROM public.outcomes oc
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE oc.id = NEW.outcome_id AND oc.study_id = NEW.study_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l WHERE l.activity_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
  END IF;
  IF _funded AND _from IS DISTINCT FROM _to THEN
    RAISE EXCEPTION 'Budget lines cannot move to another year.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER block_funded_year_change BEFORE UPDATE OF period_id ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_year_change();
CREATE TRIGGER block_funded_year_change BEFORE UPDATE OF objective_id ON public.outcomes
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_year_change();
CREATE TRIGGER block_funded_year_change BEFORE UPDATE OF outcome_id ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.block_funded_year_change();

-- Starting a year can now copy budget lines too. Only plans are copied: no actuals,
-- finance postings, dates, receipts or evidence.
DROP FUNCTION public.create_workplan_year(uuid, text, date, date, numeric, text, text);
CREATE FUNCTION public.create_workplan_year(
  _study_id uuid, _name text, _start_date date, _end_date date,
  _fx_rate numeric, _currency text, _copy_from_period_id text DEFAULT NULL,
  _copy_budget_lines boolean DEFAULT false
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id text := gen_random_uuid()::text; _project text := ''; _cur text := upper(btrim(coalesce(_currency, 'KES')));
        _n_obj int := 0; _n_out int := 0; _n_act int := 0; _n_ind int := 0; _n_res int := 0; _n_site int := 0;
        _n_line int := 0; _n_ev int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can create a year';
  END IF;
  IF coalesce(_copy_budget_lines, false) AND _copy_from_period_id IS NULL THEN
    RAISE EXCEPTION 'Choose a year to copy budget lines from';
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

    IF _copy_budget_lines THEN
      INSERT INTO public.budget_lines(id, study_id, activity_id, group_label, description, quantity, quantity_unit,
        unit_cost_cents, duration, duration_unit, occurrences, justification, cost_category,
        finance_posted_cents, sort_order, copied_from_id)
      SELECT gen_random_uuid()::text, l.study_id, na.id, l.group_label, l.description, l.quantity, l.quantity_unit,
        l.unit_cost_cents, l.duration, l.duration_unit, l.occurrences, l.justification, l.cost_category,
        NULL, l.sort_order, l.id
      FROM public.budget_lines l
      JOIN public.activities na ON na.copied_from_id = l.activity_id AND na.study_id = _study_id
      JOIN public.outcomes nc ON nc.id = na.outcome_id AND nc.study_id = _study_id
      JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = _study_id AND no.period_id = _id
      WHERE l.study_id = _study_id;
      GET DIAGNOSTICS _n_line = ROW_COUNT;

      INSERT INTO public.budget_events(id, study_id, line_id, sequence, title, status)
      SELECT gen_random_uuid()::text, nl.study_id, nl.id, s.n,
        CASE WHEN nl.occurrences = 1 THEN nl.description
             ELSE nl.description || ' – occurrence ' || s.n || ' of ' || nl.occurrences END,
        'planned'
      FROM public.budget_lines nl
      JOIN public.activities na ON na.id = nl.activity_id AND na.study_id = nl.study_id
      JOIN public.outcomes nc ON nc.id = na.outcome_id AND nc.study_id = na.study_id
      JOIN public.objectives no ON no.id = nc.objective_id AND no.study_id = nc.study_id AND no.period_id = _id
      CROSS JOIN LATERAL generate_series(1, nl.occurrences) AS s(n)
      WHERE nl.study_id = _study_id;
      GET DIAGNOSTICS _n_ev = ROW_COUNT;
    END IF;
  END IF;

  PERFORM public.audit_entry(_study_id, 'period', _id, '(created)', NULL, btrim(_name));
  IF _copy_from_period_id IS NOT NULL THEN
    PERFORM public.audit_entry(_study_id, 'period', _id, 'copied_from_id', NULL, _copy_from_period_id);
    PERFORM public.audit_entry(_study_id, 'period', _id, '(copied)', NULL,
      format('%s objectives, %s outcomes, %s activities, %s indicators, %s responsible, %s sites, %s budget lines, %s planned events',
        _n_obj, _n_out, _n_act, _n_ind, _n_res, _n_site, _n_line, _n_ev));
  END IF;
  RETURN _id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_workplan_year(uuid, text, date, date, numeric, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workplan_year(uuid, text, date, date, numeric, text, text, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.check_line_same_year() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_funded_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_funded_year_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.period_status_of(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.closed_year_guard() FROM PUBLIC, anon, authenticated;

COMMIT;
