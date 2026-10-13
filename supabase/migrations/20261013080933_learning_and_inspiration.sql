-- Learning reuses material publication and version-bound discussion. Practice
-- answers and team feedback are separate, explicit records; reading is not completion.
alter table public.tasks add constraint tasks_id_workspace_unique unique(id,workspace_id);
create table public.learning_units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  material_id uuid not null,
  status text not null default 'active' check(status in ('active','archived')),
  revision bigint not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(id,workspace_id),unique(material_id),
  foreign key(material_id,workspace_id) references public.materials(id,workspace_id)
);
create table public.learning_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  unit_id uuid not null,
  material_version_id uuid not null,
  prompt text not null check(char_length(prompt) between 1 and 10000),
  task_id uuid,
  reference_version_id uuid,
  created_at timestamptz not null default now(),
  unique(id,workspace_id),unique(material_version_id),
  foreign key(unit_id,workspace_id) references public.learning_units(id,workspace_id),
  foreign key(material_version_id,workspace_id) references public.material_versions(id,workspace_id),
  foreign key(reference_version_id,workspace_id) references public.material_versions(id,workspace_id),
  foreign key(task_id,workspace_id) references public.tasks(id,workspace_id)
);
create table public.learning_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null,
  author_id uuid not null references auth.users(id),
  attempt integer not null,
  answer text not null default '' check(char_length(answer)<=15000),
  evidence_url text not null default '' check(char_length(evidence_url)<=2000),
  status text not null default 'draft' check(status in ('draft','submitted','reviewed')),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(id,workspace_id),unique(version_id,author_id,attempt),
  foreign key(version_id,workspace_id) references public.learning_versions(id,workspace_id)
);
create unique index learning_one_draft on public.learning_submissions(version_id,author_id) where status='draft';
create table public.learning_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  submission_id uuid not null,
  author_id uuid not null references auth.users(id),
  outcome text not null check(outcome in ('needs_changes','completed')),
  body text not null check(char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key(submission_id,workspace_id) references public.learning_submissions(id,workspace_id)
);
create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  title text not null check(char_length(title) between 1 and 160),
  url text not null default '' check(char_length(url)<=2000),
  note text not null default '' check(char_length(note)<=10000),
  relevance text not null default '' check(char_length(relevance)<=3000),
  tag text not null default '' check(char_length(tag)<=80),
  task_id uuid,
  reference_version_id uuid,
  status text not null default 'draft' check(status in ('draft','shared','archived')),
  shared_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique(id,workspace_id),
  foreign key(task_id,workspace_id) references public.tasks(id,workspace_id),
  foreign key(reference_version_id,workspace_id) references public.material_versions(id,workspace_id)
);
create table public.inspiration_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  item_id uuid not null,
  item_revision bigint not null,
  context_snapshot jsonb not null,
  author_id uuid not null references auth.users(id),
  body text not null check(char_length(body) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key(item_id,workspace_id) references public.inspiration_items(id,workspace_id)
);
create function private.platum_learning_readable(unit uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.learning_units l join public.materials m on m.id=l.material_id
    where l.id=unit and private.is_workspace_member(l.workspace_id)
    and (private.is_workspace_operator(l.workspace_id) or (m.client_visible and m.published_version_id is not null)))
