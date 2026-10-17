-- Additive, empty network/community structures. No accounts, memberships,
-- contact records or content are provisioned by this migration.
create table public.workspace_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  name text not null check(char_length(name) between 1 and 160),
  organisation text not null default '', role_title text not null default '',
  categories text[] not null default '{}', email text not null default '',
  phone text not null default '', url text not null default '', context text not null default '',
  next_action text not null default '', follow_up_on date,
  owner_id uuid references auth.users(id), linked_user_id uuid references auth.users(id),
  task_id uuid, status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,workspace_id), foreign key(task_id,workspace_id) references public.tasks(id,workspace_id)
);
create table public.contact_interactions (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  contact_id uuid not null, author_id uuid not null references auth.users(id),
  kind text not null check(kind in ('note','message','meeting','introduction','follow_up')),
  body text not null check(char_length(body) between 1 and 10000),
  happened_on date not null default current_date, created_at timestamptz not null default now(),
  foreign key(contact_id,workspace_id) references public.workspace_contacts(id,workspace_id)
);
create table public.communities (
  id uuid primary key default gen_random_uuid(), name text not null check(char_length(name) between 1 and 120),
  description text not null default '', status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.community_members (
  community_id uuid not null references public.communities(id), user_id uuid not null references auth.users(id),
  role text not null default 'member' check(role in ('manager','member')),
  status text not null default 'active' check(status in ('active','revoked')),
  display_name text not null default 'Member', bio text not null default '', skills text not null default '',
  url text not null default '', profile_visible boolean not null default false,
  revision bigint not null default 1, created_at timestamptz not null default now(),
  primary key(community_id,user_id)
);
create table public.community_invitations (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  email text not null, status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  invited_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references auth.users(id), accepted_at timestamptz,
  mail_status text not null default 'pending' check(mail_status in ('pending','sent','failed','uncertain')),
  mail_attempted_at timestamptz, created_at timestamptz not null default now()
);
create unique index community_pending_invitation on public.community_invitations(community_id,email) where status='pending';
create table public.community_posts (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  kind text not null check(kind in ('announcement','resource','help')),
  title text not null check(char_length(title) between 1 and 160), body text not null default '', url text not null default '',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  revision bigint not null default 1, author_id uuid not null references auth.users(id),
  published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,community_id)
);
create table public.community_comments (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  post_id uuid not null, author_id uuid not null references auth.users(id),
  post_revision bigint not null, context_snapshot jsonb not null,
  body text not null check(char_length(body) between 1 and 10000), created_at timestamptz not null default now(),
  foreign key(post_id,community_id) references public.community_posts(id,community_id)
);
create table public.community_events (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  current_version_id uuid, status text not null default 'scheduled' check(status in ('scheduled','cancelled')),
  revision bigint not null default 1, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,community_id)
);
create table public.community_event_versions (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  event_id uuid not null, number bigint not null, title text not null check(char_length(title) between 1 and 160),
  description text not null default '', location text not null default '', timezone text not null,
  starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,event_id), unique(event_id,number),
  foreign key(event_id,community_id) references public.community_events(id,community_id)
);
alter table public.community_events add foreign key(current_version_id,id) references public.community_event_versions(id,event_id);
create table public.community_rsvps (
  event_id uuid not null, version_id uuid not null, user_id uuid not null references auth.users(id),
  community_id uuid not null references public.communities(id), response text not null check(response in ('yes','maybe','no')),
  updated_at timestamptz not null default now(), primary key(version_id,user_id),
  foreign key(version_id,event_id) references public.community_event_versions(id,event_id),
  foreign key(event_id,community_id) references public.community_events(id,community_id)
);
create table public.community_referrals (
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
  author_id uuid not null references auth.users(id), name text not null, email text not null, reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now()
);

