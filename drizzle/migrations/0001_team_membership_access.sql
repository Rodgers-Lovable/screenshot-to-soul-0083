CREATE TABLE public.team_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  added_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = auth.uid())
$$;

CREATE POLICY "Team members see the team" ON public.team_members FOR SELECT TO authenticated USING (public.is_team_member());

-- First signed-in person claims the empty team; afterwards only members can add others.
CREATE OR REPLACE FUNCTION public.join_team_if_empty()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  LOCK TABLE public.team_members IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM public.team_members) THEN
    INSERT INTO public.team_members(user_id, email)
    SELECT id, coalesce(email,'') FROM auth.users WHERE id = auth.uid();
  END IF;
  RETURN public.is_team_member();
END $$;

CREATE OR REPLACE FUNCTION public.add_team_member(_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.is_team_member() THEN RAISE EXCEPTION 'Only team members can add people'; END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _uid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.team_members(user_id, email) VALUES (_uid, lower(trim(_email))) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.join_team_if_empty() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_team_member(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team_if_empty() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member() TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_periods','components','budget_lines','budget_events','attachments','audit_log'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Team members can read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Team members can add" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Team members can edit" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Team members can delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Team members can read" ON public.%I FOR SELECT TO authenticated USING (public.is_team_member())', t);
    EXECUTE format('CREATE POLICY "Team members can add" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_team_member())', t);
    EXECUTE format('CREATE POLICY "Team members can edit" ON public.%I FOR UPDATE TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member())', t);
    EXECUTE format('CREATE POLICY "Team members can delete" ON public.%I FOR DELETE TO authenticated USING (public.is_team_member())', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Team members read evidence" ON storage.objects;
DROP POLICY IF EXISTS "Team members upload evidence" ON storage.objects;
DROP POLICY IF EXISTS "Team members delete evidence" ON storage.objects;
CREATE POLICY "Team members read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence' AND public.is_team_member());
CREATE POLICY "Team members upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence' AND public.is_team_member());
CREATE POLICY "Team members delete evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND public.is_team_member());