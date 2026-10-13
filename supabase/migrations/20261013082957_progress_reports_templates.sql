-- Progress records describe real work; reports freeze their sources at publication.
create table public.work_milestones (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  title text not null check(char_length(title) between 1 and 160),description text not null default '',
  due_at date,status text not null default 'planned' check(status in ('planned','in_progress','completed','archived')),
  task_ids uuid[] not null default '{}',result_version_ids uuid[] not null default '{}',completion_note text not null default '',
  completed_at timestamptz,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  revision bigint not null default 1,unique(id,workspace_id)
);
create table public.milestone_history (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  milestone_id uuid not null,actor_id uuid not null references auth.users(id),snapshot jsonb not null,
  created_at timestamptz not null default now(),foreign key(milestone_id,workspace_id) references public.work_milestones(id,workspace_id)
);
create table public.period_reports (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  title text not null,starts_on date not null,ends_on date not null,timezone text not null,
  summary text not null default '',outcomes text not null default '',blockers text not null default '',next_step text not null default '',
  metrics jsonb not null default '[]',result_version_ids uuid[] not null default '{}',milestone_ids uuid[] not null default '{}',
  material_id uuid,revision bigint not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  check(ends_on>=starts_on and ends_on-starts_on<=365),unique(id,workspace_id),
  foreign key(material_id,workspace_id) references public.materials(id,workspace_id)
);
create table public.report_publications (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  report_id uuid not null,material_version_id uuid not null,snapshot jsonb not null,
  published_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  foreign key(report_id,workspace_id) references public.period_reports(id,workspace_id),
  foreign key(material_version_id,workspace_id) references public.material_versions(id,workspace_id)
);
create table public.workspace_templates (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  name text not null check(char_length(name) between 1 and 120),description text not null default '',
  definition jsonb not null check(jsonb_typeof(definition)='object' and octet_length(definition::text)<=180000),
  revision bigint not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  unique(id,workspace_id)
);
create table public.template_applications (
  id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
  template_id uuid not null,template_revision bigint not null,template_name text not null,
  applied_by uuid not null references auth.users(id),created_records jsonb not null,configuration_applied boolean not null,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['work_milestones','milestone_history','period_reports','report_publications','workspace_templates','template_applications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create index %I on public.%I(workspace_id)',t||'_workspace_idx',t);
  end loop;
  foreach t in array array['work_milestones','period_reports','workspace_templates'] loop
    execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
  end loop;
  foreach t in array array['period_reports','workspace_templates','template_applications'] loop
    execute format('create policy team_read on public.%I for select to authenticated using(private.is_workspace_operator(workspace_id))',t);
  end loop;
end $$;
create policy milestone_read on public.work_milestones for select to authenticated using(private.is_workspace_member(workspace_id));
create policy milestone_history_read on public.milestone_history for select to authenticated using(private.is_workspace_member(workspace_id));
create policy report_publication_read on public.report_publications for select to authenticated using(private.platum_version_readable(material_version_id));
create index milestone_history_parent_idx on public.milestone_history(milestone_id,workspace_id);
create index milestone_history_actor_idx on public.milestone_history(actor_id);
create index milestone_creator_idx on public.work_milestones(created_by);
create index report_material_idx on public.period_reports(material_id,workspace_id);
create index report_creator_idx on public.period_reports(created_by);
create index report_publication_parent_idx on public.report_publications(report_id,workspace_id);
create index report_publication_version_idx on public.report_publications(material_version_id,workspace_id);
create index report_publication_author_idx on public.report_publications(published_by);
create index template_creator_idx on public.workspace_templates(created_by);
create index template_application_author_idx on public.template_applications(applied_by);

-- Record future transitions only. Existing tasks with no completion timestamp
-- remain unknown; a report must not invent a completion date for them.
create function private.platum_task_completion_time() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status<>'completed' then new.completed_at:=null;
  elsif tg_op='INSERT' then new.completed_at:=now();
  elsif old.status<>'completed' then new.completed_at:=now();
  else new.completed_at:=old.completed_at;end if;
  return new;
end $$;
revoke all on function private.platum_task_completion_time() from public,anon,authenticated;
create trigger task_completion_time before insert or update on public.tasks for each row execute function private.platum_task_completion_time();

create function private.platum_progress_refs(w uuid,p jsonb,k text,kind text) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare ids uuid[];item uuid;
begin
  perform private.platum_require(private.is_workspace_member(w),'FORBIDDEN');
  perform private.platum_require(jsonb_typeof(coalesce(p->k,'[]'))='array' and jsonb_array_length(coalesce(p->k,'[]'))<=24);
  select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p->k,'[]'));
  foreach item in array ids loop
    if kind='task' then perform private.platum_shared_references(w,item,null);
    elsif kind='result' then perform private.platum_shared_references(w,null,item);
    else perform private.platum_require(exists(select 1 from public.work_milestones where id=item and workspace_id=w),'INVALID_SHARED_REFERENCE');end if;
  end loop;
  return ids;
