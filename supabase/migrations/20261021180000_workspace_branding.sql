-- Optional project logo references an already shared file; no accounts, workspaces or files are seeded.
create function private.platum_branding_capabilities() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.platum_require(exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null),'UNAUTHENTICATED');
 return jsonb_build_object('logo',true);
end $$;
create function public.platum_branding_capabilities() returns jsonb language sql security invoker set search_path='' as $$ select private.platum_branding_capabilities() $$;
revoke all on function private.platum_branding_capabilities(),public.platum_branding_capabilities() from public,anon;
grant execute on function private.platum_branding_capabilities(),public.platum_branding_capabilities() to authenticated;

create or replace function private.platum_regular_mutate(action text,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid(); operator boolean; sig text; cached private.platum_operations;
  ws public.workspaces; ev public.calendar_events; ver public.calendar_versions; av public.workspace_availability;
  entity uuid; expected bigint; result jsonb; item jsonb; st text; zone text; title text;
  start_time timestamptz; end_time timestamptz; n integer; logo uuid;
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
    logo:=case when p?'logo_file_id' then nullif(p->>'logo_file_id','')::uuid else nullif(ws.settings->>'logo_file_id','')::uuid end;
    if p?'logo_file_id' and logo is not null then
      perform private.platum_require(exists(select 1 from public.workspace_files
        where id=logo and workspace_id=w and status='ready' and client_visible
        and mime_type in ('image/png','image/jpeg','image/webp')),'INVALID_LOGO');
    end if;
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
        'welcome',private.platum_text(p,'welcome',2000),'modules',p->'modules','logo_file_id',logo),updated_by=actor
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
-- Existing command wrapper, grants and work-calendar behavior are preserved.
