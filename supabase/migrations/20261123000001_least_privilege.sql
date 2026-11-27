-- Least privilege: only platform admins create studies, only study admins add people,
-- the audit log is append-only, and table grants shrink to what the app uses.

-- Platform admins. The list starts empty; the first row is added by hand in the SQL Editor.
-- Being a platform admin only allows creating studies. It grants no access to study data.
CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;

CREATE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- Study creation: platform admins only. The creator becomes the study's admin.
CREATE OR REPLACE FUNCTION public.create_study(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can create studies';
  END IF;
  IF btrim(coalesce(_name, '')) = '' THEN RAISE EXCEPTION 'A study needs a name'; END IF;
  INSERT INTO public.studies(name, created_by) VALUES (btrim(_name), auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.study_members(study_id, user_id, email, role)
  SELECT _id, id, coalesce(email, ''), 'admin' FROM auth.users WHERE id = auth.uid();
  RETURN _id;
END $$;

-- Adding people: study admins only.
CREATE OR REPLACE FUNCTION public.add_study_member(_study_id uuid, _email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NOT public.is_study_admin(_study_id) THEN
    RAISE EXCEPTION 'Only study admins can add people';
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _uid IS NULL THEN RETURN false; END IF;
  INSERT INTO public.study_members(study_id, user_id, email, role)
  VALUES (_study_id, _uid, lower(trim(_email)), 'member') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_study(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_study_member(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_study(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_study_member(uuid, text) TO authenticated;

-- Audit log is append-only for members.
DROP POLICY "Study members can edit" ON public.audit_log;
DROP POLICY "Study members can delete" ON public.audit_log;

-- Table grants. TRUNCATE bypasses RLS, so authenticated and anon get only what the app needs.
REVOKE ALL ON
  public.studies, public.study_members, public.budget_periods, public.components,
  public.budget_lines, public.budget_events, public.attachments, public.audit_log
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studies, public.study_members TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.budget_periods, public.components, public.budget_lines,
  public.budget_events, public.attachments
TO authenticated;
GRANT ALL ON
  public.studies, public.study_members, public.budget_periods, public.components,
  public.budget_lines, public.budget_events, public.attachments, public.audit_log
TO service_role;

-- No public function should be callable without signing in, whatever older migrations or defaults gave.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
  END LOOP;
END $$;
