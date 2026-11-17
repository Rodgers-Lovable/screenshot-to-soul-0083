CREATE TYPE public.app_role AS ENUM ('admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE POLICY "Team members see roles" ON public.user_roles FOR SELECT TO authenticated USING (public.is_team_member());

INSERT INTO public.user_roles(user_id, role)
SELECT user_id, 'admin' FROM public.team_members ORDER BY added_at LIMIT 1;

CREATE OR REPLACE FUNCTION public.join_team_if_empty()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  LOCK TABLE public.team_members IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM public.team_members) THEN
    INSERT INTO public.team_members(user_id, email)
    SELECT id, coalesce(email,'') FROM auth.users WHERE id = auth.uid();
    INSERT INTO public.user_roles(user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN public.is_team_member();
END $$;

CREATE OR REPLACE FUNCTION public.remove_team_member(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') OR NOT public.is_team_member() THEN
    RAISE EXCEPTION 'Only team admins can remove people';
  END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.team_members WHERE user_id = _user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.remove_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid) TO authenticated;