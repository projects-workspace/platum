'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'client-space.i18n.js'),'utf8');
function element(attributes={},text='') {
  return {attributes:{...attributes},textContent:text,value:'',getAttribute(key){return this.attributes[key]??null;},setAttribute(key,value){this.attributes[key]=String(value);}};
}
function runtime({saved=null,search='',storageThrows=false,htmlLang='en',nodes=[]}={}) {
  const storage=new Map(saved===null?[]:[['platum:locale:v1',saved]]);
  const document={documentElement:{lang:htmlLang},readyState:'complete',addEventListener(){},querySelectorAll(selector){
    return nodes.filter(node=>selector.split(',').some(part=>{const key=part.trim().slice(1,-1);return Object.hasOwn(node.attributes,key);}));
  }};
  const window={location:{search},localStorage:{getItem(key){if(storageThrows)throw Error('denied');return storage.get(key)??null;},setItem(key,value){if(storageThrows)throw Error('denied');storage.set(key,value);}}};
  vm.runInNewContext(source,{window,document,URLSearchParams,Intl,Date,Set,JSON});
  return {locale:window.PLATUM_I18N,document,storage};
}
test('English is default; validated explicit saved or URL locale controls Ukrainian',()=>{
  assert.equal(runtime({htmlLang:'uk'}).locale.language(),'en');
  assert.equal(runtime({saved:'ru'}).locale.language(),'en');
  assert.equal(runtime({saved:'uk'}).document.documentElement.lang,'uk');
  assert.equal(runtime({search:'?lang=uk'}).locale.language(),'uk');
  assert.equal(runtime({saved:'en',search:'?lang=uk'}).locale.language(),'en');
});
test('locale changes remain usable when browser storage is denied',()=>{
  const {locale,document}=runtime({storageThrows:true});
  assert.equal(locale.setLanguage('uk'),true);
  assert.equal(document.documentElement.lang,'uk');
  assert.equal(locale.t('Materials'),'Матеріали');
  assert.equal(locale.setLanguage('unsupported'),false);
});
test('switch updates only explicit UI markers, preserving form values, files and authored content',()=>{
  const label=element({'data-i18n-key':'Materials'},'Materials');
  const authored=element({},'Materials');
  const input=element({'data-i18n-placeholder':'Short title'});input.value='Materials';
  const file=element({});file.files=[{name:'Materials.txt'}];
  const originalFiles=file.files;
  const {locale,storage}=runtime({nodes:[label,authored,input,file]});
  locale.setLanguage('uk');
  assert.equal(label.textContent,'Матеріали');assert.equal(authored.textContent,'Materials');
  assert.equal(input.value,'Materials');assert.equal(file.files,originalFiles);
  assert.equal(input.getAttribute('placeholder'),'Коротка назва');
  locale.setLanguage('en');assert.equal(label.textContent,'Materials');
  assert.equal(storage.get('platum:locale:v1'),'en');
});
test('date templates update with locale; malformed dates and unknown errors retain useful text',()=>{
  const marker=element({'data-i18n-key':'Published {date} · {number}','data-i18n-params':JSON.stringify({date:{__platumDate:'2026-10-15'},number:2})});
  const {locale}=runtime({nodes:[marker]});assert.match(marker.textContent,/Oct/);
  locale.setLanguage('uk');assert.match(marker.textContent,/жовт/);
  assert.match(locale.dateTimeText('2026-10-15T10:00:00Z','Europe/Kyiv'),/жовт/);
  assert.match(locale.monthText('2026-10'),/жовтень/);
  assert.equal(locale.dateText('bad-date'),'bad-date');
  assert.equal(locale.dateTimeText('bad-date'),'bad-date');
  assert.equal(locale.t('Useful provider detail'),'Useful provider detail');
  assert.notEqual(locale.t('Sign in again to continue.'),'Sign in again to continue.');
});
function uiSourceKeys(code) {
  const keys=[];
  for(const call of code.matchAll(/\buiText\(/g)) {
    let index=call.index+call[0].length,depth=0,quote=null;const start=index;
    for(;index<code.length;index++) {
      const character=code[index];
      if(quote){if(character==='\\'){index++;continue;}if(character===quote)quote=null;}
      else if(character==="'"||character==='"'||character==='`')quote=character;
      else if(character==='(')depth++;
      else if(character===')'){if(depth===0)break;depth--;}
      else if(character===','&&depth===0)break;
    }
    const argument=code.slice(start,index);
    for(const literal of argument.matchAll(/'((?:[^'\\]|\\.)*)'/g)){
      const before=argument.slice(0,literal.index),after=argument.slice(literal.index+literal[0].length);
      if(/(?:===|!==)\s*$/.test(before)||/^\s*(?:===|!==)/.test(after))continue;
      if(/[A-Za-z]/.test(literal[1]))keys.push(literal[1]);
    }
  }
  return keys;
}
test('marked HTML and explicit UI tokens have Ukrainian catalog coverage',()=>{
  const {locale}=runtime();
  for(const filename of ['client-space.html','prohor-intake.html','index.html','workspace-app.js','workspace-calendar.js','workspace-learning.js','workspace-progress.js','workspace-network.js','client-space.js','agency-os.js']) {
    const code=fs.readFileSync(path.join(root,filename),'utf8');
    for(const key of uiSourceKeys(code))assert.equal(locale.has(key),true,filename+': missing dynamic UI key '+key);
    for(const expression of [/data-i18n-(?:key|placeholder|aria-label|title)="([^"$<>]+)"/g,/(?:uiText|i18n\.mark|i18n\.t|ui)\('((?:[^'\\]|\\.)*)'/g]) {
      for(const match of code.matchAll(expression)) {
        const key=match[1].replaceAll('&amp;','&');
        if(!key||key.includes("'+")||key.includes("' +")||key.includes('${')||key.includes('\\'))continue;
        assert.equal(locale.has(key),true,filename+': missing '+key);
      }
    }
  }
});
test('standalone intake display schema is translated without changing saved English choice values',()=>{
  const code=fs.readFileSync(path.join(root,'prohor-intake.js'),'utf8');
  const schema=code.slice(code.indexOf('  const sections ='),code.indexOf('  const dom ='));
  const ctx={};vm.runInNewContext(schema+';globalThis.result=sections;',ctx);
  const {locale}=runtime({saved:'uk'});
  for(const section of ctx.result){for(const key of ['title','note'])assert.equal(locale.has(section[key]),true,section[key]);
    for(const field of section.fields){for(const key of ['label','hint','placeholder'])if(field[key])assert.equal(locale.has(field[key]),true,field[key]);for(const option of field.options||[])assert.equal(locale.has(option),true,option);}}
  assert.deepEqual(Array.from(ctx.result[0].fields[0].options),['Up to 1 week','1–4 weeks','1–3 months','3+ months','It depends on the event']);
  assert.match(code,/value="\$\{escapeHtml\(option\)\}"/);
  assert.doesNotMatch(code,/value="\$\{ui\(option\)\}"/);
});
test('workspace option labels are valid direct markers, with enum and authored values unchanged',()=>{
  const {locale}=runtime({saved:'uk'});const code=fs.readFileSync(path.join(root,'workspace-app.js'),'utf8');
  const start=code.indexOf('  const escape =');const end=code.indexOf('  const featureContext');
  const ctx={window:{PLATUM_I18N:locale},state:{data:{workspace_files:[]}}};
  vm.runInNewContext(code.slice(start,end)+';globalThis.helpers={select,uiText,field};',ctx);
  const {select,uiText,field}=ctx.helpers;
  const html=select(uiText('Status'),'status',[['in_progress',uiText('In progress')],['Materials','Materials']],'Materials');
  assert.match(html,/value="in_progress"[^>]*>У роботі<\/option>/);
  assert.match(html,/value="Materials" selected>Materials<\/option>/);
  assert.doesNotMatch(html,/<option[^>]*>\s*<span/);
  assert.match(field(uiText('Title'),'title','<Materials>'),/value="&lt;Materials&gt;"/);
});
test('JSON export stays identical while Markdown headings use the selected locale',async()=>{
  const code=fs.readFileSync(path.join(root,'workspace-data.js'),'utf8');
  const exportCode=code.slice(code.indexOf('  async function exportWorkspace('),code.indexOf('  async function queue('));
  const payload={workspace:{name:'Materials'},exported_at:'2026-10-15T12:00:00Z',tasks:[],requests:[],replies:[],materials:[],decisions:[],reviews:[],comments:[],submissions:[],activity:[],files:[]};
  let saved;const {locale}=runtime({saved:'uk'});
  const ctx={window:{PLATUM_I18N:locale},rpc:async()=>payload,saveBlob:(blob,name)=>{saved={blob,name};},Blob,Date};
  vm.runInNewContext(exportCode+';globalThis.exportWorkspace=exportWorkspace;',ctx);
  await ctx.exportWorkspace('workspace','json');assert.deepEqual(JSON.parse(await saved.blob.text()),payload);
  await ctx.exportWorkspace('workspace','markdown');const markdown=await saved.blob.text();
  assert.match(markdown,/# Materials/);assert.match(markdown,/## Наша домовленість/);assert.match(markdown,/## Історія календаря/);
});
test('preview checkbox uses valid escaped localized aria text and preserves authored titles',()=>{
  const code=fs.readFileSync(path.join(root,'client-space.js'),'utf8');
  const checkbox=code.slice(code.indexOf('  function taskCheckbox('),code.indexOf('  function renderTasks('));
  const escaping=code.slice(code.indexOf('  function escapeHtml('),code.indexOf('  function translate('));
  const {locale}=runtime({saved:'uk'});
  const seeded={id:'seeded',title:'Prepare your first project brief'},authored={id:'user',title:'Materials" <private>'};
  const ctx={i18n:locale,starterRecords:new WeakSet([seeded]),isTaskDone:()=>false};
  vm.runInNewContext(escaping+checkbox+';globalThis.checkbox=taskCheckbox;',ctx);
  const seededHtml=ctx.checkbox(seeded),authoredHtml=ctx.checkbox(authored);
  assert.doesNotMatch(seededHtml,/<span/);assert.match(seededHtml,/data-i18n-aria-label="Mark task as completed: \{title\}"/);
  assert.match(seededHtml,/\saria-label="[^"<>]+"/);
  assert.ok(seededHtml.includes(locale.t('Prepare your first project brief')));
  assert.match(authoredHtml,/Materials&quot; &lt;private&gt;/);
  assert.doesNotMatch(authoredHtml,/__platumUi/);
  locale.setLanguage('en');assert.match(ctx.checkbox(seeded),/Mark task as completed: Prepare your first project brief/);
});
test('populated review, file, invitation and published-report renderers translate visible states',()=>{
  const data=structuredClone(require('./localization-fixtures.cjs'));
  const state={data,active:{id:'fixture',role:'owner'},detail:'material',version:null,workspaces:[]};
  const {locale}=runtime({saved:'uk'});const code=fs.readFileSync(path.join(root,'workspace-app.js'),'utf8');
  const helpers=code.slice(code.indexOf('  const escape ='),code.indexOf('  const featureContext'));
  const material=code.slice(code.indexOf('  function materialView('),code.indexOf('  function formsView('));
  const filesAndMembers=code.slice(code.indexOf('  function filesView('),code.indexOf('  function blockEditor('));
  const ctx={window:{PLATUM_I18N:locale,CLIENT_SPACE_AUTH_CONTEXT:{user:{id:'user-team'}}},state,crypto:require('node:crypto')};
  vm.runInNewContext(helpers+material+filesAndMembers+';globalThis.views={materialView,filesView,membersView};globalThis.ui={escape,heading,button,field,select,check,formFoot,person,date,dateText,uiText,uiOptions,textNode,i18n,operator,user,badge,empty,paragraphs,link,external};',ctx);
  const materialHtml=ctx.views.materialView();
  for(const status of ['Approved','Changes requested'])assert.ok(materialHtml.includes('>'+locale.t(status)+'</span>'),status);
  const filesHtml=ctx.views.filesView();
  for(const status of ['Shared','Linked or internal','Upload incomplete'])assert.ok(filesHtml.includes('>'+locale.t(status)+'</span>'),status);
  const invitationsHtml=ctx.views.membersView();
  for(const status of ['Pending','Expired'])assert.ok(invitationsHtml.includes('>'+locale.t(status)+'</span>'),status);
  const progress=fs.readFileSync(path.join(root,'workspace-progress.js'),'utf8');vm.runInNewContext(progress,ctx);
  const feature=ctx.window.PLATUM_PROGRESS_UI({...ctx.ui,state});state.detail='report';state.version='publication';
  const reportHtml=feature.views.report();const label='Discuss or review this report version';
  assert.ok(reportHtml.includes('data-i18n-key="'+label+'">'+label+'</a>'));
  const reportLink=element({'data-i18n-key':label},label);
  locale.apply({querySelectorAll:selector=>selector==='[data-i18n-key]'?[reportLink]:[]});
  assert.equal(reportLink.textContent,locale.t(label));
  assert.ok(reportHtml.includes('>Materials</h1>'));
  assert.deepEqual(data.material_reviews.map(record=>record.status),['approved','changes_requested']);
  assert.deepEqual(data.workspace_files.map(record=>record.status),['ready','ready','reserved']);
});
