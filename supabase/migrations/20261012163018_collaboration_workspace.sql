-- Stage 1: shared client collaboration. No customer data or account identifiers.
-- New writes enter through authenticated, scoped, idempotent commands.
alter table public.workspaces add column revision bigint not null default 1,
  add column settings jsonb not null default '{"accent":"forest","welcome":"","modules":["home","work","context","materials","forms","files","updates"]}'::jsonb;
alter table public.project_context add column collaboration jsonb not null default '{}'::jsonb;
alter table public.requests add column revision bigint not null default 1,
  add column scope_status text not null default 'needs_clarification'
    check (scope_status in ('included','needs_clarification','reprioritize','separate_agreement')),
  add column owner_id uuid references auth.users(id) on delete set null,
  add column file_ids uuid[] not null default '{}';
alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check
  check(status in ('waiting_team','waiting_client','in_progress','responded','resolved'));
alter table public.tasks add column revision bigint not null default 1,
  add column request_id uuid;
alter table public.tasks add constraint tasks_request_workspace_fk
  foreign key (request_id,workspace_id) references public.requests(id,workspace_id);
alter table public.forms add column revision bigint not null default 1;
alter table public.form_submissions add column revision bigint not null default 1,
  add column form_revision bigint not null default 1,
  add column definition_snapshot jsonb not null default '{}'::jsonb;
create unique index form_submission_revision_user on public.form_submissions(form_id,form_revision,submitted_by) where definition_snapshot<>'{}'::jsonb;
alter table public.materials alter column url drop not null;
alter table public.materials add column revision bigint not null default 1,
  add column published_version_id uuid, add column draft_version_id uuid;
alter table public.materials add constraint materials_id_workspace_unique unique(id,workspace_id);

create table public.material_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  material_id uuid not null,
  number bigint not null,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '' check (char_length(summary)<=3000),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks)='array' and octet_length(blocks::text)<=150000),
  file_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(material_id,number), unique(id,workspace_id),
  foreign key(material_id,workspace_id) references public.materials(id,workspace_id)
);
alter table public.materials add constraint materials_published_version_fk
  foreign key(published_version_id,workspace_id) references public.material_versions(id,workspace_id);
alter table public.materials add constraint materials_draft_version_fk
  foreign key(draft_version_id,workspace_id) references public.material_versions(id,workspace_id);
create table public.material_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null,
  block_id text,
  parent_id uuid,
  body text not null check(char_length(body) between 1 and 10000),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,workspace_id),
  foreign key(version_id,workspace_id) references public.material_versions(id,workspace_id),
  foreign key(parent_id,workspace_id) references public.material_comments(id,workspace_id)
);
create table public.material_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null,
  reviewer_id uuid not null references auth.users(id),
  status text not null check(status in ('approved','changes_requested')),
  note text not null default '' check(char_length(note)<=10000),
  created_at timestamptz not null default now(),
  foreign key(version_id,workspace_id) references public.material_versions(id,workspace_id)
);
create table public.material_reads (
  workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null,
  user_id uuid not null references auth.users(id),
  read_at timestamptz not null default now(),
  primary key(version_id,user_id),
  foreign key(version_id,workspace_id) references public.material_versions(id,workspace_id)
);
create table public.workspace_reads (
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null references auth.users(id),
  updates_seen_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create table public.workspace_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  uploaded_by uuid not null references auth.users(id),
  name text not null check(char_length(name) between 1 and 180),
  path text not null unique,
  mime_type text not null,
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  status text not null default 'pending' check(status in ('pending','ready')),
  client_visible boolean not null default false,
  revision bigint not null default 1,
  created_at timestamptz not null default now()
);
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  email text not null check(email=lower(btrim(email)) and char_length(email)<=254),
  role text not null check(role in ('admin','team','client')),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  mail_status text not null default 'pending' check(mail_status in ('pending','sent','failed','uncertain')),
  mail_attempted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_pending_email on public.workspace_invitations(workspace_id,email) where status='pending';
create table private.platum_operations (
  actor_id uuid not null,
  operation_id uuid not null,
  signature text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,operation_id)
);
revoke all on private.platum_operations from public,anon,authenticated;

create function private.platum_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1; return new; end $$;
do $$ declare t text; begin
  foreach t in array array['workspaces','requests','tasks','forms','form_submissions','materials','workspace_files'] loop
    execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
  end loop;
end $$;

create function private.platum_manager(w uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select actor is not null and exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor and role in ('owner','admin'))
$$;
create function private.platum_version_readable(v uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.material_versions mv join public.materials m on m.id=mv.material_id
    where mv.id=v and private.is_workspace_member(m.workspace_id)
      and (private.is_workspace_operator(m.workspace_id) or (mv.published_at is not null and m.client_visible)))
$$;
create function private.platum_file_readable(f uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.workspace_files wf where wf.id=f and wf.status='ready'
    and private.is_workspace_member(wf.workspace_id)
    and (private.is_workspace_operator(wf.workspace_id) or wf.uploaded_by=auth.uid() or wf.client_visible
      or exists(select 1 from public.material_versions v join public.materials m on m.id=v.material_id
        where f=any(v.file_ids) and v.published_at is not null and m.client_visible)))
$$;
create function private.platum_require(ok boolean, message text default 'INVALID_INPUT')
returns void language plpgsql set search_path='' as $$
begin if ok is distinct from true then raise exception '%',message using errcode='P0001'; end if; end $$;
create function private.platum_text(p jsonb,k text,n integer,required boolean default false)
returns text language plpgsql immutable set search_path='' as $$
declare v text:=btrim(coalesce(p->>k,''));
begin
  if (p ? k and p->k<>'null'::jsonb and jsonb_typeof(p->k)<>'string') or char_length(v)>n or (required and v='') then
    raise exception 'INVALID_INPUT: %',k using errcode='22023';
  end if;
  return v;
