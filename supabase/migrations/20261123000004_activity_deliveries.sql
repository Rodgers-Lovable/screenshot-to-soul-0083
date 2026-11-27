-- Activity deliveries: one delivery per round (and per site for a site activity), with proof files,
-- indicator results and optional links from spending records. Delivery is separate from spending.
-- Plain deletes are blocked where history would be lost, and a study delete still cascades.
BEGIN;

-- Deliveries. A general activity has one delivery per round with no site; NULLS NOT DISTINCT makes
-- that case unique too. Parent links are NO ACTION, so a parent with deliveries cannot be deleted,
-- yet deleting a whole study (which removes every row in one statement) still works.
CREATE TABLE public.deliveries (
  id text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  site_id text,
  round_number integer NOT NULL CHECK (round_number > 0),
  round_label text NOT NULL DEFAULT '',
  planned_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_completed_needs_date CHECK (status <> 'completed' OR actual_date IS NOT NULL),
  CONSTRAINT deliveries_id_study_key UNIQUE (id, study_id),
  CONSTRAINT deliveries_round_key UNIQUE NULLS NOT DISTINCT (activity_id, site_id, round_number),
  CONSTRAINT deliveries_activity_study_fkey FOREIGN KEY (activity_id, study_id)
    REFERENCES public.activities(id, study_id),
  CONSTRAINT deliveries_site_study_fkey FOREIGN KEY (site_id, study_id)
    REFERENCES public.sites(id, study_id)
);
-- The unique index on (activity_id, ...) also serves the activity foreign key.
CREATE INDEX ON public.deliveries(study_id);
CREATE INDEX ON public.deliveries(site_id);

-- Results per indicator. They go with their delivery; an indicator that has results cannot be deleted.
CREATE TABLE public.delivery_indicator_results (
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  delivery_id text NOT NULL,
  indicator_id text NOT NULL,
  value numeric NOT NULL CHECK (value >= 0),
  notes text NOT NULL DEFAULT '',
  PRIMARY KEY (delivery_id, indicator_id),
  CONSTRAINT results_delivery_study_fkey FOREIGN KEY (delivery_id, study_id)
    REFERENCES public.deliveries(id, study_id) ON DELETE CASCADE,
  CONSTRAINT results_indicator_study_fkey FOREIGN KEY (indicator_id, study_id)
    REFERENCES public.activity_indicators(id, study_id)
);
CREATE INDEX ON public.delivery_indicator_results(study_id);
CREATE INDEX ON public.delivery_indicator_results(indicator_id);

-- Spending records can link to a delivery. No cascade either way.
ALTER TABLE public.budget_events ADD COLUMN delivery_id text;
ALTER TABLE public.budget_events ADD CONSTRAINT budget_events_delivery_study_fkey
  FOREIGN KEY (delivery_id, study_id) REFERENCES public.deliveries(id, study_id);
CREATE INDEX ON public.budget_events(delivery_id);

-- An attachment is a receipt on a spending record or proof on a delivery, never both.
-- Existing rows all have an event, so they stay valid receipts.
ALTER TABLE public.attachments ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE public.attachments ADD COLUMN delivery_id text;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_delivery_study_fkey
  FOREIGN KEY (delivery_id, study_id) REFERENCES public.deliveries(id, study_id);
ALTER TABLE public.attachments ADD CONSTRAINT attachments_one_owner
  CHECK (num_nonnulls(event_id, delivery_id) = 1);
CREATE INDEX ON public.attachments(delivery_id);

