(() => {
  'use strict';
  window.PLATUM_LEARNING_UI = function (ui) {
    const {state,escape:esc,heading,button,field,select,formFoot,person,date,uiText,uiOptions,textNode,i18n,operator,user,badge,empty,paragraphs,link,external,edit,render,filesPicker}=ui;
    const data=()=>state.data;
    let tag='';
    const material=unit=>data().materials.find(m=>m.id===unit.material_id);
    const content=unit=>{const m=material(unit);return data().material_versions.find(v=>v.id===(operator()?m?.draft_version_id||m?.published_version_id:m?.published_version_id));};
    const learningVersion=v=>data().learning_versions.find(l=>l.material_version_id===v?.id);
    const latestFeedback=sub=>data().learning_feedback.filter(f=>f.submission_id===sub.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    const latestAttempt=v=>data().learning_submissions.filter(s=>s.version_id===v?.id&&s.author_id===user()).sort((a,b)=>b.attempt-a.attempt)[0];
    const outcome=sub=>!sub?'Ready to try':sub.status==='draft'?'Private draft':sub.status==='submitted'?'Waiting for feedback':latestFeedback(sub)?.outcome==='completed'?'Practice completed':'Try again with feedback';
    function referencesEditor(item) {
      const versions=data().material_versions.filter(v=>v.published_at&&data().materials.some(m=>m.id===v.material_id&&m.client_visible));
      return '<div class="ws-form-grid">'+select(uiText('Related task'),'task_id',uiOptions([['',uiText('No task linked')],...data().tasks.filter(t=>t.client_visible).map(t=>[t.id,t.title])]),item.task_id||'')+
        select(uiText('Related published material'),'reference_version_id',uiOptions([['',uiText('No material linked')],...versions.map(v=>[v.id,uiText('{title} · version {number}',{title:v.title,number:v.number})])]),item.reference_version_id||'')+'</div>';
    }
    function references(item) {
      const task=data().tasks.find(t=>t.id===item.task_id),v=data().material_versions.find(v=>v.id===item.reference_version_id);
      return task||v?'<div class="ws-related"><h3><span data-i18n-key="In this work">In this work</span></h3>'+(task?'<p>'+link('work',task.title)+'</p>':'')+(v?'<p><a href="#material/'+v.material_id+'/'+v.id+'">'+esc(v.title)+' · '+i18n.mark('version')+' '+v.number+'</a></p>':'')+'</div>':'';
    }
    function learningView() {
      return heading(uiText('Learning & practice'),uiText('Short explanations connected to the work you are doing now.'),operator()?button('learning-new',uiText('Create a practice'),'','ws-button ws-primary'):'')+
        (data().learning_units.length?data().learning_units.map(unit=>{const v=content(unit),lv=learningVersion(v);if(!v)return '';const sub=latestAttempt(lv);
          return '<article class="ws-material-row"><div><div class="ws-meta">'+badge(uiText(unit.status==='archived'?'Archived':v.published_at?'Published':'Internal draft'))+(!operator()&&v.published_at?badge(uiText(outcome(sub))):'')+'</div><h2>'+link('lesson',v.title,unit.id)+'</h2><p>'+esc(v.summary)+'</p>'+references(lv||{})+'</div><span class="ws-meta"><span data-i18n-key="Version">Version</span> '+v.number+'</span></article>';}).join(''):empty(uiText('Learn something you can use'),uiText('The team will add short explanations and practical actions for this project.')));
    }
    function submissionHistory(unit,lv) {
      const versions=data().learning_versions.filter(v=>v.unit_id===unit.id),ids=versions.map(v=>v.id);
      return data().learning_submissions.filter(s=>ids.includes(s.version_id)&&(operator()||s.author_id===user())).sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(s=>{
        const v=versions.find(v=>v.id===s.version_id),mv=data().material_versions.find(m=>m.id===v?.material_version_id),feedback=latestFeedback(s);
        return '<article class="ws-practice-attempt"><div class="ws-meta">'+person(s.author_id)+' · '+i18n.mark('attempt')+' '+s.attempt+' · '+i18n.mark('lesson version')+' '+(mv?.number||i18n.mark('unavailable'))+' · '+badge(uiText(outcome(s)))+'</div>'+
          (s.version_id!==lv?.id&&mv?'<p><a href="#material/'+unit.material_id+'/'+mv.id+'" data-i18n-key="Read the lesson for this attempt">Read the lesson for this attempt</a></p>':'')+paragraphs(s.answer)+(s.evidence_url?'<p>'+external(s.evidence_url,uiText('Practice evidence'))+'</p>':'')+
          (feedback?'<div class="ws-practice-feedback"><h3><span data-i18n-key="Team feedback">Team feedback</span></h3>'+paragraphs(feedback.body)+'<p class="ws-meta">'+person(feedback.author_id)+' · '+date(feedback.created_at)+'</p></div>':'')+
          (operator()&&s.status==='submitted'?'<form class="ws-form" data-form="learning-feedback" data-id="'+s.id+'" data-revision="'+s.revision+'">'+select(uiText('Practice outcome'),'outcome',uiOptions([['needs_changes',uiText('Needs another attempt')],['completed',uiText('Practice completed')]]),'needs_changes')+field(uiText('Your feedback'),'body','',{required:true,multiline:true,max:10000,help:uiText('Explain what worked and the next useful step.')})+formFoot(uiText('Send feedback'))+'</form>':'')+'</article>';
      }).join('');
    }
    function lessonView() {
      const unit=data().learning_units.find(l=>l.id===state.detail),m=unit&&material(unit),v=unit&&content(unit),lv=learningVersion(v);
      if(!v||!lv)return heading(uiText('Practice unavailable'))+empty(uiText('This practice is not available'),uiText('Return to Learning or ask the team about access.'));
      const sub=latestAttempt(lv),draft=sub?.status==='draft'?sub:null,canAnswer=!operator()&&v.published_at&&unit.status==='active'&&sub?.status!=='submitted';
      return heading(v.title,v.summary,operator()?button('learning-edit',uiText('Edit practice'),'data-id="'+unit.id+'"')+(m.draft_version_id?button('learning-publish',uiText('Publish practice'),'data-id="'+unit.id+'"','ws-button ws-primary'):'')+(unit.status==='active'?button('learning-archive',uiText('Archive practice'),'data-id="'+unit.id+'"','ws-button ws-quiet'):''):'')+
        '<div class="ws-meta">'+badge(uiText(v.published_at?'Published':'Internal draft'))+badge(uiText(unit.status))+'<span><span data-i18n-key="Lesson version">Lesson version</span> '+v.number+'</span></div>'+
        '<article class="ws-reading ws-learning-content"><h2><span data-i18n-key="Learn">Learn</span></h2>'+paragraphs(v.blocks.find(b=>b.id==='explanation')?.text||'')+references(lv)+'<h2><span data-i18n-key="Put it into practice">Put it into practice</span></h2>'+paragraphs(lv.prompt)+'<p><a href="#material/'+m.id+'/'+v.id+'" data-i18n-key="Open this lesson’s files and discussion">Open this lesson’s files and discussion</a></p>'+
        (canAnswer?'<form class="ws-form" data-form="learning-answer" data-id="'+(draft?.id||'')+'" data-version="'+lv.id+'" data-revision="'+(draft?.revision||0)+'">'+field(uiText('Your practice response'),'answer',draft?.answer,{multiline:true,max:15000,help:uiText('A saved draft is private. Submit when you are ready for the team to review.')})+field(uiText('Evidence link (optional)'),'evidence_url',draft?.evidence_url,{type:'url',max:2000})+
          formFoot(uiText('Submit practice'),'<button type="submit" class="ws-button" name="save" value="draft" formnovalidate><span data-i18n-key="Save private draft">Save private draft</span></button>')+'</form>':sub?.status==='submitted'?'<p role="status"><span data-i18n-key="Your response is with the team. You can make another attempt after receiving feedback.">Your response is with the team. You can make another attempt after receiving feedback.</span></p>':'')+
        '<section class="ws-section"><h2><span data-i18n-key="Practice and feedback history">Practice and feedback history</span></h2>'+(submissionHistory(unit,lv)||'<p><span data-i18n-key="No practice responses yet.">No practice responses yet.</span></p>')+'</section></article>';
    }
    function inspirationView() {
      const items=data().inspiration_items,filtered=tag?items.filter(i=>i.tag===tag):items;
      return heading(uiText('Inspiration'),uiText('Collect examples and explain what makes them useful for this project.'),button('inspiration-new',uiText('Add inspiration'),'','ws-button ws-primary'))+
        '<div class="ws-actions ws-inspiration-filters">'+button('inspiration-filter',uiText('All'),'data-tag="" aria-pressed="'+(!tag)+'"','ws-button ws-quiet')+[...new Set(items.map(i=>i.tag).filter(Boolean))].sort().map(t=>button('inspiration-filter',t,'data-tag="'+esc(t)+'" aria-pressed="'+(tag===t)+'"','ws-button ws-quiet')).join('')+'</div>'+
        (filtered.length?filtered.map(i=>'<article class="ws-material-row"><div><div class="ws-meta">'+badge(uiText(i.status==='draft'?'Internal draft':i.status))+(i.tag?badge(i.tag):'')+'</div><h2>'+link('inspiration-item',i.title,i.id)+'</h2>'+paragraphs(i.relevance||i.note.slice(0,250))+'</div><span class="ws-meta">'+person(i.created_by)+'</span></article>').join(''):empty(uiText('A place for useful references'),uiText(tag?'No references use this tag. Choose All to see the rest.':'Add a link or idea and explain its connection to the current work.')));
    }
    function inspirationDetail() {
      const i=data().inspiration_items.find(x=>x.id===state.detail);
      if(!i)return heading(uiText('Reference unavailable'))+empty(uiText('This reference is not available'),uiText('Open Inspiration to see the available references.'));
      return heading(i.title,i.tag,(operator()||i.created_by===user())?button('inspiration-edit',uiText('Edit reference'),'data-id="'+i.id+'"'):'')+
        '<article class="ws-reading"><p>'+badge(uiText(i.status))+'</p>'+(i.url?'<p>'+external(i.url,uiText('Open reference'))+'</p>':'')+paragraphs(i.note)+'<h2><span data-i18n-key="Why it matters here">Why it matters here</span></h2>'+paragraphs(i.relevance||uiText('Discuss how this could help the current work.'))+references(i)+
        '<section class="ws-section"><h2><span data-i18n-key="Discussion">Discussion</span></h2>'+data().inspiration_comments.filter(c=>c.item_id===i.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(c=>'<article class="ws-comment"><p class="ws-meta">'+person(c.author_id)+' · '+date(c.created_at)+' · '+i18n.mark('revision')+' '+c.item_revision+'</p>'+paragraphs(c.body)+(c.item_revision!==i.revision?'<details><summary><span data-i18n-key="Reference when this comment was posted">Reference when this comment was posted</span></summary><strong>'+esc(c.context_snapshot.title)+'</strong>'+paragraphs(c.context_snapshot.note)+(c.context_snapshot.url?'<p>'+external(c.context_snapshot.url,uiText('Original reference link'))+'</p>':'')+'</details>':'')+'</article>').join('')+
        (i.shared_at?'<form class="ws-form" data-form="inspiration-comment" data-id="'+i.id+'" data-revision="'+i.revision+'">'+field(uiText('Your comment'),'body','',{required:true,multiline:true,max:10000,rows:3})+formFoot(uiText('Post comment'))+'</form>':'<p><span data-i18n-key="Share this reference to open its discussion.">Share this reference to open its discussion.</span></p>')+'</section></article>';
    }
    function editor(e) {
      const item=e.item||{};
      if(e.type==='learning'){
        const m=item.id?material(item):null,v=item.id?content(item):null,lv=learningVersion(v)||{};
        return heading(uiText(item.id?'Edit practice':'Create a practice'),uiText('Prepare a short lesson and an action connected to the current work. Publish when ready.'))+
          '<form class="ws-form ws-reading" data-form="learning" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'" data-material-revision="'+(m?.revision||0)+'">'+field(uiText('Practice title'),'title',v?.title,{required:true,max:160})+field(uiText('What this helps with'),'summary',v?.summary,{multiline:true,max:3000,rows:2})+
          field(uiText('Short explanation'),'explanation',v?.blocks.find(b=>b.id==='explanation')?.text,{required:true,multiline:true,max:10000})+field(uiText('Practical action'),'prompt',lv.prompt,{required:true,multiline:true,max:10000,help:uiText('Ask for one useful action and describe what the client should share for feedback.')})+referencesEditor(lv)+filesPicker(v?.file_ids||[])+formFoot(uiText('Save internal draft'))+'</form>';
      }
      if(e.type==='inspiration')return heading(uiText(item.id?'Edit reference':'Add inspiration'),uiText(operator()?'Save a team draft or share it with this workspace.':'Your reference will be shared with the team and this workspace.'))+
        '<form class="ws-form ws-reading" data-form="inspiration" data-id="'+(item.id||'')+'" data-revision="'+(item.revision||0)+'">'+field(uiText('Reference title'),'title',item.title,{required:true,max:160})+field(uiText('Reference link'),'url',item.url,{type:'url',max:2000})+
        field(uiText('Idea or notes'),'note',item.note,{multiline:true,max:10000,help:uiText('Add a link, notes, or both.')})+field(uiText('Why it matters for this project'),'relevance',item.relevance,{multiline:true,rows:3,max:3000})+field(uiText('Tag (optional)'),'tag',item.tag,{max:80})+referencesEditor(item)+
        select(uiText('Availability'),'status',uiOptions([...(operator()&&!item.shared_at?[['draft',uiText('Internal team draft')]]:[]),['shared',uiText('Shared with this workspace')],...(item.id?[['archived',uiText('Archived reference')]]:[])]),item.status||(operator()?'draft':'shared'))+formFoot()+'</form>';
      return null;
    }
    function form(node,values,value,submitter) {
      const type=node.dataset.form,id=node.dataset.id||null,revision=Number(node.dataset.revision)||0;
      if(type==='learning')return {action:'learning.save',payload:{id,revision,material_revision:Number(node.dataset.materialRevision),...Object.fromEntries(['title','summary','explanation','prompt','task_id','reference_version_id'].map(k=>[k,value(k)])),file_ids:[...values.keys()].filter(k=>k.startsWith('file:')).map(k=>k.slice(5))}};
      if(type==='learning-answer')return {action:'learning.submit',payload:{id,revision,version_id:node.dataset.version,answer:value('answer'),evidence_url:value('evidence_url'),status:submitter?.value==='draft'?'draft':'submitted'}};
      if(type==='learning-feedback')return {action:'learning.feedback',payload:{id,revision,body:value('body'),outcome:value('outcome')}};
      if(type==='inspiration')return {action:'inspiration.save',payload:{id,revision,...Object.fromEntries(['title','url','note','relevance','tag','task_id','reference_version_id','status'].map(k=>[k,value(k)]))}};
      if(type==='inspiration-comment')return {action:'inspiration.comment',payload:{id,revision,body:value('body')}};
      return null;
    }
    function localAction(action,control) {
      if(action==='learning-new'){edit('learning');return true;}
      if(action==='learning-edit'){edit('learning',data().learning_units.find(l=>l.id===control.dataset.id));return true;}
      if(action==='inspiration-new'){edit('inspiration');return true;}
      if(action==='inspiration-edit'){edit('inspiration',data().inspiration_items.find(i=>i.id===control.dataset.id));return true;}
      if(action==='inspiration-filter'){tag=control.dataset.tag;render();return true;}
      return false;
    }
    function command(action,control) {
      if(!['learning-publish','learning-archive'].includes(action))return null;
      const l=data().learning_units.find(l=>l.id===control.dataset.id),m=material(l);
      return {action:action.replace('-','.'),payload:{id:l.id,revision:l.revision,version_id:m.draft_version_id,material_revision:m.revision}};
    }
    function afterSave(type,result) {
      if(type.startsWith('learning')){state.view='lesson';state.detail=result.unit?.id||result.unit_id;}
      else if(type.startsWith('inspiration')){state.view='inspiration-item';state.detail=result.item_id||result.id;}
      else return;
      state.version=null;history.replaceState({},'',location.pathname+location.search+'#'+state.view+'/'+state.detail);
    }
    function home() {
      const pending=data().learning_units.filter(l=>{const m=material(l),v=data().learning_versions.find(v=>v.material_version_id===m?.published_version_id);return l.status==='active'&&v&&(operator()?data().learning_submissions.some(s=>s.version_id===v.id&&s.status==='submitted'):outcome(latestAttempt(v))!=='Practice completed');});
      return pending.length?'<section class="ws-section"><div class="ws-section-heading"><h2>'+i18n.mark(operator()?'Practice to review':'Your current practice')+'</h2>'+link('learning',uiText('All learning'))+'</div>'+pending.map(l=>'<article class="ws-action-row">'+link('lesson',material(l)?.title||'Practice',l.id)+'</article>').join('')+'</section>':'';
    }
    return {views:{learning:learningView,lesson:lessonView,inspiration:inspirationView,'inspiration-item':inspirationDetail},editor,form,localAction,command,afterSave,home,editorTable:{learning:'learning_units',inspiration:'inspiration_items'}};
  };
})();
