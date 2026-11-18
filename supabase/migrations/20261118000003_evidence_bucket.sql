-- Private bucket for evidence files; access is limited by the storage.objects policies.
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', false)
ON CONFLICT (id) DO NOTHING;