end $$;
create function private.platum_files(p jsonb,w uuid) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; f uuid;
begin
  perform private.platum_require(jsonb_typeof(p)='array' and jsonb_array_length(p)<=12);
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p);
  foreach f in array ids loop
    perform private.platum_require(exists(select 1 from public.workspace_files where id=f and workspace_id=w)
      and private.platum_file_readable(f),'FILE_ACCESS_DENIED');
  end loop;
  return ids;
end $$;
revoke all on function private.platum_manager(uuid,uuid),private.platum_version_readable(uuid),
  private.platum_file_readable(uuid),private.platum_require(boolean,text),private.platum_text(jsonb,text,integer,boolean),
  private.platum_files(jsonb,uuid) from public,anon;
grant execute on function private.platum_manager(uuid,uuid),private.platum_version_readable(uuid),
  private.platum_file_readable(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['material_versions','material_comments','material_reviews','material_reads','workspace_reads','workspace_files','workspace_invitations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy material_version_read on public.material_versions for select to authenticated using(private.platum_version_readable(id));
create policy material_comment_read on public.material_comments for select to authenticated using(private.platum_version_readable(version_id));
create policy material_review_read on public.material_reviews for select to authenticated using(private.platum_version_readable(version_id));
create policy material_read_own on public.material_reads for select to authenticated using(user_id=auth.uid() and private.is_workspace_member(workspace_id));
create policy workspace_read_own on public.workspace_reads for select to authenticated using(user_id=auth.uid() and private.is_workspace_member(workspace_id));
create policy workspace_file_read on public.workspace_files for select to authenticated using(private.platum_file_readable(id) or (uploaded_by=auth.uid() and private.is_workspace_member(workspace_id)));
create policy workspace_invitation_read on public.workspace_invitations for select to authenticated using(private.platum_manager(workspace_id));
drop policy form_submissions_select on public.form_submissions;
create policy form_submissions_select on public.form_submissions for select to authenticated
using(private.is_workspace_member(workspace_id) and (submitted_by=auth.uid() or (status<>'draft' and private.is_workspace_operator(workspace_id))));
drop policy request_replies_select on public.request_replies;
create policy request_replies_select on public.request_replies for select to authenticated
using(private.is_workspace_operator(workspace_id) or (client_visible and private.is_workspace_member(workspace_id)
  and exists(select 1 from public.requests q where q.id=request_id and q.workspace_id=request_replies.workspace_id and q.client_visible)));
create index material_versions_workspace on public.material_versions(workspace_id,material_id);
create index material_comments_version on public.material_comments(version_id,created_at);
create index material_reviews_version on public.material_reviews(version_id,created_at);
create index workspace_files_workspace on public.workspace_files(workspace_id,created_at);
create index workspace_invitations_email on public.workspace_invitations(email,status);

-- Prevent old browser CRUD from bypassing optimistic writes in the new workspace.
-- Existing task-status/reply RPCs remain available for older clients.
revoke insert,update,delete on public.workspaces,public.workspace_members,public.project_context,
  public.tasks,public.requests,public.forms,public.form_submissions,public.materials,public.deliverables,public.decisions from authenticated;
grant insert,update on public.tasks,public.requests to authenticated;
create function private.platum_client_request_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if not private.is_workspace_operator(new.workspace_id) then
    perform private.platum_require(new.scope_status='needs_clarification' and new.owner_id is null and cardinality(new.file_ids)=0,'FORBIDDEN');
  end if;
  return new;
end $$;
create trigger pl_request_guard before insert on public.requests for each row execute function private.platum_client_request_guard();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('platum-workspace-files','platum-workspace-files',false,10485760,
  array['application/pdf','text/plain','text/markdown','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy platum_file_upload on storage.objects for insert to authenticated
with check(bucket_id='platum-workspace-files' and exists(select 1 from public.workspace_files f
  where f.path=storage.objects.name and f.uploaded_by=auth.uid() and f.status='pending' and private.is_workspace_member(f.workspace_id)));
create policy platum_file_download on storage.objects for select to authenticated
using(bucket_id='platum-workspace-files' and exists(select 1 from public.workspace_files f where f.path=storage.objects.name and private.platum_file_readable(f.id)));
-- No update/upsert policy: immutable paths cannot replace accepted material bytes.

create function private.platum_mutate(action text,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid(); operator boolean; manager boolean; sig text; cached private.platum_operations;
  result jsonb; entity uuid; version uuid; r public.requests; t public.tasks; m public.materials;
  mv public.material_versions; f public.forms; s public.form_submissions; wf public.workspace_files;
  ws public.workspaces; item jsonb; fld jsonb; answer jsonb; answers jsonb; ids uuid[];
  title text; body text; status text; role_name text; expected bigint; n integer; nm text;
begin
  perform private.platum_require(actor is not null and operation is not null,'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=200000);
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  sig:=md5(action||w::text||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then
    perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');
    perform private.platum_require(private.is_workspace_member(w),'FORBIDDEN');
    if action in ('workspace.save','request.triage','task.save','material.save','material.publish','material.archive','form.save','form.review','update.publish','decision.record','file.share') then
      perform private.platum_require(private.is_workspace_operator(w),'FORBIDDEN');
    end if;
    return cached.result;
  end if;
  select * into ws from public.workspaces where id=w for update;
  perform private.platum_require(found and private.is_workspace_member(w),'FORBIDDEN');
  operator:=private.is_workspace_operator(w); manager:=private.platum_manager(w);
  entity:=nullif(p->>'id','')::uuid;
  expected:=nullif(p->>'revision','')::bigint;

  if action='workspace.save' then
    perform private.platum_require(operator,'FORBIDDEN');
    perform private.platum_require(ws.revision=expected,'CONFLICT');
    title:=private.platum_text(p,'name',120,true);
    perform private.platum_require(coalesce(p->>'accent','forest') in ('forest','slate','clay'));
    perform private.platum_require(jsonb_typeof(p->'modules')='array' and jsonb_array_length(p->'modules') between 1 and 7 and (p->'modules') ? 'home');
    for item in select value from jsonb_array_elements(p->'modules') loop
      perform private.platum_require(item#>>'{}'=any(array['home','work','context','materials','forms','files','updates']));
    end loop;
    perform private.platum_require((select count(distinct value) from jsonb_array_elements(p->'modules'))=jsonb_array_length(p->'modules'));
    update public.workspaces set name=title,description=private.platum_text(p,'description',5000),
      current_focus=private.platum_text(p,'focus',500),current_phase=private.platum_text(p,'phase',160),
      settings=jsonb_build_object('accent',coalesce(p->>'accent','forest'),'welcome',private.platum_text(p,'welcome',2000),'modules',p->'modules'),
      updated_by=actor where id=w returning * into ws;
    insert into public.project_context(workspace_id,objective,next_milestone,collaboration,client_visible,updated_by)
    values(w,private.platum_text(p,'objective',5000),private.platum_text(p,'next_step',1000),
      jsonb_build_object('scope',private.platum_text(p,'scope',5000),'roles',private.platum_text(p,'roles',5000),
        'rhythm',private.platum_text(p,'rhythm',2000),'boundaries',private.platum_text(p,'boundaries',3000)),true,actor)
    on conflict(workspace_id) do update set objective=excluded.objective,next_milestone=excluded.next_milestone,
      collaboration=excluded.collaboration,client_visible=true,updated_by=actor;
    result:=to_jsonb(ws);
  elsif action='request.create' then
    ids:=private.platum_files(coalesce(p->'file_ids','[]'),w);
    insert into public.requests(workspace_id,created_by,topic,title,message,status,client_visible)
      values(w,actor,coalesce(nullif(private.platum_text(p,'topic',80),''),'General'),
        coalesce(nullif(private.platum_text(p,'title',160),''),'Project request'),
        private.platum_text(p,'message',5000,true),'waiting_team',true) returning * into r;
    if cardinality(ids)>0 then
      update public.workspace_files set client_visible=true where id=any(ids) and workspace_id=w;
      update public.requests set file_ids=ids where id=r.id returning * into r;
    end if;
    result:=to_jsonb(r);
  elsif action='request.triage' then
    perform private.platum_require(operator,'FORBIDDEN');
    select * into r from public.requests where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');
    perform private.platum_require(r.revision=expected,'CONFLICT');
    perform private.platum_require(p->>'scope_status'=any(array['included','needs_clarification','reprioritize','separate_agreement']));
    perform private.platum_require(p->>'status'=any(array['waiting_team','waiting_client','in_progress','responded','resolved']));
    version:=nullif(p->>'owner_id','')::uuid;
    perform private.platum_require(version is null or exists(select 1 from public.workspace_members where workspace_id=w and user_id=version and role in ('owner','admin','team')),'INVALID_ASSIGNEE');
    update public.requests set scope_status=p->>'scope_status',status=p->>'status',owner_id=version where id=entity returning * into r;
    result:=to_jsonb(r);
  elsif action='request.reply' then
    select * into r from public.requests where id=entity and workspace_id=w for update;
    perform private.platum_require(found and (operator or r.client_visible),'FORBIDDEN');
    insert into public.request_replies(request_id,workspace_id,author_id,body,client_visible)
      values(entity,w,actor,private.platum_text(p,'body',5000,true),r.client_visible) returning to_jsonb(request_replies.*) into result;
    update public.requests set status=case when operator then 'waiting_client' else 'waiting_team' end,responded_at=case when operator then now() else responded_at end where id=entity;
  elsif action='task.save' then
    perform private.platum_require(operator,'FORBIDDEN');
    if entity is not null then
      select * into t from public.tasks where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');
      perform private.platum_require(t.revision=expected,'CONFLICT');
    end if;
    perform private.platum_require(p->>'status'=any(array['open','in_progress','waiting','review','completed','cancelled']));
    perform private.platum_require(p->>'priority'=any(array['low','medium','high']));
    perform private.platum_require(p->>'assignee_kind'=any(array['client','team']));
    version:=nullif(p->>'assignee_user_id','')::uuid;
    perform private.platum_require(version is null or exists(select 1 from public.workspace_members where workspace_id=w and user_id=version
      and ((p->>'assignee_kind'='client' and role='client') or (p->>'assignee_kind'='team' and role in ('owner','admin','team')))),'INVALID_ASSIGNEE');
    if nullif(p->>'request_id','') is not null then
      perform private.platum_require(exists(select 1 from public.requests where id=(p->>'request_id')::uuid and workspace_id=w),'INVALID_REQUEST');
    end if;
    if entity is null then
      insert into public.tasks(workspace_id,title,description,status,priority,assignee_kind,assignee_user_id,due_at,request_id,client_visible,created_by,updated_by)
      values(w,private.platum_text(p,'title',160,true),private.platum_text(p,'description',5000),p->>'status',p->>'priority',
        p->>'assignee_kind',version,nullif(p->>'due_at','')::date,nullif(p->>'request_id','')::uuid,
        coalesce((p->>'client_visible')::boolean,true),actor,actor) returning * into t;
    else
      update public.tasks set title=private.platum_text(p,'title',160,true),description=private.platum_text(p,'description',5000),
        status=p->>'status',priority=p->>'priority',assignee_kind=p->>'assignee_kind',assignee_user_id=version,
        due_at=nullif(p->>'due_at','')::date,request_id=nullif(p->>'request_id','')::uuid,
        client_visible=coalesce((p->>'client_visible')::boolean,true),updated_by=actor where id=entity returning * into t;
    end if;
    result:=to_jsonb(t);
  elsif action='task.complete' then
    select * into t from public.tasks where id=entity and workspace_id=w for update;
    perform private.platum_require(found and (operator or (t.client_visible and t.assignee_kind='client' and (t.assignee_user_id is null or t.assignee_user_id=actor))),'FORBIDDEN');
    perform private.platum_require(t.revision=expected,'CONFLICT');
    perform private.platum_require(p->>'status' in ('open','completed'));
    update public.tasks set status=p->>'status',completed_at=case when p->>'status'='completed' then now() else null end,updated_by=actor where id=entity returning * into t;
    result:=to_jsonb(t);
  elsif action='material.save' then
    perform private.platum_require(operator,'FORBIDDEN');
    title:=private.platum_text(p,'title',160,true);
    perform private.platum_require(jsonb_typeof(p->'blocks')='array' and jsonb_array_length(p->'blocks') between 1 and 40);
    for item in select value from jsonb_array_elements(p->'blocks') loop
      perform private.platum_require(item->>'id' ~ '^[a-zA-Z0-9_-]{1,80}$');
      perform private.platum_text(item,'label',160,true);
      perform private.platum_text(item,'text',10000);
      body:=private.platum_text(item,'url',2000);
      perform private.platum_require(body='' or body ~ '^https?://[^[:space:]]+$','INVALID_URL');
    end loop;
    perform private.platum_require((select count(distinct value->>'id') from jsonb_array_elements(p->'blocks'))=jsonb_array_length(p->'blocks'),'DUPLICATE_BLOCK');
    ids:=private.platum_files(coalesce(p->'file_ids','[]'),w);
    if entity is null then
      insert into public.materials(workspace_id,title,kind,status,url,client_visible,created_by) values(w,title,'document','draft',null,false,actor) returning * into m;
    else
      select * into m from public.materials where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');
      perform private.platum_require(m.revision=expected,'CONFLICT');
    end if;
    select coalesce(max(number),0)+1 into n from public.material_versions where material_id=m.id;
    insert into public.material_versions(workspace_id,material_id,number,title,summary,blocks,file_ids,created_by)
      values(w,m.id,n,title,private.platum_text(p,'summary',3000),p->'blocks',ids,actor) returning * into mv;
    update public.materials set draft_version_id=mv.id where id=m.id returning * into m;
    result:=jsonb_build_object('material',to_jsonb(m),'version',to_jsonb(mv));
  elsif action in ('material.publish','material.archive') then
    perform private.platum_require(operator,'FORBIDDEN');
    select * into m from public.materials where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');
    perform private.platum_require(m.revision=expected,'CONFLICT');
    if action='material.archive' then
      update public.materials set client_visible=false,status='archived' where id=entity returning * into m;
    else
      version:=(p->>'version_id')::uuid;
      select * into mv from public.material_versions where id=version and material_id=entity and workspace_id=w;
      perform private.platum_require(found and m.draft_version_id=version and mv.published_at is null,'CONFLICT');
      perform private.platum_require(cardinality(mv.file_ids)>0 or exists(select 1 from jsonb_array_elements(mv.blocks) b where btrim(coalesce(b->>'text',''))<>'' or coalesce(b->>'url','')<>''),'EMPTY_MATERIAL');
      update public.material_versions set published_at=now() where id=version returning * into mv;
      update public.materials set published_version_id=version,draft_version_id=null,title=mv.title,description=mv.summary,
        client_visible=true,status='ready',published_at=now() where id=entity returning * into m;
      insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible,metadata)
        values(w,actor,'material_published','material',m.id,'Published: '||mv.title,true,jsonb_build_object('version_id',version));
    end if;
    result:=to_jsonb(m);
  elsif action in ('material.comment','material.review','material.read') then
    version:=(p->>'version_id')::uuid;
    select * into mv from public.material_versions where id=version and workspace_id=w;
    perform private.platum_require(found and private.platum_version_readable(version),'FORBIDDEN');
    if action='material.comment' then
      nm:=nullif(private.platum_text(p,'block_id',80),'');
      perform private.platum_require(nm is null or exists(select 1 from jsonb_array_elements(mv.blocks) b where b->>'id'=nm),'INVALID_BLOCK');
      entity:=nullif(p->>'parent_id','')::uuid;
      perform private.platum_require(entity is null or exists(select 1 from public.material_comments where id=entity and version_id=version and block_id is not distinct from nm),'INVALID_THREAD');
      insert into public.material_comments(workspace_id,version_id,block_id,parent_id,body,author_id)
        values(w,version,nm,entity,private.platum_text(p,'body',10000,true),actor) returning to_jsonb(material_comments.*) into result;
    elsif action='material.review' then
      perform private.platum_require(exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor and role='client'),'CLIENT_REVIEW_REQUIRED');
      perform private.platum_require(exists(select 1 from public.materials where id=mv.material_id and published_version_id=version),'CURRENT_VERSION_CHANGED');
      status:=p->>'status';
      perform private.platum_require(status in ('approved','changes_requested'));
      body:=private.platum_text(p,'note',10000,status='changes_requested');
      insert into public.material_reviews(workspace_id,version_id,reviewer_id,status,note)
        values(w,version,actor,status,body) returning to_jsonb(material_reviews.*) into result;
      insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible,metadata)
        values(w,actor,'material_reviewed','material',mv.material_id,case when status='approved' then 'Approved: ' else 'Changes requested: ' end||mv.title,true,jsonb_build_object('version_id',version,'status',status));
    else
      insert into public.material_reads(workspace_id,version_id,user_id) values(w,version,actor)
        on conflict(version_id,user_id) do update set read_at=now();
      result:=jsonb_build_object('version_id',version,'read',true);
    end if;
  elsif action='form.save' then
    perform private.platum_require(operator,'FORBIDDEN');
    perform private.platum_require(p->>'status' in ('draft','active','closed'));
    perform private.platum_require(jsonb_typeof(p->'fields')='array' and jsonb_array_length(p->'fields') between 1 and 25);
    for fld in select value from jsonb_array_elements(p->'fields') loop
      perform private.platum_require(fld->>'id' ~ '^[a-zA-Z0-9_-]{1,80}$');
      perform private.platum_text(fld,'label',250,true);
      perform private.platum_text(fld,'help',1500);
      perform private.platum_require(fld->>'type' in ('text','textarea','url','select','boolean'));
      perform private.platum_require(jsonb_typeof(fld->'required')='boolean');
      if fld->>'type'='select' then
        perform private.platum_require(jsonb_typeof(fld->'options')='array' and jsonb_array_length(fld->'options') between 1 and 20);
        for item in select value from jsonb_array_elements(fld->'options') loop
          perform private.platum_require(jsonb_typeof(item)='string' and char_length(item#>>'{}') between 1 and 160);
        end loop;
      end if;
    end loop;
    perform private.platum_require((select count(distinct value->>'id') from jsonb_array_elements(p->'fields'))=jsonb_array_length(p->'fields'),'DUPLICATE_FIELD');
    if entity is null then
      insert into public.forms(workspace_id,title,description,definition,status,client_visible,created_by,updated_by)
        values(w,private.platum_text(p,'title',160,true),private.platum_text(p,'description',5000),
          jsonb_build_object('fields',p->'fields'),p->>'status',p->>'status'<>'draft',actor,actor) returning * into f;
    else
      select * into f from public.forms where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');
      perform private.platum_require(f.revision=expected,'CONFLICT');
      update public.forms set title=private.platum_text(p,'title',160,true),description=private.platum_text(p,'description',5000),
        definition=jsonb_build_object('fields',p->'fields'),status=p->>'status',client_visible=p->>'status'<>'draft',updated_by=actor
        where id=entity returning * into f;
    end if;
    result:=to_jsonb(f);
  elsif action='form.submit' then
    select * into f from public.forms where id=entity and workspace_id=w for update;
    perform private.platum_require(found and f.status='active' and f.client_visible,'FORM_UNAVAILABLE');
    perform private.platum_require(jsonb_typeof(f.definition->'fields')='array' and jsonb_array_length(f.definition->'fields')>0,'FORM_UNAVAILABLE');
    perform private.platum_require(f.revision=(p->>'form_revision')::bigint,'FORM_CHANGED');
    status:=p->>'status'; answers:=p->'answers';
    perform private.platum_require(status in ('draft','submitted') and jsonb_typeof(answers)='object' and octet_length(answers::text)<=100000);
    for nm in select jsonb_object_keys(answers) loop
      perform private.platum_require(exists(select 1 from jsonb_array_elements(f.definition->'fields') x where x->>'id'=nm),'UNKNOWN_FIELD');
    end loop;
    for fld in select value from jsonb_array_elements(f.definition->'fields') loop
      answer:=answers->(fld->>'id');
      if status='submitted' and (fld->>'required')::boolean then
        perform private.platum_require(answer is not null and answer<>'null'::jsonb and answer<>'""'::jsonb,'REQUIRED_ANSWER');
      end if;
      if answer is null or answer='null'::jsonb or answer='""'::jsonb then continue; end if;
      if fld->>'type'='boolean' then
        perform private.platum_require(jsonb_typeof(answer)='boolean','INVALID_ANSWER');
      else
        perform private.platum_require(jsonb_typeof(answer)='string' and char_length(answer#>>'{}')<=10000,'INVALID_ANSWER');
        if fld->>'type'='select' then perform private.platum_require((fld->'options') @> jsonb_build_array(answer),'INVALID_ANSWER'); end if;
        if fld->>'type'='url' then perform private.platum_require(answer#>>'{}' ~ '^https?://[^[:space:]]+$','INVALID_URL'); end if;
      end if;
    end loop;
    select * into s from public.form_submissions where form_id=entity and form_revision=f.revision and submitted_by=actor and definition_snapshot<>'{}'::jsonb for update;
    if found then
      perform private.platum_require(s.status='draft','ALREADY_SUBMITTED');
      perform private.platum_require(s.revision=expected,'CONFLICT');
      update public.form_submissions set answers=answers,status=status,submitted_at=case when status='submitted' then now() else null end
        where id=s.id returning * into s;
    else
      perform private.platum_require(expected is null or expected=0,'CONFLICT');
      insert into public.form_submissions(form_id,workspace_id,submitted_by,answers,status,submitted_at,form_revision,definition_snapshot)
        values(entity,w,actor,answers,status,case when status='submitted' then now() else null end,f.revision,f.definition)
        returning * into s;
    end if;
    result:=to_jsonb(s);
  elsif action='form.review' then
    perform private.platum_require(operator,'FORBIDDEN');
    select * into s from public.form_submissions where id=entity and workspace_id=w for update;
    perform private.platum_require(found and s.status='submitted','NOT_FOUND');
    perform private.platum_require(s.revision=expected,'CONFLICT');
    update public.form_submissions set status='reviewed',reviewed_by=actor,reviewed_at=now() where id=entity returning * into s;
    result:=to_jsonb(s);
  elsif action='update.publish' then
    title:=private.platum_text(p,'title',160,true); body:=private.platum_text(p,'body',10000,true);
    perform private.platum_require(operator,'FORBIDDEN');
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible,metadata)
      values(w,actor,'update_published','workspace',w,title,true,jsonb_build_object('body',body))
      returning to_jsonb(activity.*) into result;
  elsif action='decision.record' then
    perform private.platum_require(operator,'FORBIDDEN');
    insert into public.decisions(workspace_id,title,context,decision,status,client_visible,created_by,updated_by)
      values(w,private.platum_text(p,'title',160,true),private.platum_text(p,'context',5000),
        private.platum_text(p,'decision',10000,true),'recorded',true,actor,actor) returning to_jsonb(decisions.*) into result;
  elsif action='updates.read' then
    insert into public.workspace_reads(workspace_id,user_id) values(w,actor)
      on conflict(workspace_id,user_id) do update set updates_seen_at=now();
    result:=jsonb_build_object('read',true);
  elsif action='file.reserve' then
    title:=private.platum_text(p,'name',180,true);
    perform private.platum_require(title !~ '[/\\[:cntrl:]]','INVALID_FILENAME');
    status:=p->>'mime_type';
    perform private.platum_require(status=any(array['application/pdf','text/plain','text/markdown','image/jpeg','image/png','image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),'UNSUPPORTED_FILE');
    n:=(p->>'size_bytes')::integer;
    perform private.platum_require(n between 1 and 10485760,'FILE_TOO_LARGE');
    entity:=gen_random_uuid();
    insert into public.workspace_files(id,workspace_id,uploaded_by,name,path,mime_type,size_bytes,client_visible)
      values(entity,w,actor,title,w::text||'/'||entity::text||'/file',status,n,
        case when operator then coalesce((p->>'client_visible')::boolean,false) else true end) returning * into wf;
    result:=to_jsonb(wf);
  elsif action='file.finish' then
    select * into wf from public.workspace_files where id=entity and workspace_id=w for update;
    perform private.platum_require(found and wf.uploaded_by=actor,'FORBIDDEN');
    perform private.platum_require(exists(select 1 from storage.objects where bucket_id='platum-workspace-files' and name=wf.path
      and (metadata->>'size')::bigint=wf.size_bytes and metadata->>'mimetype'=wf.mime_type),'UPLOAD_NOT_COMPLETE');
    update public.workspace_files set status='ready' where id=entity returning * into wf;
    result:=to_jsonb(wf);
  elsif action='file.share' then
    perform private.platum_require(operator,'FORBIDDEN');
    select * into wf from public.workspace_files where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');
    perform private.platum_require(wf.revision=expected,'CONFLICT');
    update public.workspace_files set client_visible=true where id=entity returning * into wf;
    result:=to_jsonb(wf);
  else
    raise exception 'UNKNOWN_ACTION' using errcode='22023';
  end if;
  if action in ('task.save','task.complete') then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'task_updated','task',t.id,'Task '||replace(t.status,'_',' ')||': '||t.title,t.client_visible);
  elsif action='form.submit' and s.status='submitted' then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'form_submitted','form',f.id,'Response submitted: '||f.title,true);
  elsif action='form.save' and f.client_visible then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'form_published','form',f.id,'Questionnaire updated: '||f.title,true);
  elsif action='workspace.save' then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'context_updated','workspace',w,'Our agreement was updated.',true);
  elsif action='request.triage' then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'request_updated','request',r.id,'Request updated: '||r.title,r.client_visible);
  elsif action='decision.record' then
    insert into public.activity(workspace_id,actor_id,event_type,entity_type,entity_id,summary,client_visible)
      values(w,actor,'decision_recorded','decision',(result->>'id')::uuid,'Decision recorded: '||(result->>'title'),true);
  end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
  return result;
end $$;

create function public.platum_mutate(action text,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_mutate(action,workspace_id,payload,operation_id)
$$;
revoke all on function private.platum_mutate(text,uuid,jsonb,uuid),public.platum_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.platum_mutate(text,uuid,jsonb,uuid),public.platum_mutate(text,uuid,jsonb,uuid) to authenticated;
grant execute on function private.platum_require(boolean,text) to authenticated;

create function private.platum_service_command(action text,actor uuid,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  sig text; cached private.platum_operations; result jsonb; ws public.workspaces;
  inv public.workspace_invitations; entity uuid; email_value text; role_value text; actor_role text; target_role text; delivery_claimed boolean;
begin
  perform private.platum_require(actor is not null and operation is not null and exists(select 1 from auth.users where id=actor),'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<20000);
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  sig:=md5(action||coalesce(w::text,'new')||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then
    perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');
    if w is not null then perform private.platum_require(private.platum_manager(w,actor),'FORBIDDEN'); end if;
    return cached.result;
  end if;
  if action='workspace.create' then
    -- This entrypoint is SERVICE ROLE ONLY. The HTTP boundary checks the
    -- bootstrap allowlist / existing manager membership before calling it.
    entity:=gen_random_uuid();
    insert into public.workspaces(id,slug,name,created_by,updated_by)
      values(entity,'workspace-'||entity::text,private.platum_text(p,'name',120,true),actor,actor) returning * into ws;
    insert into public.workspace_members(workspace_id,user_id,role,created_by) values(entity,actor,'owner',actor);
    insert into public.project_context(workspace_id,client_visible,updated_by) values(entity,true,actor);
    result:=to_jsonb(ws);
  else
    perform 1 from public.workspaces where id=w for update;
    perform private.platum_require(found and private.platum_manager(w,actor),'FORBIDDEN');
    select role into actor_role from public.workspace_members where workspace_id=w and user_id=actor;
    entity:=nullif(p->>'id','')::uuid;
    if action='invitation.create' then
      email_value:=lower(private.platum_text(p,'email',254,true)); role_value:=p->>'role';
      perform private.platum_require(email_value ~ '^[^ @]+@[^ @]+[.][^ @]+$','INVALID_EMAIL');
      perform private.platum_require(role_value in ('client','team','admin') and (role_value<>'admin' or actor_role='owner'),'FORBIDDEN_ROLE');
      select * into inv from public.workspace_invitations where workspace_id=w and email=email_value and status='pending';
      if not found then
        perform private.platum_require((select count(*) from public.workspace_invitations where invited_by=actor and created_at>now()-interval '10 minutes')<10,'INVITATION_RATE_LIMIT');
        insert into public.workspace_invitations(workspace_id,email,role,invited_by) values(w,email_value,role_value,actor) returning * into inv;
      else
        perform private.platum_require(inv.role=role_value,'INVITATION_EXISTS_WITH_DIFFERENT_ROLE');
      end if;
      result:=to_jsonb(inv);
    elsif action='invitation.resend' then
      select * into inv from public.workspace_invitations where id=entity and workspace_id=w for update;
      perform private.platum_require(found and inv.status='pending','INVITATION_UNAVAILABLE');
      perform private.platum_require(inv.role<>'admin' or actor_role='owner','FORBIDDEN_ROLE');
      perform private.platum_require(inv.mail_attempted_at is null or inv.mail_attempted_at<now()-interval '60 seconds','INVITATION_RATE_LIMIT');
      update public.workspace_invitations set expires_at=now()+interval '7 days',mail_status='pending',mail_attempted_at=null,invited_by=actor where id=entity returning * into inv;
      result:=to_jsonb(inv);
    elsif action='invitation.claim_delivery' then
      update public.workspace_invitations set mail_status='uncertain',mail_attempted_at=now()
        where id=entity and workspace_id=w and status='pending' and mail_status='pending' and mail_attempted_at is null returning * into inv;
      delivery_claimed:=found;
      if not delivery_claimed then select * into inv from public.workspace_invitations where id=entity and workspace_id=w; end if;
      result:=jsonb_build_object('send',delivery_claimed,'invitation',to_jsonb(inv));
    elsif action='invitation.delivery_result' then
      perform private.platum_require(p->>'mail_status' in ('sent','failed','uncertain'));
      update public.workspace_invitations set mail_status=p->>'mail_status'
        where id=entity and workspace_id=w and status='pending' returning * into inv;
      result:=to_jsonb(inv);
    elsif action='invitation.revoke' then
      select * into inv from public.workspace_invitations where id=entity and workspace_id=w for update;
      perform private.platum_require(found and inv.status='pending','INVITATION_UNAVAILABLE');
      perform private.platum_require(inv.role<>'admin' or actor_role='owner','FORBIDDEN_ROLE');
      update public.workspace_invitations set status='revoked' where id=entity returning * into inv;
      result:=to_jsonb(inv);
    elsif action='member.revoke' then
      select role into target_role from public.workspace_members where workspace_id=w and user_id=entity for update;
      perform private.platum_require(found,'MEMBER_NOT_FOUND');
      perform private.platum_require(actor_role='owner' or (target_role in ('client','team')),'FORBIDDEN_ROLE');
      perform private.platum_require(target_role<>'owner' or (select count(*) from public.workspace_members where workspace_id=w and role='owner')>1,'LAST_OWNER');
      delete from public.workspace_members where workspace_id=w and user_id=entity;
      update public.workspace_invitations set status='revoked' where workspace_id=w and status='pending'
        and email=(select lower(email) from auth.users where id=entity);
      result:=jsonb_build_object('revoked',entity);
    else raise exception 'UNKNOWN_ACTION' using errcode='22023';
    end if;
  end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,coalesce(result,'{}'));
  return result;
end $$;
create function public.platum_service_command(action text,actor_id uuid,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_service_command(action,actor_id,workspace_id,payload,operation_id)
$$;
revoke all on function private.platum_service_command(text,uuid,uuid,jsonb,uuid),public.platum_service_command(text,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.platum_service_command(text,uuid,uuid,jsonb,uuid),public.platum_service_command(text,uuid,uuid,jsonb,uuid) to service_role;

create function private.platum_accept_invitations() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); address text; candidate public.workspace_invitations; inv public.workspace_invitations; accepted integer:=0;
begin
  perform private.platum_require(actor is not null,'UNAUTHENTICATED');
  select lower(email) into address from auth.users where id=actor and email_confirmed_at is not null;
  if address is null then return jsonb_build_object('accepted',0); end if;
  for candidate in select * from public.workspace_invitations where email=address and status='pending' and expires_at>now() order by workspace_id,id loop
    perform 1 from public.workspaces where id=candidate.workspace_id for update;
    select * into inv from public.workspace_invitations where id=candidate.id and status='pending' and expires_at>now() for update;
    if found and private.platum_manager(inv.workspace_id,inv.invited_by) then
      insert into public.workspace_members(workspace_id,user_id,role,created_by) values(inv.workspace_id,actor,inv.role,inv.invited_by)
        on conflict(workspace_id,user_id) do update set role=case when workspace_members.role='owner' then 'owner' else excluded.role end;
      update public.workspace_invitations set status='accepted',accepted_by=actor,accepted_at=now() where id=inv.id;
      accepted:=accepted+1;
    end if;
  end loop;
  return jsonb_build_object('accepted',accepted);
end $$;
create function public.platum_accept_invitations() returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_accept_invitations()
$$;
revoke all on function private.platum_accept_invitations(),public.platum_accept_invitations() from public,anon;
grant execute on function private.platum_accept_invitations(),public.platum_accept_invitations() to authenticated;

create function private.platum_members(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.platum_require(private.is_workspace_member(w),'FORBIDDEN');
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,
    'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),initcap(m.role)),
    'email',case when private.platum_manager(w) then u.email else null end) order by m.created_at),'[]')
  into result from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=w;
  return result;
end $$;
create function public.platum_members(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_members(workspace_id)
$$;
revoke all on function private.platum_members(uuid),public.platum_members(uuid) from public,anon;
grant execute on function private.platum_members(uuid),public.platum_members(uuid) to authenticated;

-- Export is deliberately a client-visible projection, even for an operator.
create function private.platum_export(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.platum_require(private.is_workspace_member(w),'FORBIDDEN');
  select jsonb_build_object('format','platum.workspace.v1','exported_at',now(),
    'workspace',(select jsonb_build_object('name',name,'description',description,'focus',current_focus,'phase',current_phase,'settings',settings) from public.workspaces where id=w),
    'context',(select to_jsonb(c)-'created_by'-'updated_by' from public.project_context c where workspace_id=w and client_visible),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t)) from public.tasks t where workspace_id=w and client_visible),'[]'),
    'requests',coalesce((select jsonb_agg(to_jsonb(r)) from public.requests r where workspace_id=w and client_visible),'[]'),
    'replies',coalesce((select jsonb_agg(to_jsonb(r)) from public.request_replies r where workspace_id=w and client_visible
      and exists(select 1 from public.requests q where q.id=r.request_id and q.client_visible)),'[]'),
    'materials',coalesce((select jsonb_agg(to_jsonb(v)) from public.material_versions v join public.materials m on m.published_version_id=v.id where m.workspace_id=w and m.client_visible),'[]'),
    'references',coalesce((select jsonb_agg(to_jsonb(m)-'draft_version_id') from public.materials m where workspace_id=w and client_visible and published_version_id is null),'[]'),
    'deliverables',coalesce((select jsonb_agg(to_jsonb(d)) from public.deliverables d where workspace_id=w and client_visible),'[]'),
    'decisions',coalesce((select jsonb_agg(to_jsonb(d)) from public.decisions d where workspace_id=w and client_visible),'[]'),
    'activity',coalesce((select jsonb_agg(to_jsonb(a)) from public.activity a where workspace_id=w and client_visible),'[]'),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r)) from public.material_reviews r join public.material_versions v on v.id=r.version_id join public.materials m on m.id=v.material_id
      where r.workspace_id=w and m.client_visible and v.published_at is not null),'[]'),
    'comments',coalesce((select jsonb_agg(to_jsonb(c)) from public.material_comments c join public.material_versions v on v.id=c.version_id join public.materials m on m.id=v.material_id
      where c.workspace_id=w and m.client_visible and v.published_at is not null),'[]'),
    'submissions',coalesce((select jsonb_agg(to_jsonb(s)) from public.form_submissions s where workspace_id=w and status in ('submitted','reviewed')
      and (submitted_by=auth.uid() or private.is_workspace_operator(w))),'[]'),
    'files',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'mime_type',mime_type,'size_bytes',size_bytes)) from public.workspace_files f
      where workspace_id=w and status='ready' and (client_visible or exists(select 1 from public.material_versions v join public.materials m on m.id=v.material_id
        where f.id=any(v.file_ids) and v.published_at is not null and m.client_visible))),'[]')
  ) into result;
  return result;
