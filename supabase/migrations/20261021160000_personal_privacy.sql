-- Account-owned data does not provision workspaces or confer platform/workspace roles.
create table public.personal_contacts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 fields jsonb not null default '{}', status text not null default 'active' check(status in ('active','hidden','archived')),
 revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.personal_contact_grants (
 id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.personal_contacts(id),
 recipient_id uuid references auth.users(id), workspace_id uuid references public.workspaces(id),
 fields text[] not null, can_edit boolean not null default false,
 revision bigint not null default 1, created_at timestamptz not null default now(),
 check((recipient_id is null)<>(workspace_id is null)), check(cardinality(fields)>0)
);
create unique index personal_contact_grant_target on public.personal_contact_grants(contact_id,
 coalesce(recipient_id,'00000000-0000-0000-0000-000000000000'),coalesce(workspace_id,'00000000-0000-0000-0000-000000000000'));
create index personal_contact_owner on public.personal_contacts(owner_id);
create index personal_contact_grant_contact on public.personal_contact_grants(contact_id);
create index personal_contact_grant_recipient on public.personal_contact_grants(recipient_id);
create index personal_contact_grant_workspace on public.personal_contact_grants(workspace_id);
-- Extends the existing calendar experience with personal entries and redacted busy slots.
create table public.personal_calendar_entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('private','free','unavailable','shared')),
 title text not null default '', notes text not null default '', location text not null default '',
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), timezone text not null,
 participants uuid[] not null default '{}', status text not null default 'active' check(status in ('active','archived')),
 revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index personal_calendar_owner on public.personal_calendar_entries(owner_id);
create index personal_calendar_time on public.personal_calendar_entries(starts_at,ends_at);
create table public.community_applications (
 id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id),
 applicant_id uuid not null references auth.users(id), message text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 revision bigint not null default 1, created_at timestamptz not null default now()
);
create unique index community_application_pending on public.community_applications(community_id,applicant_id) where status='pending';
create index community_application_community on public.community_applications(community_id);
create index community_application_applicant on public.community_applications(applicant_id);
alter table public.communities add column applications_open boolean not null default false;

