'use strict';
// Synthetic browser checks only. Playwright fulfills allowlisted local assets without network access.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const bundle=require('./localization-fixtures.cjs');
const fs=require('node:fs');
const path=require('node:path');
const base='http://127.0.0.1:4188';
const origin=new URL(base).origin;
const publicAssets=new Set([
  'index.html','client-space.html','prohor-intake.html',
  'client-space.css','agency-os.css','workspace-app.css','workspace-calendar.css','workspace-learning.css','workspace-progress.css','prohor-intake.css',
  'client-space.i18n.js','client-space.config.js','client-space-auth.js','cabinet-data.js','workspace-data.js',
  'workspace-calendar-domain.js','workspace-calendar.js','workspace-learning.js','workspace-progress.js','workspace-network.js','workspace-personal.js','workspace-archive.js','workspace-app.js','client-space.js','agency-os.js','prohor-intake.js',
]);
const coverageFailures=new Set();
let currentStep='launch';
function progress(step) { currentStep=step; console.log('[locale browser] '+step); }
async function translated(page) {
  const missing=await page.evaluate(()=>[...document.querySelectorAll('[data-i18n-key]')].filter(node=>!window.PLATUM_I18N.has(node.getAttribute('data-i18n-key'))).map(node=>node.getAttribute('data-i18n-key')));
  missing.forEach(key=>coverageFailures.add('Missing: '+key));
  const mismatches=await page.evaluate(()=>[...document.querySelectorAll('[data-i18n-key]')].filter(node=>node.textContent!==window.PLATUM_I18N.t(node.getAttribute('data-i18n-key'),JSON.parse(node.getAttribute('data-i18n-params')||'{}'))).map(node=>node.getAttribute('data-i18n-key')));
  mismatches.forEach(key=>coverageFailures.add('Stale: '+key));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow');
  assert.doesNotMatch(await page.locator('body').innerText(),/\[object Object\]|<span data-i18n/,'escaped UI markup');
}
async function isolatedPage(browser, role) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000);const errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(role&&url.pathname==='/client-space-auth.js')return route.fulfill({contentType:'text/javascript',body:`window.CLIENT_SPACE_AUTH_CONTEXT={user:{id:'${role==='client'?'user-client':'user-team'}'},accessToken:'synthetic'};window.CLIENT_SPACE_AUTH_READY=Promise.resolve(window.CLIENT_SPACE_AUTH_CONTEXT);document.body.classList.remove('auth-loading');document.body.classList.add('is-authenticated');document.getElementById('auth-gate').setAttribute('aria-hidden','true');`});
    if(role&&url.pathname==='/workspace-data.js')return route.fulfill({contentType:'text/javascript',body:`window.PLATUM_DATA={access:async()=>[{id:'fixture',name:'Materials',role:'${role}',revision:1,settings:{timezone:'Europe/Kyiv'}}],bundle:async()=>{window.__localizationBundleRoute=location.hash;return (${JSON.stringify(bundle)});},team:async()=>({canCreate:${role!=='client'}}),queue:async()=>[],mutate:async()=>({}),exportWorkspace:async()=>{},download:async()=>{}};`});
    let pathname;
    try{pathname=decodeURIComponent(url.pathname);}catch{return route.abort();}
    const name=pathname==='/'?'index.html':pathname.slice(1);
    if(!['GET','HEAD'].includes(route.request().method())||!publicAssets.has(name))return route.abort();
    try{
      const content=fs.readFileSync(path.resolve(__dirname,'..',name));
      const contentType=(name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript')+'; charset=utf-8';
      return route.fulfill({status:200,contentType,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:route.request().method()==='HEAD'?'':content});
    }catch{return route.abort();}
  });
  return {page,context,errors};
}
async function language(page,value) {await page.locator('[data-language-selector]:visible').first().selectOption(value);assert.equal(await page.locator('html').getAttribute('lang'),value);}
async function navigate(page,route) {
  await page.evaluate(route=>{location.hash=route},route);
  await page.waitForFunction(route=>window.__localizationBundleRoute==='#'+route&&!document.querySelector('#ws-content .ws-loading')&&Boolean(document.querySelector('#ws-content h1')),route,{timeout:10000});
}
async function checkEntries(browser) {
  progress('auth entry');
  const {page,context,errors}=await isolatedPage(browser);
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/client-space.html',{waitUntil:'domcontentloaded'});await page.locator('#email-login').fill('synthetic@example.test');
  await language(page,'uk');assert.equal(await page.locator('#email-login').inputValue(),'synthetic@example.test');
  assert.equal(await page.locator('#auth-title').innerText(),'З поверненням.');await translated(page);
  const bounds=await page.locator('[data-language-selector]:visible').first().boundingBox();assert.ok(bounds&&bounds.y<844,'auth language control is visible without scrolling');
  await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.locator('html').getAttribute('lang'),'uk');
  progress('intake entry');
  await page.goto(base+'/prohor-intake.html',{waitUntil:'domcontentloaded'});
  const answer=page.locator('textarea').first(),choice=page.locator('[data-single-choice]').first();
  await answer.fill('Materials <client-authored>');await choice.check();const persistedValue=await choice.inputValue();
  for(const locale of ['en','uk']){await language(page,locale);assert.equal(await answer.inputValue(),'Materials <client-authored>');assert.equal(await choice.inputValue(),persistedValue);assert.equal(await choice.isChecked(),true);await translated(page);}
  assert.equal(persistedValue,'Up to 1 week');
  progress('intake saved-choice persistence');
  await page.waitForFunction(()=>Boolean(JSON.parse(localStorage.getItem('platum:artist-strategy-intake:v1')||'{}').answers?.booking_lead_time),null,{timeout:10000});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('platum:artist-strategy-intake:v1')).answers.booking_lead_time),'Up to 1 week');
  assert.deepEqual(errors,[]);await context.close();
}
async function checkWorkspace(browser,role) {
  progress(role+' workspace');
  const {page,context,errors}=await isolatedPage(browser,role);
  await page.addInitScript(()=>localStorage.setItem('platum:locale:v1','uk'));
  await page.goto(base+'/client-space.html#home',{waitUntil:'domcontentloaded'});await page.locator('#ws-content h1').waitFor();
  const routes=['home','work','calendar','availability','learning','inspiration','reports','context','materials','forms','files','updates','material/material','form/form','request/request','event/event','lesson/lesson','inspiration-item/inspiration','milestone/milestone','report/report','report/report/publication',...(role==='owner'?['team','members','templates','settings','new-workspace']:[])];
  const mobileRoutes=['calendar',role==='owner'?'settings':'context','report/report/publication'];
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    for(const route of width===1440?routes:mobileRoutes){
      progress(role+' route '+route+' at '+width+'px');
      await navigate(page,route);await translated(page);
      const requiredLabels=route==='material/material'?['Approved','Changes requested']:route==='files'?['Shared','Linked or internal','Upload incomplete']:route==='members'?['Pending','Expired']:[];
      if(requiredLabels.length){const labels=await page.evaluate(keys=>keys.map(key=>window.PLATUM_I18N.t(key)),requiredLabels);const badges=await page.locator('#ws-content .ws-badge').allTextContents();for(const label of labels)assert.ok(badges.includes(label),'translated state: '+label);}
      if(route==='report/report/publication'){const expected=await page.evaluate(()=>window.PLATUM_I18N.t('Discuss or review this report version'));assert.equal(await page.locator('#ws-content a[href="#material/material/version"]').last().innerText(),expected);}
    }
  }
  await navigate(page,'form/form');
  if(role==='client'){const options=await page.locator('#ws-content select[name="answer:answer"] option').allTextContents();assert.ok(options.includes('Materials'));assert.ok(options.includes('Calendar'));}
  const actions=['new-request',...(role==='owner'?['edit-task','edit-material','edit-form','upload-file','publish-update','record-decision','settings','invite-person','calendar-new','calendar-availability','learning-new','inspiration-new','milestone-new','report-new','template-new']:['calendar-new','calendar-availability','inspiration-new'])];
  const actionRoutes={'publish-update':'updates','record-decision':'context','invite-person':'members','calendar-new':'calendar','calendar-availability':'availability','learning-new':'learning','inspiration-new':'inspiration','milestone-new':'reports','report-new':'reports','template-new':'templates','edit-material':'materials','edit-form':'forms','upload-file':'files','settings':'context'};
  for(const action of actions){
    progress(role+' editor '+action);
    await navigate(page,actionRoutes[action]||'work');
    await page.locator('[data-action="'+action+'"]').first().click();const form=page.locator('#ws-content form').first();await form.waitFor();
    await form.evaluate(node=>{node.__localeSentinel=true;});
    const input=form.locator('input[type="text"],input:not([type]),textarea').first();const hasInput=await input.count();
    if(hasInput)await input.fill('Materials <private draft>');
    const file=form.locator('input[type="file"]').first();const hasFile=await file.count();if(hasFile)await file.setInputFiles({name:'Materials.txt',mimeType:'text/plain',buffer:Buffer.from('synthetic')});
    for(const locale of ['en','uk']){await language(page,locale);assert.equal(await form.evaluate(node=>node.__localeSentinel),true,'editor DOM retained');if(hasInput)assert.equal(await input.inputValue(),'Materials <private draft>');if(hasFile)assert.equal(await file.evaluate(node=>node.files[0]?.name),'Materials.txt');await translated(page);}
    await form.locator('[data-action="cancel-editor"]').click();
  }
  assert.deepEqual(errors,[]);await context.close();return {role,desktopRoutes:routes.length,mobileRoutes,editors:actions.length};
}
(async()=>{
 let browser,deadline;
 try{
   progress('allowlisted local asset transport at '+origin);
   browser=await chromium.launch({headless:true});
   const configuredDeadline=Number(process.env.PLATUM_LOCALE_BROWSER_TIMEOUT_MS||300000);
   const deadlineMs=Number.isFinite(configuredDeadline)&&configuredDeadline>0?configuredDeadline:300000;
   deadline=setTimeout(()=>{console.error('Localization browser exceeded '+deadlineMs+'ms at '+currentStep);browser.close().catch(()=>{});},deadlineMs);
   await checkEntries(browser);const results=[];for(const role of ['owner','client'])results.push(await checkWorkspace(browser,role));
   assert.deepEqual([...coverageFailures],[],'locale coverage across all routes and editors');
   console.log(JSON.stringify({synthetic:true,entries:2,widths:[1440,390,320],results}));
 }catch(error){
   console.error('[locale browser] failure at '+currentStep);
   for(const [index,page] of (browser?.contexts().flatMap(context=>context.pages())||[]).entries()){
     try{console.error(JSON.stringify({page:index,url:page.url(),body:(await page.locator('body').innerText({timeout:2000})).slice(0,4000)}));await page.screenshot({path:path.join(require('node:os').tmpdir(),'platum-localization-failure-'+index+'.png'),timeout:3000});}catch(diagnosticError){console.error('Diagnostic unavailable: '+diagnosticError.message);}
   }
   throw error;
 }finally{
   clearTimeout(deadline);
   await browser?.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