end $$;
create function public.platum_export(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$
  select private.platum_export(workspace_id)
$$;
revoke all on function private.platum_export(uuid),public.platum_export(uuid) from public,anon;
grant execute on function private.platum_export(uuid),public.platum_export(uuid) to authenticated;

-- Preserve the legacy RPC interfaces while using the same scoped write rules.
create or replace function public.respond_to_request(target_request_id uuid,response_body text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare w uuid; result jsonb;
begin
  select workspace_id into w from public.requests where id=target_request_id;
  if w is null or not private.is_workspace_operator(w) then
    raise exception 'Workspace operator access required.' using errcode='42501';
  end if;
  result:=private.platum_mutate('request.reply',w,jsonb_build_object('id',target_request_id,'body',response_body),gen_random_uuid());
  return (result->>'id')::uuid;
end $$;
create or replace function public.set_client_task_status(target_task_id uuid,target_status text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.tasks; result jsonb;
begin
  select * into t from public.tasks where id=target_task_id and client_visible and assignee_kind='client'
    and (assignee_user_id is null or assignee_user_id=auth.uid());
  if not found or not private.is_workspace_member(t.workspace_id) then
    raise exception 'Client task access required.' using errcode='42501';
  end if;
  result:=private.platum_mutate('task.complete',t.workspace_id,jsonb_build_object('id',t.id,'revision',t.revision,'status',target_status),gen_random_uuid());
  return (result->>'id')::uuid;
end $$;