-- Row rules. An insert that hits an existing id is an upsert of that row, so it is checked as an update.
CREATE FUNCTION public.check_delivery_site() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _old public.deliveries; _kind text;
BEGIN
  IF TG_OP = 'UPDATE' THEN _old := OLD;
  ELSE SELECT * INTO _old FROM public.deliveries WHERE id = NEW.id; END IF;
  IF _old.id IS NOT NULL AND NEW.activity_id IS DISTINCT FROM _old.activity_id THEN
    RAISE EXCEPTION 'A delivery cannot move to another activity.';
  END IF;
  IF _old.id IS NOT NULL AND NEW.site_id IS NOT DISTINCT FROM _old.site_id THEN RETURN NEW; END IF;

  SELECT kind INTO _kind FROM public.activities WHERE id = NEW.activity_id AND study_id = NEW.study_id;
  IF _kind = 'general' AND NEW.site_id IS NOT NULL THEN
    RAISE EXCEPTION 'A general activity is not tied to a site, so its deliveries cannot have a site.';
  END IF;
  IF _kind = 'site' THEN
    IF NEW.site_id IS NULL THEN
      RAISE EXCEPTION 'A delivery of a site activity needs a site.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.activity_sites
      WHERE activity_id = NEW.activity_id AND site_id = NEW.site_id AND study_id = NEW.study_id
    ) THEN
      RAISE EXCEPTION 'That site is not selected on this activity.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.sites WHERE id = NEW.site_id AND study_id = NEW.study_id AND archived_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'That site is archived. Restore it before adding deliveries there.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deliveries_site_check BEFORE INSERT OR UPDATE OF activity_id, site_id ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.check_delivery_site();

CREATE FUNCTION public.check_result_indicator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.deliveries d
    JOIN public.activity_indicators i ON i.activity_id = d.activity_id AND i.study_id = d.study_id
    WHERE d.id = NEW.delivery_id AND d.study_id = NEW.study_id AND i.id = NEW.indicator_id
  ) THEN
    RAISE EXCEPTION 'That indicator belongs to a different activity than this delivery.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER results_indicator_check BEFORE INSERT OR UPDATE OF delivery_id, indicator_id
  ON public.delivery_indicator_results
  FOR EACH ROW EXECUTE FUNCTION public.check_result_indicator();

CREATE FUNCTION public.check_event_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.delivery_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.budget_lines l
    JOIN public.deliveries d ON d.activity_id = l.activity_id AND d.study_id = l.study_id
    WHERE l.id = NEW.line_id AND l.study_id = NEW.study_id AND d.id = NEW.delivery_id
  ) THEN
    RAISE EXCEPTION 'A spending record can only link to a delivery of the same activity.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER events_delivery_check BEFORE INSERT OR UPDATE OF delivery_id, line_id ON public.budget_events
  FOR EACH ROW EXECUTE FUNCTION public.check_event_delivery();

CREATE FUNCTION public.block_linked_line_move() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.activity_id IS DISTINCT FROM OLD.activity_id AND EXISTS (
    SELECT 1 FROM public.budget_events e
    WHERE e.line_id = OLD.id AND e.study_id = OLD.study_id AND e.delivery_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Some spending records of this line are linked to deliveries. Unlink them before moving the line to another activity.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER lines_linked_move_check BEFORE UPDATE OF activity_id ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_linked_line_move();

-- Deleting. Each check is skipped while a whole study is being deleted.
CREATE FUNCTION public.block_delivery_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN RETURN OLD; END IF;
  IF EXISTS (SELECT 1 FROM public.budget_events e WHERE e.delivery_id = OLD.id AND e.study_id = OLD.study_id) THEN
    RAISE EXCEPTION 'This delivery has spending records linked to it. Unlink them before deleting the delivery.'
      USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments a WHERE a.delivery_id = OLD.id AND a.study_id = OLD.study_id) THEN
    RAISE EXCEPTION 'This delivery has proof files. Remove them before deleting the delivery.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER deliveries_delete_check BEFORE DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.block_delivery_delete();

CREATE FUNCTION public.block_indicator_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.delivery_indicator_results r WHERE r.indicator_id = OLD.id AND r.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This indicator has recorded results. Delete the deliveries or clear the results first.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER indicators_delete_check BEFORE DELETE ON public.activity_indicators
  FOR EACH ROW EXECUTE FUNCTION public.block_indicator_delete();

