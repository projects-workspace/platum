-- TEST ONLY. Apply only to a freshly created, disposable local Supabase.
-- Never include this file in production migrations.
create or replace function public.platum_test_identity() returns text
language sql immutable as $$ select 'platum-stage1-local'::text $$;
revoke all on function public.platum_test_identity() from public,anon,authenticated;
grant execute on function public.platum_test_identity() to service_role;