end $$;
revoke all on function private.platum_progress_refs(uuid,jsonb,text,text) from public,anon,authenticated;

-- Templates are explicitly authored reusable text. No memberships, client answers,
-- files, project record IDs or history are captured from a source workspace.
create function private.platum_template_definition(p jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare c jsonb:=p->'configuration';item jsonb;fld jsonb;clean jsonb;items jsonb:='[]';fields jsonb;configuration jsonb:='{}';k text;
begin
  perform private.platum_require(jsonb_typeof(c)='object' and jsonb_typeof(p->'items')='array' and jsonb_array_length(p->'items')<=20);
  foreach k in array array['welcome','objective','scope','roles','rhythm','boundaries','next_step','focus','phase'] loop
    configuration:=configuration||jsonb_build_object(k,private.platum_text(c,k,case when k='welcome' then 2000 when k='next_step' then 1000 when k='focus' then 500 when k='phase' then 160 when k='rhythm' then 2000 when k='boundaries' then 3000 else 5000 end));
  end loop;
  perform private.platum_require(c->>'accent' in ('forest','slate','clay'));
  perform private.platum_timezone(c->>'timezone');
  perform private.platum_require(jsonb_typeof(c->'modules')='array' and jsonb_array_length(c->'modules') between 1 and 11 and (c->'modules')?'home');
  for item in select value from jsonb_array_elements(c->'modules') loop
    perform private.platum_require(item#>>'{}'=any(array['home','work','context','materials','forms','files','updates','calendar','learning','inspiration','reports']));
  end loop;
  perform private.platum_require((select count(distinct value) from jsonb_array_elements(c->'modules'))=jsonb_array_length(c->'modules'));
  configuration:=configuration||jsonb_build_object('accent',c->>'accent','timezone',c->>'timezone','modules',c->'modules');
  for item in select value from jsonb_array_elements(p->'items') loop
    perform private.platum_require(item->>'kind' in ('material','form','learning'));
    clean:=jsonb_build_object('kind',item->>'kind','title',private.platum_text(item,'title',160,true),'summary',private.platum_text(item,'summary',3000));
    if item->>'kind' in ('material','learning') then
      clean:=clean||jsonb_build_object('body',private.platum_text(item,'body',10000,true),'next_step',private.platum_text(item,'next_step',10000,item->>'kind'='learning'));
    else
      perform private.platum_require(jsonb_typeof(item->'fields')='array' and jsonb_array_length(item->'fields') between 1 and 25);
      fields:='[]';
      for fld in select value from jsonb_array_elements(item->'fields') loop
        perform private.platum_require(fld->>'type' in ('text','textarea','url','select','boolean') and jsonb_typeof(fld->'required')='boolean');
        perform private.platum_require(jsonb_typeof(coalesce(fld->'options','[]'))='array' and jsonb_array_length(coalesce(fld->'options','[]'))<=20);
        if fld->>'type'='select' then perform private.platum_require(jsonb_array_length(fld->'options')>0);end if;
        perform private.platum_require(not exists(select 1 from jsonb_array_elements(coalesce(fld->'options','[]')) x where jsonb_typeof(x)<>'string' or char_length(x#>>'{}') not between 1 and 160));
        fields:=fields||jsonb_build_array(jsonb_build_object('label',private.platum_text(fld,'label',250,true),'help',private.platum_text(fld,'help',1500),
          'type',fld->>'type','required',fld->'required','options',coalesce(fld->'options','[]')));
      end loop;
      clean:=clean||jsonb_build_object('fields',fields);
    end if;
    items:=items||jsonb_build_array(clean);
  end loop;
  return jsonb_build_object('configuration',configuration,'items',items);
end $$;
revoke all on function private.platum_template_definition(jsonb) from public,anon,authenticated;

create function private.platum_progress_mutate(action text,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid();sig text;cached private.platum_operations;ws public.workspaces;
  milestone public.work_milestones;r public.period_reports;template public.workspace_templates;m public.materials;
  entity uuid;expected bigint;result jsonb;saved jsonb;item jsonb;metric jsonb;metrics jsonb:='[]';snapshot jsonb;blocks jsonb;
  tasks uuid[];refs uuid[];milestones uuid[];task_snapshot jsonb;result_snapshot jsonb;milestone_snapshot jsonb;
  title text;status text;body text;start_day date;end_day date;zone text;from_time timestamptz;until_time timestamptz;
  definition jsonb;configuration jsonb;fields jsonb;fld jsonb;created jsonb:='[]';apply_config boolean;
begin
  perform private.platum_require(actor is not null and operation is not null,'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=200000);
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  if action='template.apply' then
    select * into template from public.workspace_templates where id=(p->>'template_id')::uuid;
    perform private.platum_require(found and private.is_workspace_operator(template.workspace_id),'FORBIDDEN');
    -- Lock both spaces in the same order for applications in either direction.
    perform 1 from public.workspaces where id in (w,template.workspace_id) order by id for update;
  end if;
  select * into ws from public.workspaces where id=w for update;
  perform private.platum_require(found and private.is_workspace_operator(w),'FORBIDDEN');
  sig:=md5('progress:'||action||w::text||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');return cached.result;end if;
  entity:=nullif(p->>'id','')::uuid;expected:=nullif(p->>'revision','')::bigint;
  if action='milestone.save' then
    if entity is not null then
      select * into milestone from public.work_milestones where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(milestone.revision=expected,'CONFLICT');
    end if;
    status:=p->>'status';perform private.platum_require(status in ('planned','in_progress','completed','archived'));
    title:=private.platum_text(p,'title',160,true);body:=private.platum_text(p,'completion_note',5000,status='completed');
    tasks:=private.platum_progress_refs(w,p,'task_ids','task');refs:=private.platum_progress_refs(w,p,'result_version_ids','result');
    if status='completed' then perform private.platum_require(not exists(select 1 from public.tasks t where t.id=any(tasks) and t.status<>'completed'),'MILESTONE_TASKS_OPEN');end if;
    if milestone.id is null then
      insert into public.work_milestones(workspace_id,title,description,due_at,status,task_ids,result_version_ids,completion_note,completed_at,created_by)
        values(w,title,private.platum_text(p,'description',5000),nullif(p->>'due_at','')::date,status,tasks,refs,body,case when status='completed' then now() else null end,actor) returning * into milestone;
    else
      update public.work_milestones set title=title,description=private.platum_text(p,'description',5000),due_at=nullif(p->>'due_at','')::date,
        status=status,task_ids=tasks,result_version_ids=refs,completion_note=body,completed_at=case when status='completed' then coalesce(completed_at,now()) else null end where id=entity returning * into milestone;
    end if;
    insert into public.milestone_history(workspace_id,milestone_id,actor_id,snapshot) values(w,milestone.id,actor,to_jsonb(milestone));result:=to_jsonb(milestone);
  elsif action='report.save' then
    if entity is not null then
      select * into r from public.period_reports where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(r.revision=expected,'CONFLICT');
    end if;
    title:=private.platum_text(p,'title',160,true);start_day:=(p->>'starts_on')::date;end_day:=(p->>'ends_on')::date;
    zone:=private.platum_timezone(p->>'timezone');
    perform private.platum_require(isfinite(start_day) and isfinite(end_day) and end_day>=start_day and end_day-start_day<=365,'INVALID_REPORT_PERIOD');
    refs:=private.platum_progress_refs(w,p,'result_version_ids','result');milestones:=private.platum_progress_refs(w,p,'milestone_ids','milestone');
    perform private.platum_require(jsonb_typeof(p->'metrics')='array' and jsonb_array_length(p->'metrics')<=12);
    for metric in select value from jsonb_array_elements(p->'metrics') loop
      perform private.platum_require(jsonb_typeof(metric->'verified')='boolean');
      body:=private.platum_text(metric,'source_url',2000);perform private.platum_require(body='' or body ~ '^https?://[^[:space:]]+$','INVALID_URL');
      perform private.platum_require(isfinite((metric->>'observed_on')::date) and (metric->>'observed_on')::date<=current_date,'INVALID_METRIC_DATE');
      metrics:=metrics||jsonb_build_array(jsonb_build_object('name',private.platum_text(metric,'name',120,true),'value',private.platum_text(metric,'value',80,true),
        'unit',private.platum_text(metric,'unit',80),'source',private.platum_text(metric,'source',2000,true),'source_url',body,'observed_on',metric->>'observed_on','verified',metric->'verified'));
    end loop;
    if r.id is null then
      insert into public.period_reports(workspace_id,title,starts_on,ends_on,timezone,summary,outcomes,blockers,next_step,metrics,result_version_ids,milestone_ids,created_by)
        values(w,title,start_day,end_day,zone,private.platum_text(p,'summary',3000),private.platum_text(p,'outcomes',10000),private.platum_text(p,'blockers',10000),private.platum_text(p,'next_step',10000),metrics,refs,milestones,actor) returning * into r;
    else
      update public.period_reports set title=title,starts_on=start_day,ends_on=end_day,timezone=zone,summary=private.platum_text(p,'summary',3000),outcomes=private.platum_text(p,'outcomes',10000),
        blockers=private.platum_text(p,'blockers',10000),next_step=private.platum_text(p,'next_step',10000),metrics=metrics,result_version_ids=refs,milestone_ids=milestones where id=r.id returning * into r;
    end if;
    result:=to_jsonb(r);
  elsif action='report.publish' then
    select * into r from public.period_reports where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(r.revision=expected,'CONFLICT');
    perform private.platum_require(r.outcomes<>'' and r.next_step<>'','REPORT_INCOMPLETE');
    perform private.platum_require(not exists(select 1 from jsonb_array_elements(r.metrics) x where x->'verified'<>'true'::jsonb),'METRICS_UNVERIFIED');
    perform private.platum_progress_refs(w,jsonb_build_object('ids',to_jsonb(r.result_version_ids)),'ids','result');
    from_time:=r.starts_on::timestamp at time zone r.timezone;until_time:=(r.ends_on+1)::timestamp at time zone r.timezone;
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'completed_at',t.completed_at)),'[]') into task_snapshot from public.tasks t where t.workspace_id=w and t.client_visible and t.status='completed' and t.completed_at>=from_time and t.completed_at<until_time;
    select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'material_id',v.material_id,'title',v.title,'number',v.number,'published_at',v.published_at)),'[]') into result_snapshot from public.material_versions v where v.id=any(r.result_version_ids);
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into milestone_snapshot from public.work_milestones x where workspace_id=w and id=any(r.milestone_ids);
    snapshot:=to_jsonb(r)-'revision'-'created_by'-'created_at'-'material_id'||jsonb_build_object('recorded_at',now(),'completed_tasks',task_snapshot,'results',result_snapshot,'milestones',milestone_snapshot);
    blocks:=jsonb_build_array(jsonb_build_object('id','period','label','Reporting period','text',r.starts_on||' – '||r.ends_on||' · '||r.timezone),
      jsonb_build_object('id','outcomes','label','What changed','text',r.outcomes),jsonb_build_object('id','blockers','label','Dependencies and blockers','text',r.blockers),
      jsonb_build_object('id','next','label','Next agreed action','text',r.next_step),jsonb_build_object('id','tasks','label','Completed tasks in this period','text',jsonb_array_length(task_snapshot)||' completed tasks with recorded dates. Open the report for its full saved task list.'),
      jsonb_build_object('id','results','label','Selected results','text',coalesce((select string_agg((x->>'title')||' · version '||(x->>'number'),E'\n') from jsonb_array_elements(result_snapshot) x),'No result versions selected.')));
    for metric in select value from jsonb_array_elements(r.metrics) loop
      blocks:=blocks||jsonb_build_array(jsonb_build_object('id','metric_'||jsonb_array_length(blocks),'label',metric->>'name',
        'text',(metric->>'value')||' '||(metric->>'unit')||E'\nSource: '||(metric->>'source')||E'\nObserved: '||(metric->>'observed_on'),'url',metric->>'source_url'));
    end loop;
    if r.material_id is not null then select * into m from public.materials where id=r.material_id;end if;
    saved:=private.platum_mutate('material.save',w,jsonb_build_object('id',m.id,'revision',m.revision,'title',r.title,'summary',r.summary,'blocks',blocks,'file_ids','[]'::jsonb),gen_random_uuid());
    update public.period_reports set material_id=(saved->'material'->>'id')::uuid where id=r.id returning * into r;
    insert into public.report_publications(workspace_id,report_id,material_version_id,snapshot,published_by)
      values(w,r.id,(saved->'version'->>'id')::uuid,snapshot,actor) returning to_jsonb(report_publications.*) into result;
    perform private.platum_mutate('material.publish',w,jsonb_build_object('id',saved->'material'->>'id','revision',saved->'material'->'revision','version_id',saved->'version'->>'id'),gen_random_uuid());
  elsif action='template.save' then
    if entity is not null then
      select * into template from public.workspace_templates where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(template.revision=expected,'CONFLICT');
    end if;
    definition:=private.platum_template_definition(p->'definition');
    if template.id is null then
      insert into public.workspace_templates(workspace_id,name,description,definition,created_by)
        values(w,private.platum_text(p,'name',120,true),private.platum_text(p,'description',5000),definition,actor) returning * into template;
    else update public.workspace_templates set name=private.platum_text(p,'name',120,true),description=private.platum_text(p,'description',5000),definition=definition where id=template.id returning * into template;end if;
    result:=to_jsonb(template);
  elsif action='template.apply' then
    select * into template from public.workspace_templates where id=(p->>'template_id')::uuid for update;
    perform private.platum_require(private.is_workspace_operator(template.workspace_id),'FORBIDDEN');
    perform private.platum_require(template.revision=(p->>'template_revision')::bigint,'CONFLICT');
    apply_config:=coalesce((p->>'apply_configuration')::boolean,false);configuration:=template.definition->'configuration';
    if apply_config then
      perform private.platum_regular_mutate('workspace.save',w,configuration||jsonb_build_object('revision',p->'workspace_revision','name',ws.name,'description',ws.description),gen_random_uuid());
    end if;
    for item in select value from jsonb_array_elements(template.definition->'items') loop
      if item->>'kind'='material' then
        saved:=private.platum_mutate('material.save',w,jsonb_build_object('title',item->>'title','summary',item->>'summary','file_ids','[]'::jsonb,
          'blocks',jsonb_build_array(jsonb_build_object('id','context','label','Context','text',item->>'body'),jsonb_build_object('id','next','label','Next step','text',item->>'next_step'))),gen_random_uuid());
        created:=created||jsonb_build_array(jsonb_build_object('kind','material','id',saved->'material'->>'id','title',item->>'title'));
      elsif item->>'kind'='learning' then
        saved:=private.platum_learning_mutate('learning.save',w,jsonb_build_object('title',item->>'title','summary',item->>'summary','explanation',item->>'body','prompt',item->>'next_step','file_ids','[]'::jsonb),gen_random_uuid());
        created:=created||jsonb_build_array(jsonb_build_object('kind','learning','id',saved->'unit'->>'id','title',item->>'title'));
      else
        fields:='[]';for fld in select value from jsonb_array_elements(item->'fields') loop fields:=fields||jsonb_build_array(fld||jsonb_build_object('id','q_'||gen_random_uuid()));end loop;
        saved:=private.platum_mutate('form.save',w,jsonb_build_object('title',item->>'title','description',item->>'summary','status','draft','fields',fields),gen_random_uuid());
        created:=created||jsonb_build_array(jsonb_build_object('kind','form','id',saved->>'id','title',item->>'title'));
      end if;
    end loop;
    insert into public.template_applications(workspace_id,template_id,template_revision,template_name,applied_by,created_records,configuration_applied)
      values(w,template.id,template.revision,template.name,actor,created,apply_config) returning to_jsonb(template_applications.*) into result;
  else raise exception 'UNKNOWN_ACTION' using errcode='22023';end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
  return result;
end $$;
create function public.platum_progress_mutate(action text,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_progress_mutate(action,workspace_id,payload,operation_id) $$;
revoke all on function private.platum_progress_mutate(text,uuid,jsonb,uuid),public.platum_progress_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.platum_progress_mutate(text,uuid,jsonb,uuid),public.platum_progress_mutate(text,uuid,jsonb,uuid) to authenticated;

create function private.platum_report_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.published_version_id is distinct from old.published_version_id and new.published_version_id is not null
    and exists(select 1 from public.period_reports where material_id=new.id) then
    perform private.platum_require(exists(select 1 from public.report_publications p join public.period_reports r on r.id=p.report_id
      where r.material_id=new.id and p.material_version_id=new.published_version_id),'USE_REPORT_EDITOR');
  end if;
  return new;
end $$;
revoke all on function private.platum_report_publication_guard() from public,anon,authenticated;
create trigger report_publication_guard before update on public.materials for each row execute function private.platum_report_publication_guard();

update public.workspaces set settings=jsonb_set(settings,'{modules}',(settings->'modules')||'["reports"]'::jsonb);
alter table public.workspaces alter column settings set default
  '{"accent":"forest","welcome":"","timezone":"UTC","modules":["home","work","calendar","learning","inspiration","reports","context","materials","forms","files","updates"]}'::jsonb;

alter function private.platum_export(uuid) rename to platum_export_learning;
create function private.platum_export(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  return private.platum_export_learning(w)||jsonb_build_object(
    'milestones',coalesce((select jsonb_agg(to_jsonb(m)) from public.work_milestones m where workspace_id=w),'[]'),
    'milestone_history',coalesce((select jsonb_agg(to_jsonb(h)) from public.milestone_history h where workspace_id=w),'[]'),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.report_publications r join public.material_versions v on v.id=r.material_version_id join public.materials m on m.id=v.material_id where r.workspace_id=w and m.client_visible and v.published_at is not null),'[]'));
end $$;
create or replace function public.platum_export(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.platum_export(workspace_id) $$;
revoke all on function private.platum_export(uuid) from public,anon;
grant execute on function private.platum_export(uuid) to authenticated;
