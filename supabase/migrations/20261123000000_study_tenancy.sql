-- Study tenancy: many studies, each with its own members, budget data and evidence files.
-- The old team_members and user_roles tables stay as rollback data with no client access.

-- Studies and members
CREATE TABLE public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.study_members (
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (study_id, user_id)
);
CREATE INDEX ON public.study_members(user_id);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studies, public.study_members FROM anon, authenticated;
GRANT SELECT ON public.studies, public.study_members TO authenticated;
GRANT ALL ON public.studies, public.study_members TO service_role;

-- Access helpers
CREATE FUNCTION public.is_study_member(_study_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members WHERE study_id = _study_id AND user_id = auth.uid()
  )
$$;
CREATE FUNCTION public.is_study_admin(_study_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = _study_id AND user_id = auth.uid() AND role = 'admin'
  )
$$;

CREATE POLICY "Members see their study" ON public.studies
  FOR SELECT TO authenticated USING (public.is_study_member(id));
CREATE POLICY "Members see the study team" ON public.study_members
  FOR SELECT TO authenticated USING (public.is_study_member(study_id));

-- Study RPCs
CREATE FUNCTION public.create_study(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF btrim(coalesce(_name, '')) = '' THEN RAISE EXCEPTION 'A study needs a name'; END IF;
  INSERT INTO public.studies(name, created_by) VALUES (btrim(_name), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.study_members(study_id, user_id, email, role)
  SELECT _id, id, coalesce(email, ''), 'admin' FROM auth.users WHERE id = auth.uid();
  RETURN _id;
END $$;

CREATE FUNCTION public.add_study_member(_study_id uuid, _email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.is_study_member(_study_id) THEN
    RAISE EXCEPTION 'Only study members can add people';
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _uid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.study_members(study_id, user_id, email, role)
  VALUES (_study_id, _uid, lower(trim(_email)), 'member') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE FUNCTION public.remove_study_member(_study_id uuid, _user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can remove people';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
  PERFORM 1 FROM public.study_members WHERE study_id = _study_id ORDER BY user_id FOR UPDATE;
  IF NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can remove people';
  END IF;
  DELETE FROM public.study_members WHERE study_id = _study_id AND user_id = _user_id;
END $$;

CREATE FUNCTION public.set_study_admin(_study_id uuid, _user_id uuid, _is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can change admins';
  END IF;
  PERFORM 1 FROM public.study_members WHERE study_id = _study_id ORDER BY user_id FOR UPDATE;
  IF NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can change admins';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.study_members WHERE study_id = _study_id AND user_id = _user_id
  ) THEN
    RAISE EXCEPTION 'That person is not on the study';
  END IF;
  IF NOT _is_admin AND NOT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE study_id = _study_id AND role = 'admin' AND user_id <> _user_id
  ) THEN
    RAISE EXCEPTION 'The study needs at least one admin';
  END IF;
  UPDATE public.study_members
  SET role = CASE WHEN _is_admin THEN 'admin' ELSE 'member' END
  WHERE study_id = _study_id AND user_id = _user_id;
END $$;

-- Data tables gain study_id
ALTER TABLE public.budget_periods
  ADD COLUMN study_id uuid,
  ADD COLUMN currency text NOT NULL DEFAULT 'KES',
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'));
ALTER TABLE public.components ADD COLUMN study_id uuid;
ALTER TABLE public.budget_lines ADD COLUMN study_id uuid;
ALTER TABLE public.budget_events ADD COLUMN study_id uuid;
ALTER TABLE public.attachments ADD COLUMN study_id uuid;
ALTER TABLE public.audit_log ADD COLUMN study_id uuid;

-- Existing evidence files live outside any study folder, so map them to a study here.
CREATE TABLE public.legacy_evidence (
  path text PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE
);
ALTER TABLE public.legacy_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_evidence FROM anon, authenticated;
GRANT ALL ON public.legacy_evidence TO service_role;

-- Backfill: one study for everything that exists today
DO $$
DECLARE _study uuid; _name text; _admin uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.budget_periods)
     OR EXISTS (SELECT 1 FROM public.components)
     OR EXISTS (SELECT 1 FROM public.budget_lines)
     OR EXISTS (SELECT 1 FROM public.budget_events)
     OR EXISTS (SELECT 1 FROM public.attachments)
     OR EXISTS (SELECT 1 FROM public.audit_log)
     OR EXISTS (SELECT 1 FROM public.team_members) THEN
    SELECT btrim(project_name) INTO _name FROM public.budget_periods
    WHERE btrim(project_name) <> '' ORDER BY id LIMIT 1;
    SELECT user_id INTO _admin FROM public.team_members t
    WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = t.user_id AND r.role = 'admin')
    ORDER BY added_at, user_id LIMIT 1;
    IF _admin IS NULL THEN
      SELECT user_id INTO _admin FROM public.team_members ORDER BY added_at, user_id LIMIT 1;
    END IF;

    INSERT INTO public.studies(name, created_by)
    VALUES (coalesce(_name, 'Existing study'), _admin) RETURNING id INTO _study;

    INSERT INTO public.study_members(study_id, user_id, email, role, added_at)
    SELECT _study, t.user_id, t.email,
      CASE WHEN t.user_id = _admin
        OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = t.user_id AND r.role = 'admin')
        THEN 'admin' ELSE 'member' END,
      t.added_at
    FROM public.team_members t;

    UPDATE public.budget_periods SET study_id = _study;
    UPDATE public.components SET study_id = _study;
    UPDATE public.budget_lines SET study_id = _study;
    UPDATE public.budget_events SET study_id = _study;
    UPDATE public.attachments SET study_id = _study;
    UPDATE public.audit_log SET study_id = _study;

    INSERT INTO public.legacy_evidence(path, study_id)
    SELECT name, _study FROM storage.objects WHERE bucket_id = 'evidence';
  END IF;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','components','budget_lines','budget_events','attachments','audit_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN study_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (study_id) REFERENCES public.studies(id) ON DELETE CASCADE', t, t || '_study_id_fkey');
    EXECUTE format('CREATE INDEX ON public.%I(study_id)', t);
  END LOOP;
