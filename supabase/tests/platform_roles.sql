begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder-a@platum.test', now(), '{}', '{"full_name":"Founder A"}', now(), now()),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder-b@platum.test', now(), '{}', '{"full_name":"Founder B"}', now(), now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-a@platum.test', now(), '{}', '{}', now(), now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client-b@platum.test', now(), '{}', '{}', now(), now());

insert into public.platform_roles(user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'founder'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'founder');

insert into public.workspaces(id, slug, name, created_by, updated_by) values
  ('11111111-1111-4111-8111-111111111111', 'platform-a', 'Platform A', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'platform-b', 'Platform B', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.workspace_members(workspace_id, user_id, role, created_by) values
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'client', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'client', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.requests(workspace_id, created_by, topic, title, message) values
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'General', 'Client A request', 'Workspace A only.'),
  ('22222222-2222-4222-8222-222222222222', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'General', 'Client B request', 'Workspace B only.');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is((select count(*) from public.workspaces), 2::bigint, 'founder sees all workspaces without a workspace membership');
select is((select count(*) from public.requests), 2::bigint, 'founder sees workspace records across the platform');
select lives_ok($$update public.workspaces set name='Platform B updated' where id='22222222-2222-4222-8222-222222222222'$$, 'founder manages a workspace without a workspace membership');
select is((select count(*) from jsonb_array_elements(public.platum_members('11111111-1111-4111-8111-111111111111')) as members(value) where value->>'user_id'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and value->>'role'='owner'), 1::bigint, 'founder appears as an owner in workspace people');
select throws_ok($$select * from public.platform_roles$$, '42501', 'permission denied for table platform_roles', 'platform roles cannot be read from the client');
select throws_ok($$insert into public.workspace_members(workspace_id,user_id,role) values ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','client')$$, '42501', 'permission denied for table workspace_members', 'membership changes use the invitation flow');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}', true);
select is((select count(*) from public.workspaces), 1::bigint, 'client still sees only its assigned workspace');
select is((select count(*) from public.requests), 1::bigint, 'client still sees only its assigned workspace records');
select throws_ok($$insert into public.requests(workspace_id,topic,title,message) values ('22222222-2222-4222-8222-222222222222','General','Cross workspace','Must be denied.')$$, '42501', 'new row violates row-level security policy for table "requests"', 'client cannot write to another workspace');

select * from finish();
rollback;