do $$ declare t text;begin
 foreach t in array array['personal_contacts','personal_contact_grants','personal_calendar_entries','community_applications'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('alter table public.%I force row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
 end loop;
end $$;
-- No platform-operator override. Recipients receive a field projection via RPC only.
create policy personal_contact_owner_read on public.personal_contacts for select to authenticated using(owner_id=auth.uid());
create policy personal_contact_grant_owner_read on public.personal_contact_grants for select to authenticated using(
 exists(select 1 from public.personal_contacts c where c.id=contact_id and c.owner_id=auth.uid()));
create policy personal_calendar_owner_read on public.personal_calendar_entries for select to authenticated using(owner_id=auth.uid());
create policy community_application_read on public.community_applications for select to authenticated using(
 applicant_id=auth.uid() or private.platum_community_role(community_id)='manager');

create function private.platum_coworkers(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a is not null and b is not null and a<>b and exists(
 select 1 from public.workspace_members x join public.workspace_members y on x.workspace_id=y.workspace_id
 where x.user_id=a and y.user_id=b)
$$;
create function private.platum_contact_peer(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.platum_coworkers(a,b) or exists(
 select 1 from public.community_members x join public.community_members y on x.community_id=y.community_id
 join public.communities c on c.id=x.community_id
 where x.user_id=a and y.user_id=b and a<>b and x.status='active' and y.status='active' and y.profile_visible and c.status='active')
$$;
create function private.platum_contact_fields(c uuid,actor uuid,editing boolean default false) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct f),'{}') from public.personal_contact_grants g
 join public.personal_contacts p on p.id=g.contact_id cross join lateral unnest(g.fields) f
 where g.contact_id=c and p.status='active' and (not editing or g.can_edit)
 and ((g.recipient_id=actor and private.platum_contact_peer(p.owner_id,actor)) or
 (g.workspace_id is not null and exists(select 1 from public.workspace_members m where m.workspace_id=g.workspace_id and m.user_id=p.owner_id)
 and (private.is_platform_operator(actor) or exists(select 1 from public.workspace_members m where m.workspace_id=g.workspace_id and m.user_id=actor and m.role in ('owner','admin','team')))))
$$;
create function private.platum_contact_projection(c public.personal_contacts,actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'owner_id',c.owner_id,'revision',c.revision,'status',c.status,
 'editable_fields',case when c.owner_id=actor then array['name','specialisation','phone','email','socials','notes'] else private.platum_contact_fields(c.id,actor,true) end,
 'fields',case when c.owner_id=actor then c.fields else
 coalesce((select jsonb_object_agg(key,value) from jsonb_each(c.fields) where key=any(private.platum_contact_fields(c.id,actor))),'{}') end,
 'grants',case when c.owner_id=actor then coalesce((select jsonb_agg(to_jsonb(g)) from public.personal_contact_grants g where g.contact_id=c.id),'[]') else '[]'::jsonb end)
$$;
create function private.platum_personal_data() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;
begin
 perform private.platum_require(exists(select 1 from auth.users where id=actor and email_confirmed_at is not null),'UNAUTHENTICATED');
 select jsonb_build_object(
 'contacts',coalesce((select jsonb_agg(private.platum_contact_projection(c,actor) order by c.created_at) from public.personal_contacts c
 where c.owner_id=actor or cardinality(private.platum_contact_fields(c.id,actor))>0),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from public.personal_calendar_entries e where e.owner_id=actor or
 (e.kind='shared' and e.status='active' and actor=any(e.participants) and private.platum_coworkers(e.owner_id,actor))),'[]'),
 'busy',coalesce((select jsonb_agg(jsonb_build_object('user_id',e.owner_id,'starts_at',e.starts_at,'ends_at',e.ends_at,
 'availability',case when e.kind='free' then 'free' when e.kind='unavailable' then 'unavailable' else 'busy' end))
 from public.personal_calendar_entries e where e.status='active' and e.owner_id<>actor and private.platum_coworkers(e.owner_id,actor)
 and not (e.kind='shared' and actor=any(e.participants))),'[]'),
 'people',coalesce((select jsonb_agg(jsonb_build_object('user_id',u.id,'coworker',private.platum_coworkers(actor,u.id),'name',case when private.platum_coworkers(actor,u.id) then coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'Participant') else
 (select y.display_name from public.community_members x join public.community_members y on x.community_id=y.community_id join public.communities c on c.id=x.community_id
 where x.user_id=actor and y.user_id=u.id and x.status='active' and y.status='active' and y.profile_visible and c.status='active' order by y.community_id limit 1) end))
 from auth.users u where private.platum_contact_peer(actor,u.id)),'[]'),
 'joinable',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description)) from public.communities c
 where c.status='active' and c.applications_open and not exists(select 1 from public.community_members m where m.community_id=c.id and m.user_id=actor and m.status='active')),'[]'),
 'applications',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('applicant_name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'Participant'))) from public.community_applications a join auth.users u on u.id=a.applicant_id where a.applicant_id=actor or private.platum_community_role(a.community_id)='manager'),'[]')
 ) into result;
 return result;
end $$;
create function public.platum_personal_data() returns jsonb language sql security invoker set search_path='' as $$ select private.platum_personal_data() $$;

