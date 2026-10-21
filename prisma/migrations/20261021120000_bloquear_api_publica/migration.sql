-- Supabase publica el esquema "public" por su API REST (PostgREST) a los roles anon y authenticated,
-- con permisos sobre todas las tablas por defecto. Esta aplicación no usa esa API: solo el servidor
-- accede a la base, con su propio usuario. Se retira todo acceso a esos roles y se activa RLS
-- (sin políticas) como segunda barrera. En PostgreSQL sin Supabase (desarrollo, Docker) los roles
-- no existen y solo se activa RLS, que no afecta al dueño de las tablas.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
    -- Tablas que se creen en migraciones futuras
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated', current_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated', current_user);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated', current_user);
  END IF;
END $$;