create function private.platum_community_role_for(c uuid,actor uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when private.is_platform_operator(actor) then 'manager'
    else (select m.role from public.community_members m where m.community_id=c and m.user_id=actor
      and m.status='active' and (s.status='active' or m.role='manager')) end
  from public.communities s where s.id=c and actor is not null
$$;
revoke all on function private.platum_community_role_for(uuid,uuid) from public,anon,authenticated;
create function private.platum_community_role(c uuid) returns text
language sql stable security definer set search_path='' as $$ select private.platum_community_role_for(c,auth.uid()) $$;
create function private.platum_post_readable(post uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.community_posts p where p.id=post and private.platum_community_role(p.community_id) is not null
    and (p.status='published' or p.author_id=auth.uid() or private.platum_community_role(p.community_id)='manager'))
$$;
revoke all on function private.platum_community_role(uuid),private.platum_post_readable(uuid) from public,anon;
grant execute on function private.platum_community_role(uuid),private.platum_post_readable(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['workspace_contacts','contact_interactions','communities','community_members','community_invitations',
    'community_posts','community_comments','community_events','community_event_versions','community_rsvps','community_referrals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['workspace_contacts','communities','community_members','community_posts','community_events'] loop
    execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
  end loop;
  foreach t in array array['community_members','community_invitations','community_posts','community_comments','community_events','community_event_versions','community_rsvps','community_referrals'] loop
    execute format('create index %I on public.%I(community_id)',t||'_community_idx',t);
  end loop;
end $$;
create index contacts_workspace_idx on public.workspace_contacts(workspace_id);
create index contact_interactions_contact_idx on public.contact_interactions(contact_id,workspace_id);
create index community_members_user_idx on public.community_members(user_id);
create index community_posts_author_idx on public.community_posts(author_id);
create policy contacts_team_read on public.workspace_contacts for select to authenticated using(private.is_workspace_operator(workspace_id));
create policy contact_interactions_team_read on public.contact_interactions for select to authenticated using(private.is_workspace_operator(workspace_id));
create policy community_read on public.communities for select to authenticated using(private.platum_community_role(id) is not null);
create policy community_directory_read on public.community_members for select to authenticated using(
  private.platum_community_role(community_id) is not null and
  (private.platum_community_role(community_id)='manager' or user_id=auth.uid() or (status='active' and profile_visible)));
create policy community_invitation_read on public.community_invitations for select to authenticated using(private.platum_community_role(community_id)='manager');
create policy community_post_read on public.community_posts for select to authenticated using(private.platum_post_readable(id));
create policy community_comment_read on public.community_comments for select to authenticated using(private.platum_post_readable(post_id));
create policy community_event_read on public.community_events for select to authenticated using(private.platum_community_role(community_id) is not null);
create policy community_event_version_read on public.community_event_versions for select to authenticated using(private.platum_community_role(community_id) is not null);
create policy community_rsvp_read on public.community_rsvps for select to authenticated using(private.platum_community_role(community_id) is not null);
create policy community_referral_read on public.community_referrals for select to authenticated using(
  private.platum_community_role(community_id) is not null and (author_id=auth.uid() or private.platum_community_role(community_id)='manager'));

create function private.platum_network_mutate(action text,scope uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); role_name text; entity uuid; expected bigint; sig text; cached private.platum_operations;
  result jsonb; con public.workspace_contacts; post public.community_posts; ev public.community_events;
  member public.community_members; community public.communities; version public.community_event_versions;
  item text; categories text[]; owner_id uuid; linked_id uuid; task uuid; url text; status text; n text;
begin
  perform private.platum_require(actor is not null and operation is not null,'UNAUTHENTICATED');
  perform private.platum_require(exists(select 1 from auth.users where id=actor and email_confirmed_at is not null),'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=60000);
  entity:=nullif(p->>'id','')::uuid; expected:=nullif(p->>'revision','')::bigint;
  if action like 'contact.%' then
    perform 1 from public.workspaces where id=scope for update;
    perform private.platum_require(found and private.is_workspace_operator(scope),'FORBIDDEN');
  elsif action='community.create' then
    perform private.platum_require(private.is_platform_operator(actor) and scope is null,'FORBIDDEN');
  else
    perform 1 from public.communities where id=scope for update;
    role_name:=private.platum_community_role_for(scope,actor);
    perform private.platum_require(role_name is not null,'FORBIDDEN');
    perform private.platum_require(action='community.save' or exists(select 1 from public.communities c where c.id=scope and c.status='active'),'FORBIDDEN');
    if action in ('community.save','community.event.save') then perform private.platum_require(role_name='manager','FORBIDDEN'); end if;
    if action='community.post.save' then
      if entity is not null then
        select * into post from public.community_posts where id=entity and community_id=scope for update;
        perform private.platum_require(found and (post.author_id=actor or role_name='manager'),'FORBIDDEN');
      end if;
      perform private.platum_require(p->>'kind' in ('announcement','resource','help'));
      perform private.platum_require(p->>'kind'<>'announcement' or role_name='manager','FORBIDDEN');
    elsif action='community.comment' then
      select * into post from public.community_posts where id=entity and community_id=scope;
      perform private.platum_require(found and post.status='published','FORBIDDEN');
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  sig:=md5('network:'||action||coalesce(scope::text,'')||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');return cached.result;end if;

  if action='contact.save' then
    if entity is not null then
      select * into con from public.workspace_contacts where id=entity and workspace_id=scope for update;
      perform private.platum_require(found,'NOT_FOUND'); perform private.platum_require(con.revision=expected,'CONFLICT');
    end if;
    perform private.platum_require(jsonb_typeof(coalesce(p->'categories','[]'))='array' and jsonb_array_length(coalesce(p->'categories','[]'))<=8);
    select coalesce(array_agg(distinct value),'{}') into categories from jsonb_array_elements_text(coalesce(p->'categories','[]'));
    foreach item in array categories loop perform private.platum_require(item in ('client','team','freelancer','partner','prospect','community','other'));end loop;
    owner_id:=nullif(p->>'owner_id','')::uuid; linked_id:=nullif(p->>'linked_user_id','')::uuid;task:=nullif(p->>'task_id','')::uuid;
    perform private.platum_require(owner_id is null or private.is_platform_operator(owner_id) or exists(select 1 from public.workspace_members where workspace_id=scope and user_id=owner_id and role in ('owner','admin','team')),'INVALID_ASSIGNEE');
    perform private.platum_require(linked_id is null or private.is_platform_operator(linked_id) or exists(select 1 from public.workspace_members where workspace_id=scope and user_id=linked_id),'INVALID_ASSIGNEE');
    perform private.platum_require(task is null or exists(select 1 from public.tasks where id=task and workspace_id=scope),'INVALID_SHARED_REFERENCE');
    url:=private.platum_text(p,'url',2000);perform private.platum_require(url='' or url ~ '^https?://[^[:space:]]+$','INVALID_URL');
    status:=coalesce(p->>'status','active');perform private.platum_require(status in ('active','archived'));
    n:=private.platum_text(p,'name',160,true);
    if con.id is null then
      insert into public.workspace_contacts(workspace_id,name,created_by) values(scope,n,actor) returning * into con;
    end if;
    update public.workspace_contacts set name=n,organisation=private.platum_text(p,'organisation',160),role_title=private.platum_text(p,'role_title',160),
      categories=categories,email=private.platum_text(p,'email',254),phone=private.platum_text(p,'phone',80),url=url,context=private.platum_text(p,'context',10000),
      next_action=private.platum_text(p,'next_action',3000),follow_up_on=nullif(p->>'follow_up_on','')::date,owner_id=owner_id,
      linked_user_id=linked_id,task_id=task,status=status,updated_at=now() where id=con.id returning * into con;
    result:=to_jsonb(con);
  elsif action='contact.interaction' then
    select * into con from public.workspace_contacts where id=entity and workspace_id=scope;
    perform private.platum_require(found and con.status='active','NOT_FOUND');
    perform private.platum_require(p->>'kind' in ('note','message','meeting','introduction','follow_up'));
    perform private.platum_require(coalesce(nullif(p->>'happened_on','')::date,current_date)<=current_date);
    insert into public.contact_interactions(workspace_id,contact_id,author_id,kind,body,happened_on)
      values(scope,con.id,actor,p->>'kind',private.platum_text(p,'body',10000,true),coalesce(nullif(p->>'happened_on','')::date,current_date)) returning to_jsonb(contact_interactions.*) into result;
  elsif action='community.create' then
    insert into public.communities(name,description,created_by) values(private.platum_text(p,'name',120,true),private.platum_text(p,'description',5000),actor) returning * into community;
    insert into public.community_members(community_id,user_id,role) values(community.id,actor,'manager');
    result:=to_jsonb(community);
  elsif action='community.save' then
    select * into community from public.communities where id=scope;
    perform private.platum_require(community.revision=expected,'CONFLICT');
    perform private.platum_require(p->>'status' in ('active','archived'));
    update public.communities set name=private.platum_text(p,'name',120,true),description=private.platum_text(p,'description',5000),status=p->>'status',updated_at=now() where id=scope returning to_jsonb(communities.*) into result;
  elsif action='community.profile' then
    select * into member from public.community_members where community_id=scope and user_id=actor and community_members.status='active' for update;
    perform private.platum_require(found,'FORBIDDEN');perform private.platum_require(member.revision=expected,'CONFLICT');
    url:=private.platum_text(p,'url',2000);perform private.platum_require(url='' or url ~ '^https?://[^[:space:]]+$','INVALID_URL');
    update public.community_members set display_name=private.platum_text(p,'display_name',120,true),bio=private.platum_text(p,'bio',3000),skills=private.platum_text(p,'skills',1000),url=url,
      profile_visible=coalesce((p->>'profile_visible')::boolean,false) where community_id=scope and user_id=actor returning to_jsonb(community_members.*) into result;
  elsif action='community.leave' then
    perform private.platum_require(role_name='member','FORBIDDEN');
    update public.community_members set status='revoked',profile_visible=false where community_id=scope and user_id=actor returning to_jsonb(community_members.*) into result;
  elsif action='community.post.save' then
    if post.id is not null then perform private.platum_require(post.revision=expected,'CONFLICT');end if;
    status:=p->>'status';perform private.platum_require(status in ('draft','published','archived'));
    perform private.platum_require(post.published_at is null or status<>'draft');
    url:=private.platum_text(p,'url',2000);perform private.platum_require(url='' or url ~ '^https?://[^[:space:]]+$','INVALID_URL');
    if post.id is null then
      insert into public.community_posts(community_id,kind,title,author_id) values(scope,p->>'kind',private.platum_text(p,'title',160,true),actor) returning * into post;
    end if;
    update public.community_posts set title=private.platum_text(p,'title',160,true),kind=p->>'kind',body=private.platum_text(p,'body',15000),url=url,status=status,
      published_at=coalesce(published_at,case when status='published' then now() end),updated_at=now() where id=post.id returning to_jsonb(community_posts.*) into result;
  elsif action='community.comment' then
    insert into public.community_comments(community_id,post_id,author_id,post_revision,context_snapshot,body)
      values(scope,post.id,actor,post.revision,jsonb_build_object('title',post.title,'body',post.body,'url',post.url),private.platum_text(p,'body',10000,true)) returning to_jsonb(community_comments.*) into result;
  elsif action='community.event.save' then
    if entity is not null then
      select * into ev from public.community_events where id=entity and community_id=scope for update;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(ev.revision=expected,'CONFLICT');
    end if;
    perform private.platum_require(exists(select 1 from pg_catalog.pg_timezone_names where name=p->>'timezone'),'INVALID_TIMEZONE');
    perform private.platum_require((p->>'ends_at')::timestamptz>(p->>'starts_at')::timestamptz,'INVALID_EVENT');
    status:=coalesce(p->>'status','scheduled');perform private.platum_require(status in ('scheduled','cancelled'));
    if ev.id is null then insert into public.community_events(community_id,created_by) values(scope,actor) returning * into ev;end if;
    insert into public.community_event_versions(community_id,event_id,number,title,description,location,timezone,starts_at,ends_at,created_by)
      values(scope,ev.id,ev.revision,private.platum_text(p,'title',160,true),private.platum_text(p,'description',10000),private.platum_text(p,'location',2000),p->>'timezone',(p->>'starts_at')::timestamptz,(p->>'ends_at')::timestamptz,actor) returning * into version;
    update public.community_events set current_version_id=version.id,status=status where id=ev.id returning * into ev;
    result:=jsonb_build_object('id',ev.id,'community_id',scope,'event',to_jsonb(ev),'version',to_jsonb(version));
  elsif action='community.rsvp' then
    select * into ev from public.community_events where id=entity and community_id=scope;
    perform private.platum_require(found and ev.status='scheduled' and ev.current_version_id=(p->>'version_id')::uuid,'CURRENT_VERSION_CHANGED');
    perform private.platum_require(p->>'response' in ('yes','maybe','no'));
    insert into public.community_rsvps(event_id,version_id,user_id,community_id,response) values(ev.id,ev.current_version_id,actor,scope,p->>'response')
      on conflict(version_id,user_id) do update set response=excluded.response,updated_at=now() returning to_jsonb(community_rsvps.*) into result;
  elsif action='community.referral' then
    n:=lower(private.platum_text(p,'email',254,true));perform private.platum_require(n ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$','INVALID_EMAIL');
    insert into public.community_referrals(community_id,author_id,name,email,reason) values(scope,actor,private.platum_text(p,'name',120,true),n,private.platum_text(p,'reason',3000,true)) returning to_jsonb(community_referrals.*) into result;
  else raise exception 'UNKNOWN_ACTION' using errcode='22023';end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
  return result;
end $$;
revoke all on function private.platum_network_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.platum_network_mutate(text,uuid,jsonb,uuid) to authenticated;
create function public.platum_network_mutate(action text,scope_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_network_mutate(action,scope_id,payload,operation_id) $$;
revoke all on function public.platum_network_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.platum_network_mutate(text,uuid,jsonb,uuid) to authenticated;

create function private.platum_accept_community_invitations() returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); address text; invitation public.community_invitations; n integer:=0;
begin
  select lower(email) into address from auth.users where id=actor and email_confirmed_at is not null;
  if address is null then return 0;end if;
  for invitation in select i.* from public.community_invitations i join public.communities c on c.id=i.community_id
    where i.email=address and i.status='pending' and i.expires_at>now() and c.status='active' for update of i loop
    insert into public.community_members(community_id,user_id) values(invitation.community_id,actor)
      on conflict(community_id,user_id) do update set status='active';
    update public.community_invitations set status='accepted',accepted_by=actor,accepted_at=now() where id=invitation.id;
    n:=n+1;
  end loop;return n;
end $$;
revoke all on function private.platum_accept_community_invitations() from public,anon;
grant execute on function private.platum_accept_community_invitations() to authenticated;
create function public.platum_accept_community_invitations() returns integer language sql security invoker set search_path='' as $$ select private.platum_accept_community_invitations() $$;
revoke all on function public.platum_accept_community_invitations() from public,anon;
grant execute on function public.platum_accept_community_invitations() to authenticated;

-- Server-only membership/invitation management; it never writes workspace_members.
create function private.platum_community_service(action text,actor uuid,c uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare invitation public.community_invitations; referral public.community_referrals; member public.community_members;
  entity uuid:=nullif(p->>'id','')::uuid; address text; sig text; cached private.platum_operations;result jsonb;
begin
  perform private.platum_require(actor is not null and operation is not null and exists(select 1 from auth.users where id=actor and email_confirmed_at is not null),'UNAUTHENTICATED');
  perform 1 from public.communities where id=c and status='active' for update;
  perform private.platum_require(found and private.platum_community_role_for(c,actor)='manager','FORBIDDEN');
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  sig:=md5('community-service:'||action||c::text||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');return cached.result;end if;
  if action='invitation.create' then
    address:=lower(private.platum_text(p,'email',254,true));
    perform private.platum_require(address ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$','INVALID_EMAIL');
    if nullif(p->>'referral_id','') is not null then
      select * into referral from public.community_referrals where id=(p->>'referral_id')::uuid and community_id=c for update;
      perform private.platum_require(found and referral.status='pending' and referral.email=address,'FORBIDDEN');
      update public.community_referrals set status='approved',reviewed_by=actor,reviewed_at=now() where id=referral.id;
    end if;
    insert into public.community_invitations(community_id,email,invited_by) values(c,address,actor)
      on conflict(community_id,email) where status='pending' do update set expires_at=now()+interval '7 days' returning * into invitation;
    result:=to_jsonb(invitation);
  elsif action='member.revoke' then
    select * into member from public.community_members where community_id=c and user_id=entity for update;
    perform private.platum_require(found and member.role='member' and not coalesce(private.is_platform_operator(entity),false),'FORBIDDEN');
    update public.community_members set status='revoked',profile_visible=false where community_id=c and user_id=entity;
    update public.community_invitations set status='revoked' where community_id=c and status='pending' and email=(select lower(email) from auth.users where id=entity);
    result:=jsonb_build_object('community_id',c,'user_id',entity);
  elsif action='referral.reject' then
    update public.community_referrals set status='rejected',reviewed_by=actor,reviewed_at=now() where id=entity and community_id=c and status='pending' returning to_jsonb(community_referrals.*) into result;
    perform private.platum_require(found,'NOT_FOUND');
  else
    select * into invitation from public.community_invitations where id=entity and community_id=c for update;
    perform private.platum_require(found and invitation.status='pending','INVITATION_UNAVAILABLE');
    if action='invitation.resend' then
      perform private.platum_require(invitation.mail_attempted_at is null or invitation.mail_attempted_at<now()-interval '1 minute','INVITATION_RATE_LIMIT');
      update public.community_invitations set expires_at=now()+interval '7 days',mail_status='pending' where id=entity returning * into invitation;
      result:=to_jsonb(invitation);
    elsif action='invitation.claim' then
      if invitation.mail_attempted_at is not null and invitation.mail_attempted_at>now()-interval '1 minute' then
        result:=jsonb_build_object('send',false,'invitation',to_jsonb(invitation));
      else
        update public.community_invitations set mail_attempted_at=now(),mail_status='uncertain' where id=entity returning * into invitation;
        result:=jsonb_build_object('send',true,'invitation',to_jsonb(invitation));
      end if;
    elsif action='invitation.delivery' then
      perform private.platum_require(p->>'status' in ('sent','failed','uncertain'));
      update public.community_invitations set mail_status=p->>'status' where id=entity returning to_jsonb(community_invitations.*) into result;
    elsif action='invitation.revoke' then
      update public.community_invitations set status='revoked' where id=entity returning to_jsonb(community_invitations.*) into result;
    else raise exception 'UNKNOWN_ACTION' using errcode='22023';end if;
  end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);return result;
end $$;
revoke all on function private.platum_community_service(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.platum_community_service(action text,actor_id uuid,community_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_community_service(action,actor_id,community_id,payload,operation_id) $$;
revoke all on function public.platum_community_service(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.platum_community_service(text,uuid,uuid,jsonb,uuid),public.platum_community_service(text,uuid,uuid,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