create function private.platum_personal_mutate(action text,p jsonb,operation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=auth.uid();c public.personal_contacts; g public.personal_contact_grants; e public.personal_calendar_entries;
 app public.community_applications;entity uuid:=nullif(p->>'id','')::uuid;expected bigint:=coalesce((p->>'revision')::bigint,0);
 fields jsonb;allowed text[];keys text[];item text;recipient uuid;work uuid;part uuid;parts uuid[];start_time timestamptz;end_time timestamptz;
 sig text;cached private.platum_operations;result jsonb;n integer:=0;
begin
 perform private.platum_require(exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) and operation is not null,'UNAUTHENTICATED');
 perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=60000);
 -- Serialize all personal operations, including grant changes, per owner/requester.
 perform pg_advisory_xact_lock(hashtext('personal'),hashtext(actor::text));
 if action in ('contact.save','contact.share','contact.revoke') then
  if action='contact.revoke' then
   select * into g from public.personal_contact_grants where id=entity;
   select * into c from public.personal_contacts where id=coalesce(g.contact_id,(select (o.result->>'id')::uuid from private.platum_operations o where o.actor_id=actor and o.operation_id=operation and o.signature=md5('personal:'||action||p::text))) for update;
  elsif entity is not null then select * into c from public.personal_contacts where id=entity for update;
  end if;
  if action<>'contact.save' or entity is not null then perform private.platum_require(c.id is not null,'NOT_FOUND'); end if;
  if action<>'contact.save' then perform private.platum_require(c.owner_id=actor,'FORBIDDEN');
  elsif c.id is not null then perform private.platum_require(c.owner_id=actor or cardinality(private.platum_contact_fields(c.id,actor,true))>0,'FORBIDDEN');end if;
 elsif action='event.save' and entity is not null then
  select * into e from public.personal_calendar_entries where id=entity for update;
  perform private.platum_require(e.id is not null and e.owner_id=actor,'FORBIDDEN');
 elsif action='application.withdraw' then
  select * into app from public.community_applications where id=entity for update;
  perform private.platum_require(app.applicant_id=actor,'FORBIDDEN');
 end if;
 sig:=md5('personal:'||action||p::text);
 select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
 if found then
  perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');
  -- Do not return an earlier field projection after sharing/editing rights changed.
  if action='contact.save' then
   select * into c from public.personal_contacts where id=(cached.result->>'id')::uuid;
   return private.platum_contact_projection(c,actor);
  end if;
  return cached.result;
 end if;
 if action='contact.save' then
  fields:=p->'fields';perform private.platum_require(jsonb_typeof(fields)='object');
  allowed:=case when c.id is null or c.owner_id=actor then array['name','specialisation','phone','email','socials','notes'] else private.platum_contact_fields(c.id,actor,true) end;
  for item in select jsonb_object_keys(fields) loop
   perform private.platum_require(item=any(allowed),'FORBIDDEN');
   perform private.platum_require(jsonb_typeof(fields->item)='string' and char_length(fields->>item)<=case when item='notes' then 10000 else 2000 end);
  end loop;
  if c.id is null then
   perform private.platum_require(char_length(btrim(fields->>'name')) between 1 and 160);
   insert into public.personal_contacts(owner_id,fields,status) values(actor,fields,coalesce(p->>'status','active')) returning * into c;
  else
   perform private.platum_require(c.revision=expected,'CONFLICT');
   if fields?'name' then perform private.platum_require(char_length(btrim(fields->>'name')) between 1 and 160);end if;
   if c.owner_id<>actor then perform private.platum_require(not p?'status','FORBIDDEN');end if;
   update public.personal_contacts set fields=personal_contacts.fields||fields,status=case when owner_id=actor then coalesce(p->>'status',status) else status end,updated_at=now()
    where id=c.id returning * into c;
  end if;
  result:=private.platum_contact_projection(c,actor);
 elsif action in ('contact.share','contact.share-book') then
  if action='contact.share' then perform private.platum_require(c.revision=expected,'CONFLICT');end if;
  recipient:=nullif(p->>'recipient_id','')::uuid;work:=nullif(p->>'workspace_id','')::uuid;
  perform private.platum_require((recipient is null)<>(work is null));
  perform private.platum_require(recipient is null or private.platum_contact_peer(actor,recipient),'FORBIDDEN');
  perform private.platum_require(work is null or exists(select 1 from public.workspace_members where workspace_id=work and user_id=actor),'FORBIDDEN');
  perform private.platum_require(jsonb_typeof(p->'fields')='array');
  select array_agg(distinct value) into keys from jsonb_array_elements_text(p->'fields');
  perform private.platum_require(cardinality(keys)>0 and keys<@array['name','specialisation','phone','email','socials','notes']);
  for c in select * from public.personal_contacts where owner_id=actor and ((action='contact.share' and id=entity) or (action='contact.share-book' and status='active')) for update loop
   insert into public.personal_contact_grants(contact_id,recipient_id,workspace_id,fields,can_edit)
    values(c.id,recipient,work,keys,coalesce((p->>'can_edit')::boolean,false))
    on conflict(contact_id,coalesce(recipient_id,'00000000-0000-0000-0000-000000000000'),coalesce(workspace_id,'00000000-0000-0000-0000-000000000000'))
    do update set fields=excluded.fields,can_edit=excluded.can_edit;
   -- Advance the contact revision so stale owner/delegate edits cannot ignore a grant change.
   update public.personal_contacts set updated_at=now() where id=c.id;
   n:=n+1;
  end loop; result:=jsonb_build_object('id',entity,'shared_count',n);
 elsif action='contact.revoke' then
  perform private.platum_require(g.revision=expected,'CONFLICT');
  delete from public.personal_contact_grants where id=g.id;
  update public.personal_contacts set updated_at=now() where id=c.id;
  result:=jsonb_build_object('id',c.id);
 elsif action='event.save' then
  if e.id is not null then perform private.platum_require(e.revision=expected,'CONFLICT');end if;
  perform private.platum_require(p->>'kind' in ('private','free','unavailable','shared'));
  start_time:=(p->>'starts_at')::timestamptz;end_time:=(p->>'ends_at')::timestamptz;
  perform private.platum_require(end_time>start_time and end_time<=start_time+interval '366 days' and extract(year from start_time) between 1 and 9999 and extract(year from end_time) between 1 and 9999,'INVALID_EVENT_TIME');
  perform private.platum_require(exists(select 1 from pg_catalog.pg_timezone_names where name=p->>'timezone'),'INVALID_TIMEZONE');
  perform private.platum_require(jsonb_typeof(coalesce(p->'participants','[]'))='array' and jsonb_array_length(coalesce(p->'participants','[]'))<=100);
  select coalesce(array_agg(distinct value::uuid),'{}') into parts from jsonb_array_elements_text(coalesce(p->'participants','[]'));
  perform private.platum_require(p->>'kind'<>'shared' or cardinality(parts)>0,'INVALID_ASSIGNEE');
  if p->>'kind'<>'shared' then perform private.platum_require(cardinality(parts)=0);end if;
  foreach part in array parts loop perform private.platum_require(private.platum_coworkers(actor,part),'INVALID_ASSIGNEE');end loop;
  if e.id is null then insert into public.personal_calendar_entries(owner_id,kind,starts_at,ends_at,timezone) values(actor,p->>'kind',start_time,end_time,p->>'timezone') returning * into e;end if;
  update public.personal_calendar_entries set kind=p->>'kind',title=private.platum_text(p,'title',160,true),notes=private.platum_text(p,'notes',10000),location=private.platum_text(p,'location',2000),
   starts_at=start_time,ends_at=end_time,timezone=p->>'timezone',participants=parts,status=coalesce(p->>'status','active'),updated_at=now() where id=e.id returning * into e;
  result:=to_jsonb(e);
 elsif action='application.create' then
  entity:=(p->>'community_id')::uuid;
  perform 1 from public.communities where id=entity and status='active' and applications_open for update;
  perform private.platum_require(found and not exists(select 1 from public.community_members where community_id=entity and user_id=actor and status='active'),'FORBIDDEN');
  insert into public.community_applications(community_id,applicant_id,message) values(entity,actor,private.platum_text(p,'message',3000))
   on conflict(community_id,applicant_id) where status='pending' do update set message=excluded.message returning * into app;
  result:=to_jsonb(app);
 elsif action='application.withdraw' then
  perform private.platum_require(app.status='pending','FORBIDDEN');
  perform private.platum_require(app.revision=expected,'CONFLICT');
  update public.community_applications set status='withdrawn' where id=app.id returning to_jsonb(community_applications.*) into result;
 else raise exception 'UNKNOWN_ACTION' using errcode='22023';end if;
 insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
 return result;