CREATE FUNCTION public.block_site_removal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.deliveries d
    WHERE d.activity_id = OLD.activity_id AND d.site_id = OLD.site_id AND d.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This site has deliveries on this activity. Delete them before removing the site.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER activity_sites_delete_check BEFORE DELETE ON public.activity_sites
  FOR EACH ROW EXECUTE FUNCTION public.block_site_removal();

CREATE FUNCTION public.block_kind_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind AND EXISTS (
    SELECT 1 FROM public.deliveries d WHERE d.activity_id = OLD.id AND d.study_id = OLD.study_id
  ) THEN
    RAISE EXCEPTION 'This activity has deliveries, so it cannot change between general and site.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activities_delivery_kind_check BEFORE UPDATE OF kind ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.block_kind_change();

-- Activities, outcomes and objectives that hold deliveries cannot be deleted or moved to another year.
CREATE OR REPLACE FUNCTION public.block_funded_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.studies WHERE id = OLD.study_id) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'activities' THEN
    IF EXISTS (SELECT 1 FROM public.deliveries d WHERE d.activity_id = OLD.id AND d.study_id = OLD.study_id) THEN
      RAISE EXCEPTION 'This activity has deliveries. Delete the deliveries before deleting the activity.'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (SELECT 1 FROM public.budget_lines l WHERE l.activity_id = OLD.id AND l.study_id = OLD.study_id) THEN
      RAISE EXCEPTION 'This activity has budget lines. Move or delete the lines before deleting the activity.'
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'outcomes' THEN
    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
      WHERE a.outcome_id = OLD.id AND d.study_id = OLD.study_id
    ) THEN
      RAISE EXCEPTION 'This outcome has activities with deliveries. Delete the deliveries before deleting the outcome.'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      WHERE a.outcome_id = OLD.id AND l.study_id = OLD.study_id
    ) THEN
      RAISE EXCEPTION 'This outcome has activities with budget lines. Move or delete the lines before deleting the outcome.'
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'objectives' THEN
    IF EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      WHERE oc.objective_id = OLD.id AND d.study_id = OLD.study_id
    ) THEN
      RAISE EXCEPTION 'This objective has activities with deliveries. Delete the deliveries before deleting the objective.'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      WHERE oc.objective_id = OLD.id AND l.study_id = OLD.study_id
    ) THEN
      RAISE EXCEPTION 'This objective has activities with budget lines. Move or delete the lines before deleting the objective.'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.block_funded_year_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _from text; _to text; _funded boolean; _delivered boolean;
BEGIN
  IF TG_TABLE_NAME = 'objectives' THEN
    _from := OLD.period_id; _to := NEW.period_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      WHERE oc.objective_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
    SELECT EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      WHERE oc.objective_id = OLD.id AND d.study_id = OLD.study_id) INTO _delivered;
  ELSIF TG_TABLE_NAME = 'outcomes' THEN
    SELECT period_id INTO _from FROM public.objectives WHERE id = OLD.objective_id AND study_id = OLD.study_id;
    SELECT period_id INTO _to FROM public.objectives WHERE id = NEW.objective_id AND study_id = NEW.study_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l
      JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
      WHERE a.outcome_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
    SELECT EXISTS (
      SELECT 1 FROM public.deliveries d
      JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
      WHERE a.outcome_id = OLD.id AND d.study_id = OLD.study_id) INTO _delivered;
  ELSE
    SELECT o.period_id INTO _from FROM public.outcomes oc
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE oc.id = OLD.outcome_id AND oc.study_id = OLD.study_id;
    SELECT o.period_id INTO _to FROM public.outcomes oc
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE oc.id = NEW.outcome_id AND oc.study_id = NEW.study_id;
    SELECT EXISTS (
      SELECT 1 FROM public.budget_lines l WHERE l.activity_id = OLD.id AND l.study_id = OLD.study_id) INTO _funded;
    SELECT EXISTS (
      SELECT 1 FROM public.deliveries d WHERE d.activity_id = OLD.id AND d.study_id = OLD.study_id) INTO _delivered;
  END IF;
  IF _from IS DISTINCT FROM _to THEN
    IF _delivered THEN RAISE EXCEPTION 'Deliveries cannot move to another year.'; END IF;
    IF _funded THEN RAISE EXCEPTION 'Budget lines cannot move to another year.'; END IF;
  END IF;
  RETURN NEW;