$$;
revoke all on function private.platum_learning_readable(uuid) from public,anon;
grant execute on function private.platum_learning_readable(uuid) to authenticated;
do $$ declare t text; begin
  foreach t in array array['learning_units','learning_versions','learning_submissions','learning_feedback','inspiration_items','inspiration_comments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('alter table public.%I force row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create index %I on public.%I(workspace_id)',t||'_workspace_idx',t);
  end loop;
  foreach t in array array['learning_units','learning_submissions','inspiration_items'] loop
    execute format('create trigger pl_revision before update on public.%I for each row execute function private.platum_revision()',t);
  end loop;
end $$;
create index learning_units_creator_idx on public.learning_units(created_by);
create index learning_versions_unit_idx on public.learning_versions(unit_id,workspace_id);
create index learning_versions_task_idx on public.learning_versions(task_id,workspace_id);
create index learning_versions_reference_idx on public.learning_versions(reference_version_id,workspace_id);
create index learning_submissions_author_idx on public.learning_submissions(author_id);
create index learning_feedback_submission_idx on public.learning_feedback(submission_id,workspace_id);
create index learning_feedback_author_idx on public.learning_feedback(author_id);
create index inspiration_items_creator_idx on public.inspiration_items(created_by);
create index inspiration_items_task_idx on public.inspiration_items(task_id,workspace_id);
create index inspiration_items_reference_idx on public.inspiration_items(reference_version_id,workspace_id);
create index inspiration_comments_item_idx on public.inspiration_comments(item_id,workspace_id);
create index inspiration_comments_author_idx on public.inspiration_comments(author_id);
create policy learning_unit_read on public.learning_units for select to authenticated using(private.platum_learning_readable(id));
create policy learning_version_read on public.learning_versions for select to authenticated
  using(private.platum_learning_readable(unit_id) and private.platum_version_readable(material_version_id));
create policy learning_submission_read on public.learning_submissions for select to authenticated
  using(private.is_workspace_member(workspace_id) and (author_id=(select auth.uid()) or (private.is_workspace_operator(workspace_id) and status<>'draft')));
create policy learning_feedback_read on public.learning_feedback for select to authenticated
  using(private.is_workspace_member(workspace_id) and exists(select 1 from public.learning_submissions s where s.id=submission_id and s.status<>'draft'));
create policy inspiration_item_read on public.inspiration_items for select to authenticated
  using(private.is_workspace_member(workspace_id) and (private.is_workspace_operator(workspace_id) or (status<>'draft' and shared_at is not null)));
create policy inspiration_comment_read on public.inspiration_comments for select to authenticated
  using(private.is_workspace_member(workspace_id) and exists(select 1 from public.inspiration_items i where i.id=item_id and i.shared_at is not null));

create function private.platum_shared_references(w uuid,task uuid,version uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform private.platum_require(private.is_workspace_member(w),'FORBIDDEN');
  perform private.platum_require(task is null or exists(select 1 from public.tasks where id=task and workspace_id=w and client_visible),'INVALID_SHARED_REFERENCE');
  perform private.platum_require(version is null or exists(select 1 from public.material_versions v join public.materials m on m.id=v.material_id
    where v.id=version and v.workspace_id=w and v.published_at is not null and m.client_visible),'INVALID_SHARED_REFERENCE');
end $$;
revoke all on function private.platum_shared_references(uuid,uuid,uuid) from public,anon,authenticated;

create function private.platum_learning_mutate(action text,w uuid,p jsonb,operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor uuid:=auth.uid(); operator boolean; sig text; cached private.platum_operations;
  l public.learning_units; v public.learning_versions; s public.learning_submissions; i public.inspiration_items; m public.materials;
  result jsonb; saved jsonb; entity uuid; expected bigint; task uuid; ref uuid; status text; body text; prompt text; url text; n integer;
begin
  perform private.platum_require(actor is not null and operation is not null,'UNAUTHENTICATED');
  perform private.platum_require(jsonb_typeof(p)='object' and octet_length(p::text)<=200000);
  perform pg_advisory_xact_lock(hashtext(actor::text),hashtext(operation::text));
  perform 1 from public.workspaces where id=w for update;
  perform private.platum_require(found and private.is_workspace_member(w),'FORBIDDEN');
  operator:=private.is_workspace_operator(w);
  if action in ('learning.save','learning.publish','learning.archive','learning.feedback') then perform private.platum_require(operator,'FORBIDDEN'); end if;
  sig:=md5('learning:'||action||w::text||p::text);
  select * into cached from private.platum_operations where actor_id=actor and operation_id=operation;
  if found then perform private.platum_require(cached.signature=sig,'IDEMPOTENCY_CONFLICT');return cached.result;end if;
  entity:=nullif(p->>'id','')::uuid;expected:=nullif(p->>'revision','')::bigint;
  if action='learning.save' then
    if entity is not null then
      select * into l from public.learning_units where id=entity and workspace_id=w for update;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(l.revision=expected,'CONFLICT');
      select * into m from public.materials where id=l.material_id;
      perform private.platum_require(m.revision=(p->>'material_revision')::bigint,'CONFLICT');
    end if;
    body:=private.platum_text(p,'explanation',10000,true);prompt:=private.platum_text(p,'prompt',10000,true);
    task:=nullif(p->>'task_id','')::uuid;ref:=nullif(p->>'reference_version_id','')::uuid;
    perform private.platum_shared_references(w,task,ref);
    saved:=private.platum_mutate('material.save',w,jsonb_build_object('id',m.id,'revision',m.revision,
      'title',private.platum_text(p,'title',160,true),'summary',private.platum_text(p,'summary',3000),
      'blocks',jsonb_build_array(jsonb_build_object('id','explanation','label','Learn','text',body),jsonb_build_object('id','practice','label','Put it into practice','text',prompt)),
      'file_ids',coalesce(p->'file_ids','[]')),gen_random_uuid());
    if l.id is null then
      insert into public.learning_units(workspace_id,material_id,created_by) values(w,(saved->'material'->>'id')::uuid,actor) returning * into l;
    else update public.learning_units set status='active' where id=l.id returning * into l; end if;
    insert into public.learning_versions(workspace_id,unit_id,material_version_id,prompt,task_id,reference_version_id)
      values(w,l.id,(saved->'version'->>'id')::uuid,prompt,task,ref) returning * into v;
    result:=jsonb_build_object('unit',to_jsonb(l),'version',to_jsonb(v),'material',saved->'material');
  elsif action in ('learning.publish','learning.archive') then
    select * into l from public.learning_units where id=entity and workspace_id=w for update;
    perform private.platum_require(found,'NOT_FOUND');perform private.platum_require(l.revision=expected,'CONFLICT');
    if action='learning.publish' then
      select * into v from public.learning_versions where unit_id=l.id and material_version_id=(p->>'version_id')::uuid;
      perform private.platum_require(found,'NOT_FOUND');perform private.platum_shared_references(w,v.task_id,v.reference_version_id);
      saved:=private.platum_mutate('material.publish',w,jsonb_build_object('id',l.material_id,'revision',p->'material_revision','version_id',v.material_version_id),gen_random_uuid());
      update public.learning_units set status='active' where id=l.id returning * into l;
    else update public.learning_units set status='archived' where id=l.id returning * into l; end if;
    result:=to_jsonb(l);
  elsif action='learning.submit' then
    perform private.platum_require(exists(select 1 from public.workspace_members where workspace_id=w and user_id=actor and role='client'),'CLIENT_REVIEW_REQUIRED');
    select * into v from public.learning_versions where id=(p->>'version_id')::uuid and workspace_id=w;
    perform private.platum_require(found,'NOT_FOUND');
    select * into l from public.learning_units where id=v.unit_id;
    select * into m from public.materials where id=l.material_id;
    perform private.platum_require(l.status='active' and m.client_visible and m.published_version_id=v.material_version_id,'CURRENT_VERSION_CHANGED');
    status:=p->>'status';perform private.platum_require(status in ('draft','submitted'));
    body:=private.platum_text(p,'answer',15000,status='submitted');url:=private.platum_text(p,'evidence_url',2000);
    perform private.platum_require(url='' or url ~ '^https?://[^[:space:]]+$','INVALID_URL');
    select * into s from public.learning_submissions where version_id=v.id and author_id=actor and learning_submissions.status='draft' for update;
    if found then
      perform private.platum_require(s.revision=expected and s.id=entity,'CONFLICT');
      update public.learning_submissions set answer=body,evidence_url=url,status=status,
        submitted_at=case when status='submitted' then now() else null end where id=s.id returning * into s;
    else
      perform private.platum_require(entity is null and coalesce(expected,0)=0,'CONFLICT');
      perform private.platum_require(not exists(select 1 from public.learning_submissions where version_id=v.id and author_id=actor and learning_submissions.status='submitted'),'PRACTICE_PENDING');
      select coalesce(max(attempt),0)+1 into n from public.learning_submissions where version_id=v.id and author_id=actor;
      insert into public.learning_submissions(workspace_id,version_id,author_id,attempt,answer,evidence_url,status,submitted_at)
        values(w,v.id,actor,n,body,url,status,case when status='submitted' then now() else null end) returning * into s;
    end if;
    result:=to_jsonb(s)||jsonb_build_object('unit_id',l.id);
  elsif action='learning.feedback' then
    select * into s from public.learning_submissions where id=entity and workspace_id=w for update;
    perform private.platum_require(found and s.status='submitted','PRACTICE_NOT_SUBMITTED');
    perform private.platum_require(s.revision=expected,'CONFLICT');
    status:=p->>'outcome';perform private.platum_require(status in ('needs_changes','completed'));
    insert into public.learning_feedback(workspace_id,submission_id,author_id,outcome,body)
      values(w,s.id,actor,status,private.platum_text(p,'body',10000,true));
    update public.learning_submissions set status='reviewed' where id=s.id returning * into s;
    select * into v from public.learning_versions where id=s.version_id;
    result:=to_jsonb(s)||jsonb_build_object('unit_id',v.unit_id);
  elsif action='inspiration.save' then
    if entity is not null then
      select * into i from public.inspiration_items where id=entity and workspace_id=w for update;
      perform private.platum_require(found and (operator or (i.created_by=actor and i.shared_at is not null)),'FORBIDDEN');
      perform private.platum_require(i.revision=expected,'CONFLICT');
    end if;
    status:=p->>'status';perform private.platum_require(status in ('draft','shared','archived'));
    perform private.platum_require((operator or status<>'draft') and (i.shared_at is null or status<>'draft'),'FORBIDDEN');
    url:=private.platum_text(p,'url',2000);body:=private.platum_text(p,'note',10000);
    perform private.platum_require(url<>'' or body<>'','EMPTY_INSPIRATION');
    perform private.platum_require(url='' or url ~ '^https?://[^[:space:]]+$','INVALID_URL');
    task:=nullif(p->>'task_id','')::uuid;ref:=nullif(p->>'reference_version_id','')::uuid;
    perform private.platum_shared_references(w,task,ref);
    if i.id is null then
      perform private.platum_require(status<>'archived');
      insert into public.inspiration_items(workspace_id,title,url,note,relevance,tag,task_id,reference_version_id,status,shared_at,created_by)
        values(w,private.platum_text(p,'title',160,true),url,body,private.platum_text(p,'relevance',3000),private.platum_text(p,'tag',80),task,ref,status,case when status='shared' then now() else null end,actor) returning * into i;
    else
      update public.inspiration_items set title=private.platum_text(p,'title',160,true),url=url,note=body,
        relevance=private.platum_text(p,'relevance',3000),tag=private.platum_text(p,'tag',80),task_id=task,reference_version_id=ref,
        status=status,shared_at=coalesce(shared_at,case when status='shared' then now() else null end) where id=i.id returning * into i;
    end if;
    result:=to_jsonb(i);
  elsif action='inspiration.comment' then
    select * into i from public.inspiration_items where id=entity and workspace_id=w;
    perform private.platum_require(found and i.shared_at is not null and i.status<>'draft','FORBIDDEN');
    perform private.platum_require(i.revision=expected,'CONFLICT');
    insert into public.inspiration_comments(workspace_id,item_id,item_revision,context_snapshot,author_id,body)
      values(w,i.id,i.revision,jsonb_build_object('title',i.title,'url',i.url,'note',i.note,'relevance',i.relevance),actor,private.platum_text(p,'body',10000,true))
      returning to_jsonb(inspiration_comments.*) into result;
  else raise exception 'UNKNOWN_ACTION' using errcode='22023';end if;
  insert into private.platum_operations(actor_id,operation_id,signature,result) values(actor,operation,sig,result);
  return result;
end $$;
create function public.platum_learning_mutate(action text,workspace_id uuid,payload jsonb,operation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.platum_learning_mutate(action,workspace_id,payload,operation_id) $$;
revoke all on function private.platum_learning_mutate(text,uuid,jsonb,uuid),public.platum_learning_mutate(text,uuid,jsonb,uuid) from public,anon;
grant execute on function private.platum_learning_mutate(text,uuid,jsonb,uuid),public.platum_learning_mutate(text,uuid,jsonb,uuid) to authenticated;

update public.workspaces set settings=jsonb_set(settings,'{modules}',(settings->'modules')||'["learning","inspiration"]'::jsonb);
alter table public.workspaces alter column settings set default
  '{"accent":"forest","welcome":"","timezone":"UTC","modules":["home","work","calendar","learning","inspiration","context","materials","forms","files","updates"]}'::jsonb;

-- A direct material publication must still have a corresponding practice version.
create function private.platum_learning_publication_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare l public.learning_units;v public.learning_versions;
begin
  if new.published_version_id is distinct from old.published_version_id and new.published_version_id is not null then
    select * into l from public.learning_units where material_id=new.id;
    if found then
      select * into v from public.learning_versions where unit_id=l.id and material_version_id=new.published_version_id;
      perform private.platum_require(found,'USE_LEARNING_EDITOR');
      perform private.platum_shared_references(l.workspace_id,v.task_id,v.reference_version_id);
    end if;
  end if;
  return new;
end $$;
revoke all on function private.platum_learning_publication_guard() from public,anon,authenticated;
create trigger learning_publication_guard before update on public.materials for each row execute function private.platum_learning_publication_guard();

alter function private.platum_export(uuid) rename to platum_export_calendar;
create function private.platum_export(w uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=private.platum_export_calendar(w);
  return result||jsonb_build_object(
    'learning_units',coalesce((select jsonb_agg(to_jsonb(l)) from public.learning_units l join public.materials m on m.id=l.material_id where l.workspace_id=w and m.client_visible and m.published_version_id is not null),'[]'),
    'learning_versions',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('lesson',to_jsonb(v))) from public.learning_versions l join public.material_versions v on v.id=l.material_version_id join public.materials m on m.id=v.material_id
      where l.workspace_id=w and m.client_visible and v.published_at is not null),'[]'),
    'learning_submissions',coalesce((select jsonb_agg(to_jsonb(s)) from public.learning_submissions s where workspace_id=w and status<>'draft' and (author_id=auth.uid() or private.is_workspace_operator(w))),'[]'),
    'learning_feedback',coalesce((select jsonb_agg(to_jsonb(f)) from public.learning_feedback f join public.learning_submissions s on s.id=f.submission_id where f.workspace_id=w and s.status<>'draft' and (s.author_id=auth.uid() or private.is_workspace_operator(w))),'[]'),
    'inspiration',coalesce((select jsonb_agg(to_jsonb(i)) from public.inspiration_items i where workspace_id=w and shared_at is not null and status<>'draft'),'[]'),
    'inspiration_comments',coalesce((select jsonb_agg(to_jsonb(c)) from public.inspiration_comments c join public.inspiration_items i on i.id=c.item_id where c.workspace_id=w and i.shared_at is not null and i.status<>'draft'),'[]'));
end $$;
create or replace function public.platum_export(workspace_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.platum_export(workspace_id) $$;
revoke all on function private.platum_export(uuid) from public,anon;
grant execute on function private.platum_export(uuid) to authenticated;
