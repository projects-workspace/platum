-- Agency-only publishing and voluntary, self-reported request participation.
-- Preserves existing posts, author drafts, comments, RSVP visibility and memberships.
-- Each response belongs to a request revision; a changed request needs a new response.
create table public.community_participations (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id),
  post_id uuid not null, post_revision bigint not null check(post_revision>0),
  user_id uuid not null references auth.users(id),
  status text not null check(status in ('participating','completed','withdrawn')),
  context_snapshot jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(post_id,post_revision,user_id),
  foreign key(post_id,community_id) references public.community_posts(id,community_id)
);
alter table public.community_participations enable row level security;
alter table public.community_participations force row level security;
revoke all on public.community_participations from public,anon,authenticated;
grant select on public.community_participations to authenticated;
create index community_participations_community_idx on public.community_participations(community_id);
create index community_participations_user_idx on public.community_participations(user_id);
create trigger pl_revision before update on public.community_participations
  for each row execute function private.platum_revision();
-- Participation reporting adds no member directory or peer-response visibility.
create policy community_participation_read on public.community_participations
  for select to authenticated using(private.platum_post_readable(post_id)
    and (user_id=auth.uid() or private.platum_community_role(community_id)='manager'));

create or replace function private.platum_network_mutate(action text,scope uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid(); role_name text; entity uuid; expected bigint; sig text; cached private.platum_operations;
  result jsonb; con public.workspace_contacts; post public.community_posts; ev public.community_events;
  member public.community_members; community public.communities; version public.community_event_versions;
  participation public.community_participations;
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
      perform private.platum_require(role_name='manager','FORBIDDEN');
      if entity is not null then
        select * into post from public.community_posts where id=entity and community_id=scope for update;
        perform private.platum_require(found and (post.author_id=actor or role_name='manager'),'FORBIDDEN');
      end if;
      perform private.platum_require(p->>'kind' in ('announcement','resource','help'));
      perform private.platum_require(p->>'kind'<>'announcement' or role_name='manager','FORBIDDEN');
    elsif action='community.comment' then
      select * into post from public.community_posts where id=entity and community_id=scope;
      perform private.platum_require(found and post.status='published','FORBIDDEN');
    elsif action='community.participation' then
      perform private.platum_require(exists(select 1 from public.community_members
        where community_id=scope and user_id=actor and community_members.status='active'),'FORBIDDEN');
      select * into post from public.community_posts where id=entity and community_id=scope for update;
      perform private.platum_require(found and post.status='published' and post.kind='help','FORBIDDEN');
      perform private.platum_require(post.revision=(p->>'post_revision')::bigint,'CURRENT_VERSION_CHANGED');
      perform private.platum_require(p->>'status' in ('participating','completed','withdrawn'));
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
  elsif action='community.participation' then
    select * into participation from public.community_participations
      where post_id=post.id and post_revision=post.revision and user_id=actor for update;
    perform private.platum_require(coalesce(participation.revision,0)=coalesce((p->>'response_revision')::bigint,0),'CONFLICT');
    perform private.platum_require(participation.id is not null or p->>'status'<>'withdrawn');
    insert into public.community_participations(community_id,post_id,post_revision,user_id,status,context_snapshot)
      values(scope,post.id,post.revision,actor,p->>'status',jsonb_build_object('title',post.title,'body',post.body,'url',post.url))
      on conflict(post_id,post_revision,user_id) do update set status=excluded.status,updated_at=now()
      returning to_jsonb(community_participations.*) into result;
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

-- Existing RPC grants and public wrapper remain unchanged.
