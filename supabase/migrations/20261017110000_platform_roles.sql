-- Global platform roles are separate from each user's project membership.
-- Email is used once to provision the known founders; authorization uses the
-- stable Supabase Auth user ID after that point.
create table public.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('founder', 'platform_admin')),
  created_at timestamptz not null default now()
);

alter table public.platform_roles enable row level security;
revoke all on public.platform_roles from public, anon, authenticated;
grant select, insert, update, delete on public.platform_roles to service_role;
comment on table public.platform_roles is 'Global Platum permissions keyed by Supabase Auth user ID; project access remains represented by workspace_members.';

insert into public.platform_roles(user_id, role)
select id, 'founder' from auth.users
where lower(email) in ('yura.hirchak@gmail.com', 'andrijpycha@gmail.com', 'a3ycka3kypocka3atu@gmail.com')
on conflict (user_id) do update set role = excluded.role;

create function private.platum_platform_role(target_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select p.role from public.platform_roles p where p.user_id = target_user_id
$$;

create function private.is_platform_operator(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select private.platum_platform_role(target_user_id) in ('founder', 'platform_admin')
$$;

revoke all on function private.platum_platform_role(uuid), private.is_platform_operator(uuid) from public, anon, authenticated;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and (private.is_platform_operator((select auth.uid())) or exists (
      select 1 from public.workspace_members
      where workspace_id = target_workspace_id and user_id = (select auth.uid())
    ))
$$;

create or replace function private.is_workspace_operator(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and (private.is_platform_operator((select auth.uid())) or exists (
      select 1 from public.workspace_members
      where workspace_id = target_workspace_id and user_id = (select auth.uid()) and role in ('owner', 'admin', 'team')
    ))
$$;

create or replace function private.platum_manager(w uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select actor is not null and (private.is_platform_operator(actor)
    or exists(select 1 from public.workspace_members where workspace_id = w and user_id = actor and role in ('owner', 'admin')))
$$;

create function private.platum_add_platform_roles_to_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_members(workspace_id, user_id, role, created_by)
  select new.id, p.user_id, case when p.role = 'founder' then 'owner' else 'admin' end, coalesce(new.created_by, p.user_id)
  from public.platform_roles p
  where p.user_id is distinct from new.created_by
  on conflict (workspace_id, user_id) do nothing;
  return new;
end $$;

create trigger platum_add_platform_roles_to_workspace after insert on public.workspaces
for each row execute function private.platum_add_platform_roles_to_workspace();
revoke all on function private.platum_add_platform_roles_to_workspace() from public, anon, authenticated;

insert into public.workspace_members(workspace_id, user_id, role, created_by)
select w.id, p.user_id, case when p.role = 'founder' then 'owner' else 'admin' end, coalesce(w.created_by, p.user_id)
from public.workspaces w cross join public.platform_roles p
on conflict (workspace_id, user_id) do update
set role = case when workspace_members.role = 'owner' then 'owner' else excluded.role end;

create or replace function private.platum_members(w uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.platum_require(private.is_workspace_member(w), 'FORBIDDEN');
  with members as (
    select m.user_id, m.role, u.raw_user_meta_data, u.email, m.created_at, p.role as platform_role
    from public.workspace_members m join auth.users u on u.id = m.user_id
    left join public.platform_roles p on p.user_id = m.user_id
    where m.workspace_id = w
    union all
    select p.user_id, case when p.role = 'founder' then 'owner' else 'admin' end,
      u.raw_user_meta_data, u.email, p.created_at, p.role
    from public.platform_roles p join auth.users u on u.id = p.user_id
    where not exists (select 1 from public.workspace_members m where m.workspace_id = w and m.user_id = p.user_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'role', m.role,
    'name', coalesce(nullif(m.raw_user_meta_data->>'full_name', ''), nullif(m.raw_user_meta_data->>'name', ''), initcap(m.role)),
    'email', case when private.platum_manager(w) then m.email else null end,
    'platform_role', case when private.platum_manager(w) then m.platform_role else null end
  ) order by m.created_at), '[]') into result from members m;
  return result;
end $$;

revoke insert, update, delete on public.workspace_members from authenticated;