end $$;
create function public.platum_personal_mutate(action text,payload jsonb,operation_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.platum_personal_mutate(action,payload,operation_id) $$;
revoke all on function private.platum_coworkers(uuid,uuid),private.platum_contact_peer(uuid,uuid),private.platum_contact_fields(uuid,uuid,boolean),private.platum_contact_projection(public.personal_contacts,uuid) from public,anon,authenticated;
revoke all on function private.platum_personal_data(),public.platum_personal_data(),private.platum_personal_mutate(text,jsonb,uuid),public.platum_personal_mutate(text,jsonb,uuid) from public,anon;
grant execute on function private.platum_personal_data(),public.platum_personal_data(),private.platum_personal_mutate(text,jsonb,uuid),public.platum_personal_mutate(text,jsonb,uuid) to authenticated;

-- Applications only grant community membership after a manager's explicit decision.
create function private.platum_community_service_access(action text,actor uuid,c uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare app public.community_applications;result jsonb;sig text;cached private.platum_operations;
begin
 if action not in ('application.approve','application.reject') then return private.platum_community_service(action,actor,c,p,operation);end if;
 perform private.platum_require(operation is not null and exists(select 1 from auth.users where id=actor and email_confirmed_at is not null),'UNAUTHENTICATED');
 perform 1 from public.communities where id=c and status='active' for update;
 perform private.platum_require(found and private.platum_community_role_for(c,actor)='manager','FORBIDDEN');
 perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
 sig:=md5('application-review:'||action||c::text||p::text);
 select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
 if found then perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');return cached.result;end if;
 select * into app from public.community_applications where id=(p->>'id')::uuid and community_id=c for update;
 perform private.platum_require(found and app.status='pending','NOT_FOUND');
 if action='application.approve' then
  perform private.platum_require(exists(select 1 from auth.users where id=app.applicant_id and email_confirmed_at is not null),'UNAUTHENTICATED');
  insert into public.community_members(community_id,user_id) values(c,app.applicant_id)
    on conflict(community_id,user_id) do update set status='active';
 end if;
 update public.community_applications set status=case when action='application.approve' then 'approved' else 'rejected' end,
 reviewed_by=actor,reviewed_at=now() where id=app.id returning to_jsonb(community_applications.*) into result;
 insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
 return result;
end $$;
create or replace function public.platum_community_service(action text,actor_id uuid,community_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_community_service_access(action,actor_id,community_id,payload,operation_id) $$;
revoke all on function private.platum_community_service_access(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.platum_community_service_access(text,uuid,uuid,jsonb,uuid) to service_role;

-- Require an explicit export-offer acknowledgement before revoking a client.
-- It attests the operator's handoff; it does not claim the client downloaded it.
create function private.platum_service_access(action text,actor uuid,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if action='member.revoke' then perform 1 from public.workspaces where id=w for update;end if;
 if action='member.revoke' and exists(select 1 from public.workspace_members where workspace_id=w and user_id=(p->>'id')::uuid and role='client') then
  perform private.platum_require((p->>'export_offered')::boolean is true,'EXPORT_OFFER_REQUIRED');
 end if;
 return private.platum_service_command(action,actor,w,p,operation);
end $$;
create or replace function public.platum_service_command(action text,actor_id uuid,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_service_access(action,actor_id,workspace_id,payload,operation_id) $$;
revoke all on function private.platum_service_access(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.platum_service_access(text,uuid,uuid,jsonb,uuid) to service_role;

alter table public.workspace_contacts add column linked_verified_by uuid references auth.users(id), add column linked_verified_at timestamptz;
-- Existing legacy links are not retroactively declared verified.
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
    if linked_id is not null and linked_id is distinct from con.linked_user_id then perform private.platum_require((p->>'link_verified')::boolean is true,'CONTACT_VERIFICATION_REQUIRED');end if;
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
      linked_user_id=linked_id,linked_verified_by=case when linked_id is null then null when linked_id is distinct from con.linked_user_id or con.linked_verified_by is null and (p->>'link_verified')::boolean is true then actor else con.linked_verified_by end,
      linked_verified_at=case when linked_id is null then null when linked_id is distinct from con.linked_user_id or con.linked_verified_by is null and (p->>'link_verified')::boolean is true then now() else con.linked_verified_at end,task_id=task,status=status,updated_at=now() where id=con.id returning * into con;
    result:=to_jsonb(con);
  elsif action='contact.interaction' then
    select * into con from public.workspace_contacts where id=entity and workspace_id=scope;
    perform private.platum_require(found and con.status='active','NOT_FOUND');
    perform private.platum_require(p->>'kind' in ('note','message','meeting','introduction','follow_up'));
    perform private.platum_require(coalesce(nullif(p->>'happened_on','')::date,current_date)<=current_date);
    insert into public.contact_interactions(workspace_id,contact_id,author_id,kind,body,happened_on)
      values(scope,con.id,actor,p->>'kind',private.platum_text(p,'body',10000,true),coalesce(nullif(p->>'happened_on','')::date,current_date)) returning to_jsonb(contact_interactions.*) into result;
  elsif action='community.create' then
    insert into public.communities(name,description,created_by,applications_open) values(private.platum_text(p,'name',120,true),private.platum_text(p,'description',5000),actor,coalesce((p->>'applications_open')::boolean,false)) returning * into community;
    insert into public.community_members(community_id,user_id,role) values(community.id,actor,'manager');
    result:=to_jsonb(community);
  elsif action='community.save' then
    select * into community from public.communities where id=scope;
    perform private.platum_require(community.revision=expected,'CONFLICT');
    perform private.platum_require(p->>'status' in ('active','archived'));
    update public.communities set name=private.platum_text(p,'name',120,true),description=private.platum_text(p,'description',5000),status=p->>'status',applications_open=coalesce((p->>'applications_open')::boolean,applications_open),updated_at=now() where id=scope returning to_jsonb(communities.*) into result;
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


alter function private.platum_export(uuid) rename to platum_export_before_privacy;
create function private.platum_export(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.platum_export_before_privacy(w);
 -- Preserve the shared projection; include the client's own accessible uploads too.
 if private.is_workspace_operator(w) is not true then
  result:=result||jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes))
   from public.workspace_files f where f.workspace_id=w and f.status='ready' and private.platum_file_readable(f.id)),'[]'));
 end if;
 return result;
end $$;
revoke all on function private.platum_export(uuid) from public,anon;
grant execute on function private.platum_export(uuid) to authenticated;
create or replace function public.platum_export(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.platum_export(workspace_id) $$;