END $$;

-- Rows can only link to rows in the same study
ALTER TABLE public.budget_periods ADD CONSTRAINT budget_periods_id_study_key UNIQUE (id, study_id);
ALTER TABLE public.components ADD CONSTRAINT components_id_study_key UNIQUE (id, study_id);
ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_id_study_key UNIQUE (id, study_id);
ALTER TABLE public.budget_events ADD CONSTRAINT budget_events_id_study_key UNIQUE (id, study_id);

ALTER TABLE public.budget_lines DROP CONSTRAINT budget_lines_component_id_fkey;
ALTER TABLE public.budget_events DROP CONSTRAINT budget_events_line_id_fkey;
ALTER TABLE public.attachments DROP CONSTRAINT attachments_event_id_fkey;

ALTER TABLE public.budget_lines ADD CONSTRAINT budget_lines_component_study_fkey
  FOREIGN KEY (component_id, study_id) REFERENCES public.components(id, study_id) ON DELETE CASCADE;
ALTER TABLE public.budget_events ADD CONSTRAINT budget_events_line_study_fkey
  FOREIGN KEY (line_id, study_id) REFERENCES public.budget_lines(id, study_id) ON DELETE CASCADE;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_event_study_fkey
  FOREIGN KEY (event_id, study_id) REFERENCES public.budget_events(id, study_id) ON DELETE CASCADE;
-- Old components may point at a missing period, so only new and changed rows are checked.
ALTER TABLE public.components ADD CONSTRAINT components_period_study_fkey
  FOREIGN KEY (period_id, study_id) REFERENCES public.budget_periods(id, study_id) NOT VALID;

-- Data policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','components','budget_lines','budget_events','attachments','audit_log'] LOOP
    EXECUTE format('DROP POLICY "Team members can read" ON public.%I', t);
    EXECUTE format('DROP POLICY "Team members can add" ON public.%I', t);
    EXECUTE format('DROP POLICY "Team members can edit" ON public.%I', t);
    EXECUTE format('DROP POLICY "Team members can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Study members can read" ON public.%I FOR SELECT TO authenticated USING (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can add" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can edit" ON public.%I FOR UPDATE TO authenticated USING (public.is_study_member(study_id)) WITH CHECK (public.is_study_member(study_id))', t);
    EXECUTE format('CREATE POLICY "Study members can delete" ON public.%I FOR DELETE TO authenticated USING (public.is_study_member(study_id))', t);
  END LOOP;
END $$;

-- Evidence files: new paths start with the study id; old ones are mapped in legacy_evidence.
CREATE FUNCTION public.can_access_evidence(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE user_id = auth.uid() AND study_id::text = split_part(_name, '/', 1)
  ) OR EXISTS (
    SELECT 1 FROM public.legacy_evidence l
    JOIN public.study_members m ON m.study_id = l.study_id AND m.user_id = auth.uid()
    WHERE l.path = _name
  )
$$;
CREATE FUNCTION public.can_upload_evidence(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_members
    WHERE user_id = auth.uid() AND study_id::text = split_part(_name, '/', 1)
  )
$$;

DROP POLICY "Team members read evidence" ON storage.objects;
DROP POLICY "Team members upload evidence" ON storage.objects;
DROP POLICY "Team members delete evidence" ON storage.objects;
CREATE POLICY "Study members read evidence" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence' AND public.can_access_evidence(name));
CREATE POLICY "Study members upload evidence" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence' AND public.can_upload_evidence(name));
CREATE POLICY "Study members delete evidence" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND public.can_access_evidence(name));

-- Retire the single-team model. The tables stay as rollback data.
DROP POLICY "Team members see the team" ON public.team_members;
DROP POLICY "Team members see roles" ON public.user_roles;
REVOKE ALL ON public.team_members, public.user_roles FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.join_team_if_empty() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_team_member(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_team_admin(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;

-- Function access: signed-in users only
REVOKE EXECUTE ON FUNCTION public.is_study_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_study_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_study(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_study_member(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_study_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_study_admin(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_evidence(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_upload_evidence(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_study_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_study_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_study(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_study_member(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_study_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_study_admin(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_evidence(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_evidence(text) TO authenticated;
