-- Regular collaboration: shared scheduling, with immutable proposals and responses.
-- All application writes are scoped, revision checked and retry safe.
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  revision bigint not null default 1,
  current_version_id uuid,
  status text not null default 'proposed' check(status in ('proposed','confirmed','declined','cancelled','completed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,workspace_id)
);
create table public.calendar_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  event_id uuid not null,
  number integer not null,
  title text not null check(char_length(title) between 1 and 160),
  agenda text not null default '' check(char_length(agenda)<=10000),
  location text not null default '' check(char_length(location)<=2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  proposed_by uuid not null references auth.users(id),
  proposed_side text not null check(proposed_side in ('team','client')),
  created_at timestamptz not null default now(),
  check(ends_at>starts_at and ends_at<=starts_at+interval '7 days'),
  unique(id,workspace_id), unique(event_id,number),
  foreign key(event_id,workspace_id) references public.calendar_events(id,workspace_id)
);
alter table public.calendar_events add constraint calendar_current_version_fk
  foreign key(current_version_id,workspace_id) references public.calendar_versions(id,workspace_id);
create table public.calendar_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null,
  author_id uuid not null references auth.users(id),
  response text not null check(response in ('confirmed','declined','cancelled','completed','comment')),
  note text not null default '' check(char_length(note)<=5000),
  created_at timestamptz not null default now(),
  foreign key(version_id,workspace_id) references public.calendar_versions(id,workspace_id)
);
create table public.workspace_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  timezone text not null,
  weekly jsonb not null default '[]' check(jsonb_typeof(weekly)='array'),
  unavailable jsonb not null default '[]' check(jsonb_typeof(unavailable)='array'),
  note text not null default '' check(char_length(note)<=2000),
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  unique(workspace_id,user_id)
);
create index calendar_events_workspace_idx on public.calendar_events(workspace_id);
create index calendar_versions_workspace_idx on public.calendar_versions(workspace_id,event_id);
create index calendar_responses_workspace_idx on public.calendar_responses(workspace_id,version_id);
create index calendar_versions_proposer_idx on public.calendar_versions(proposed_by);
create index calendar_responses_author_idx on public.calendar_responses(author_id);
create index calendar_events_creator_idx on public.calendar_events(created_by);
create index calendar_availability_user_idx on public.workspace_availability(user_id);
create index calendar_events_version_idx on public.calendar_events(current_version_id,workspace_id);
do $$ declare t text; begin
  foreach t in array array['calendar_events','calendar_versions','calendar_responses','workspace_availability'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy workspace_read on public.%I for select to authenticated using (private.is_workspace_member(workspace_id))',t);
  end loop;
  foreach t in array array['calendar_events','workspace_availability'] loop
    execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
  end loop;
end $$;

create function private.platum_timezone(zone text) returns text
language plpgsql stable set search_path='' as $$
begin
  perform private.platum_require(zone is not null and exists(select 1 from pg_catalog.pg_timezone_names where name=zone),'INVALID_TIMEZONE');
  return zone;
end $$;
revoke all on function private.platum_timezone(text) from public,anon,authenticated;

-- Existing section choices and their order are preserved; Calendar is appended once.
update public.workspaces set settings=settings||jsonb_build_object('timezone',coalesce(settings->>'timezone','UTC'),
  'modules',case when (settings->'modules') ? 'calendar' then settings->'modules'
    else coalesce(settings->'modules','["home","work","context","materials","forms","files","updates"]'::jsonb)||'["calendar"]'::jsonb end);
alter table public.workspaces alter column settings set default
  '{"accent":"forest","welcome":"","timezone":"UTC","modules":["home","work","calendar","context","materials","forms","files","updates"]}'::jsonb;

create function private.platum_regular_mutate(action text,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid(); operator boolean; sig text; cached private.platum_operations;
  ws public.workspaces; ev public.calendar_events; ver public.calendar_versions; av public.workspace_availability;
  entity uuid; expected bigint; result jsonb; item jsonb; st text; zone text; title text;
  start_time timestamptz; end_time timestamptz; n integer;
begin
  perform private.platum_require(actor is not null and operation is not null,'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=200000);
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  sig:=md5('regular:'||action||w::text||p::text);
  select * into ws from public.workspaces where id=w for update;
  perform private.platum_require(found and private.is_workspace_member(w),'FORBIDDEN');
  operator:=private.is_workspace_operator(w);
  if action in ('workspace.save','calendar.complete') then
    perform private.platum_require(operator,'FORBIDDEN');
  end if;
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then
    perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');
    return cached.result;
  end if;
  entity:=nullif(p->>'id','')::uuid;
  expected:=nullif(p->>'revision','')::bigint;

  if action='workspace.save' then
    perform private.platum_require(ws.revision=expected,'CONFLICT');
    title:=private.platum_text(p,'name',120,true);
    zone:=private.platum_timezone(coalesce(nullif(p->>'timezone',''),ws.settings->>'timezone','UTC'));
    perform private.platum_require(coalesce(p->>'accent','forest') in ('forest','slate','clay'));
    perform private.platum_require(jsonb_typeof(p->'modules')='array' and jsonb_array_length(p->'modules') between 1 and 11 and (p->'modules') ? 'home');
    for item in select value from jsonb_array_elements(p->'modules') loop
      perform private.platum_require(item#>>'{}'=any(array['home','work','context','materials','forms','files','updates','calendar','learning','inspiration','reports']));
    end loop;
    perform private.platum_require((select count(distinct value) from jsonb_array_elements(p->'modules'))=jsonb_array_length(p->'modules'));
    update public.workspaces set name=title,description=private.platum_text(p,'description',5000),
      current_focus=private.platum_text(p,'focus',500),current_phase=private.platum_text(p,'phase',160),
      settings=settings||jsonb_build_object('accent',coalesce(p->>'accent','forest'),'timezone',zone,
        'welcome',private.platum_text(p,'welcome',2000),'modules',p->'modules'),updated_by=actor
      where id=w returning to_jsonb(workspaces.*) into result;
    insert into public.project_context(workspace_id,objective,next_milestone,collaboration,client_visible,updated_by)
    values(w,private.platum_text(p,'objective',5000),private.platum_text(p,'next_step',1000),
      jsonb_build_object('scope',private.platum_text(p,'scope',5000),'roles',private.platum_text(p,'roles',5000),
        'rhythm',private.platum_text(p,'rhythm',2000),'boundaries',private.platum_text(p,'boundaries',3000)),true,actor)
    on conflict(workspace_id) do update set objective=excluded.objective,next_milestone=excluded.next_milestone,
      collaboration=excluded.collaboration,client_visible=true,updated_by=actor;
  elsif action='calendar.propose' then
    title:=private.platum_text(p,'title',160,true);
    zone:=private.platum_timezone(p->>'timezone');
    start_time:=(p->>'starts_at')::timestamptz; end_time:=(p->>'ends_at')::timestamptz;
    perform private.platum_require(isfinite(start_time) and isfinite(end_time) and start_time>=now()-interval '1 day'
      and start_time<now()+interval '5 years' and end_time>start_time and end_time<=start_time+interval '7 days','INVALID_EVENT_TIME');
    if entity is null then
      insert into public.calendar_events(workspace_id,created_by) values(w,actor) returning * into ev;
    else
      select * into ev from public.calendar_events where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');
      perform private.platum_require(ev.revision=expected,'CONFLICT');
      perform private.platum_require(ev.status not in ('cancelled','completed'),'EVENT_CLOSED');
    end if;
    select coalesce(max(number),0)+1 into n from public.calendar_versions where event_id=ev.id;
    insert into public.calendar_versions(workspace_id,event_id,number,title,agenda,location,starts_at,ends_at,timezone,proposed_by,proposed_side)
      values(w,ev.id,n,title,private.platum_text(p,'agenda',10000),private.platum_text(p,'location',2000),start_time,end_time,zone,
        actor,case when operator then 'team' else 'client' end) returning * into ver;
    update public.calendar_events set current_version_id=ver.id,status='proposed',updated_at=now() where id=ev.id returning * into ev;
    result:=jsonb_build_object('event',to_jsonb(ev),'version',to_jsonb(ver));
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible,metadata)
      values(w,actor,'calendar_proposed','calendar',ev.id,'Time proposed: '||title,true,jsonb_build_object('version_id',ver.id));
  elsif action in ('calendar.respond','calendar.cancel','calendar.complete','calendar.comment') then
    select * into ev from public.calendar_events where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');
    perform private.platum_require(ev.revision=expected and ev.current_version_id=(p->>'version_id')::uuid,'CONFLICT');
    select * into ver from public.calendar_versions where id=ev.current_version_id;
    if action='calendar.respond' then
      perform private.platum_require(ev.status='proposed','EVENT_CLOSED');
      perform private.platum_require(ver.proposed_side<>case when operator then 'team' else 'client' end,'OTHER_SIDE_REQUIRED');
      st:=p->>'response';
      perform private.platum_require(st in ('confirmed','declined'));
    elsif action='calendar.cancel' then
      perform private.platum_require(operator or ev.created_by=actor,'FORBIDDEN');
      perform private.platum_require(ev.status not in ('completed','cancelled'),'EVENT_CLOSED'); st:='cancelled';
    elsif action='calendar.complete' then
      perform private.platum_require(ev.status='confirmed' and ver.ends_at<=now(),'EVENT_NOT_FINISHED'); st:='completed';
    else st:='comment'; end if;
    insert into public.calendar_responses(workspace_id,version_id,author_id,response,note)
      values(w,ver.id,actor,st,private.platum_text(p,'note',5000,st in ('declined','cancelled','comment')));
    update public.calendar_events set status=case when st='comment' then status else st end,updated_at=now()
      where id=ev.id returning to_jsonb(calendar_events.*) into result;
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible,metadata)
      values(w,actor,'calendar_response','calendar',ev.id,case when st='comment' then 'Discussed: ' else initcap(st)||': ' end||ver.title,
        true,jsonb_build_object('version_id',ver.id,'response',st));
  elsif action='availability.save' then
    zone:=private.platum_timezone(p->>'timezone');
    perform private.platum_require(jsonb_typeof(p->'weekly')='array' and jsonb_array_length(p->'weekly')<=28
      and jsonb_typeof(p->'unavailable')='array' and jsonb_array_length(p->'unavailable')<=40);
    for item in select value from jsonb_array_elements(p->'weekly') loop
      perform private.platum_require(jsonb_typeof(item)='object' and (item->>'day') ~ '^[0-6]$'
        and (item->>'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and (item->>'end') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and item->>'start'<item->>'end','INVALID_AVAILABILITY');
    end loop;
    for item in select value from jsonb_array_elements(p->'unavailable') loop
      perform private.platum_require((item->>'start') ~ '^\d{4}-\d{2}-\d{2}$' and (item->>'end') ~ '^\d{4}-\d{2}-\d{2}$'
        and (item->>'end')::date>=(item->>'start')::date,'INVALID_AVAILABILITY');
    end loop;
    select * into av from public.workspace_availability where workspace_id=w and user_id=actor for update;
    if found then
      perform private.platum_require(av.revision=expected,'CONFLICT');
      update public.workspace_availability set timezone=zone,weekly=p->'weekly',unavailable=p->'unavailable',
        note=private.platum_text(p,'note',2000),updated_at=now() where id=av.id returning to_jsonb(workspace_availability.*) into result;
    else
      perform private.platum_require(coalesce(expected,0)=0,'CONFLICT');
      insert into public.workspace_availability(workspace_id,user_id,timezone,weekly,unavailable,note)
        values(w,actor,zone,p->'weekly',p->'unavailable',private.platum_text(p,'note',2000)) returning to_jsonb(workspace_availability.*) into result;
    end if;
  else raise exception 'UNKNOWN_ACTION' using errcode='22023'; end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
  return result;
end $$;
create function public.platum_regular_mutate(action text,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_regular_mutate(action,workspace_id,payload,operation_id)
$$;
revoke all on function private.platum_regular_mutate(text,uuid,jsonb,uuid),public.platum_regular_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.platum_regular_mutate(text,uuid,jsonb,uuid),public.platum_regular_mutate(text,uuid,jsonb,uuid) to authenticated;

-- Keep the original projection and add shared scheduling history.
alter function private.platum_export(uuid) rename to platum_export_stage1;
create function private.platum_export(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.platum_export_stage1(w);
  return result||jsonb_build_object('format','platum.workspace.v2',
    'calendar_events',coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_events e where workspace_id=w),'[]'),
    'calendar_versions',coalesce((select jsonb_agg(to_jsonb(v)) from public.calendar_versions v where workspace_id=w),'[]'),
    'calendar_responses',coalesce((select jsonb_agg(to_jsonb(r)) from public.calendar_responses r where workspace_id=w),'[]'),
    'availability',coalesce((select jsonb_agg(to_jsonb(a)) from public.workspace_availability a where workspace_id=w),'[]'));
end $$;
create or replace function public.platum_export(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_export(workspace_id)
$$;
revoke all on function private.platum_export(uuid) from public,anon;
grant execute on function private.platum_export(uuid) to authenticated;