END $$;

-- A year is also found through deliveries, results and delivery proof.
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
    WHEN _tbl IN ('activity_indicators', 'activity_responsibles', 'activity_sites', 'budget_lines', 'deliveries') THEN (
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
    WHEN _tbl = 'delivery_indicator_results' THEN (
      SELECT o.period_id FROM public.deliveries d
      JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
      JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
      JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
      WHERE d.id = _r->>'delivery_id' AND d.study_id = _s)
    WHEN _tbl = 'attachments' THEN coalesce(
      (SELECT o.period_id FROM public.budget_events e
        JOIN public.budget_lines l ON l.id = e.line_id AND l.study_id = e.study_id
        JOIN public.activities a ON a.id = l.activity_id AND a.study_id = l.study_id
        JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
        JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
        WHERE e.id = _r->>'event_id' AND e.study_id = _s),
      (SELECT o.period_id FROM public.deliveries d
        JOIN public.activities a ON a.id = d.activity_id AND a.study_id = d.study_id
        JOIN public.outcomes oc ON oc.id = a.outcome_id AND oc.study_id = a.study_id
        JOIN public.objectives o ON o.id = oc.objective_id AND o.study_id = oc.study_id
        WHERE d.id = _r->>'delivery_id' AND d.study_id = _s))
  END;
  RETURN (SELECT status FROM public.budget_periods WHERE id = _p AND study_id = _s);
END $$;

CREATE TRIGGER closed_year_guard BEFORE INSERT OR UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.closed_year_guard();
CREATE TRIGGER closed_year_guard BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_indicator_results
  FOR EACH ROW EXECUTE FUNCTION public.closed_year_guard();

-- Evidence paths. Receipts stay <study>/<event>/<file>. Proof is <study>/deliveries/<delivery>/<file>,
-- and the delivery must really belong to the study in the first folder.
CREATE OR REPLACE FUNCTION public.evidence_year_closed(_name text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _s uuid; _seg text;
BEGIN
  IF split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    _s := split_part(_name, '/', 1)::uuid;
    _seg := split_part(_name, '/', 2);
    IF _seg = 'deliveries' THEN
      IF EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = split_part(_name, '/', 3) AND d.study_id = _s
          AND public.period_status_of('deliveries', to_jsonb(d)) = 'closed'
      ) THEN RETURN true; END IF;
    ELSIF EXISTS (
      SELECT 1 FROM public.budget_events e
      WHERE e.id = _seg AND e.study_id = _s AND public.period_status_of('budget_events', to_jsonb(e)) = 'closed'
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
  )
  AND NOT public.evidence_year_closed(_name)
  AND (
    split_part(_name, '/', 2) <> 'deliveries'
    OR (
      split_part(_name, '/', 3) <> '' AND split_part(_name, '/', 4) <> ''
      AND EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = split_part(_name, '/', 3) AND d.study_id::text = split_part(_name, '/', 1)
      )
    )
  )
$$;

-- Access: members read, and write in open years (the closed-year triggers decide). No TRUNCATE.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['deliveries', 'delivery_indicator_results'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY "Study members can read" ON public.%I FOR SELECT TO authenticated USING (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can add" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can edit" ON public.%I FOR UPDATE TO authenticated USING (public.is_study_member(study_id)) WITH CHECK (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can delete" ON public.%I FOR DELETE TO authenticated USING (public.is_study_member(study_id))', t);
  END LOOP;
END $$;

-- Functions: trigger and helper functions are not callable by clients. The storage policies keep
-- their access to the two evidence checks.
REVOKE EXECUTE ON FUNCTION public.check_delivery_site() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_result_indicator() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_event_delivery() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_linked_line_move() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_delivery_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_indicator_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_site_removal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_kind_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_funded_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.block_funded_year_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.period_status_of(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evidence_year_closed(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_upload_evidence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_evidence(text) TO authenticated;

COMMIT;
