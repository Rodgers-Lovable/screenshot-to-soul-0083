-- Admins can make other team members admins, or take the role away.
-- The team always keeps at least one admin.
CREATE OR REPLACE FUNCTION public.set_team_admin(_user_id uuid, _is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') OR NOT public.is_team_member() THEN
    RAISE EXCEPTION 'Only team admins can change admins';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _user_id) THEN
    RAISE EXCEPTION 'That person is not on the team';
  END IF;
  LOCK TABLE public.user_roles IN EXCLUSIVE MODE;
  IF _is_admin THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id <> _user_id) THEN
      RAISE EXCEPTION 'The team needs at least one admin';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'admin';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_team_admin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_admin(uuid, boolean) TO authenticated;
