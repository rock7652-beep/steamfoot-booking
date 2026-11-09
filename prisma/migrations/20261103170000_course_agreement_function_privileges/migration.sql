-- Supabase default privileges may grant browser roles explicit function access.
-- Revoking PUBLIC alone does not remove those role-specific grants.
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.course_agreement_immutable() FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
