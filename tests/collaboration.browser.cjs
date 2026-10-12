'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {cfg,guard,rows,success,randomUUID,team,rpc}=require('./local-support.cjs');
const out=process.env.PLATUM_BROWSER_OUTPUT;
if(!out)throw new Error('Set PLATUM_BROWSER_OUTPUT to a private output directory outside the repository.');
fs.mkdirSync(out,{recursive:true});
const passed=[],errors=[];
let browser,lastPage;
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function signedPage(actor,viewport={width:1440,height:1000}){
  const context=await browser.newContext({viewport,acceptDownloads:true});
  await context.addInitScript(session=>{
    localStorage.setItem('client-cabinet:auth:v1',JSON.stringify({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000}));
  },actor.session);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  return page;
}
async function title(page,text){await page.waitForFunction(expected=>document.querySelector('#ws-content h1')?.textContent===expected,text,{timeout:15000});}
async function go(page,view){lastPage=page;const url=cfg.appUrl+'/client-space.html?workspace='+cfg.fixture.workspaceB+'#'+view;
  if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});await page.locator('#workspace-app').waitFor({state:'visible'});
  await page.waitForFunction(expected=>document.querySelector('#ws-workspace-select')?.value===expected&&!document.querySelector('#ws-content .ws-loading'),cfg.fixture.workspaceB,{timeout:15000});
  assert.equal(new URL(page.url()).searchParams.get('workspace'),cfg.fixture.workspaceB,'The requested workspace must remain selected.');
}
async function saved(page){await page.waitForFunction(()=>!document.querySelector('#workspace-app [aria-busy="true"]')&&!document.querySelector('#ws-content .ws-loading'));await page.locator('#ws-notice:not(.is-error)').filter({hasText:/[Ss]aved|Workspace created|File uploaded/}).waitFor({state:'visible',timeout:15000});}
async function publish(page){
  const response=page.waitForResponse(r=>r.url().endsWith('/rpc/platum_mutate')&&r.request().postDataJSON()?.action==='material.publish');
  await page.getByRole('button',{name:'Publish this version',exact:true}).click();
  assert.equal((await response).ok(),true,'Publication must be committed before the client loads it');
  await saved(page);
}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'The page must not overflow horizontally');}
(async()=>{
  await guard();assert.ok(cfg.fixture?.workspaceB,'Run the integration suite before the browser journey.');
  // Each browser pass gets fresh content without deleting earlier evidence.
  cfg.fixture.workspaceB=success(await team(cfg.users.Owner,'create_workspace',null,{name:'Fieldwork collaboration'}),'Create browser fixture workspace').workspace.id;
  success(await team(cfg.users.Owner,'invite',cfg.fixture.workspaceB,{email:cfg.users.ClientB.email,role:'client'}),'Invite browser fixture client');
  success(await rpc('platum_accept_invitations',{},cfg.users.ClientB.session.access_token),'Accept browser fixture membership');
  browser=await chromium.launch({headless:true});
  const owner=await signedPage(cfg.users.Owner),client=await signedPage(cfg.users.ClientB);
  let materialId,formId,requestId;
  await check('the team creates a workspace through the UI and reload retains its selection',async()=>{
    await go(owner,'home');await title(owner,'Fieldwork collaboration');
    await owner.locator('#ws-nav').getByRole('link',{name:'Create workspace',exact:true}).click();
    await owner.getByLabel('Workspace name',{exact:true}).fill('Harbor studio');
    await owner.locator('form[data-form="workspace"]').getByRole('button',{name:'Create workspace',exact:true}).click();
    await title(owner,'Harbor studio');await owner.reload({waitUntil:'networkidle'});await title(owner,'Harbor studio');
    await owner.locator('#ws-workspace-select').selectOption(cfg.fixture.workspaceB);await title(owner,'Fieldwork collaboration');
  });
  await check('the team edits agreement, appearance and section order without code changes',async()=>{
    await owner.locator('#ws-nav a[href="#settings"]').click();await title(owner,'Workspace settings');
    await owner.getByLabel('Welcome message',{exact:true}).fill('A shared space for thoughtful work.');
    await owner.getByLabel('Current focus',{exact:true}).fill('Prepare a clear launch direction.');
    await owner.getByLabel('Agreed goal',{exact:true}).fill('Agree the direction before production.');
    await owner.getByLabel('Current scope',{exact:true}).fill('An outline, a review and the next agreed action.');
    await owner.getByLabel('Who does what',{exact:true}).fill('The team prepares the direction. You bring context and feedback.');
    await owner.getByLabel('Working rhythm',{exact:true}).fill('One clear update each week.');
    await owner.getByLabel('Scope boundaries',{exact:true}).fill('We agree additional work before starting it.');
    await owner.getByLabel('Next agreed step',{exact:true}).fill('Review the launch outline.');
    await owner.getByLabel('Accent',{exact:true}).selectOption('forest');
    await owner.locator('[data-module="materials"] [data-action="module-up"]').click();
    await owner.locator('form[data-form="settings"]').getByRole('button',{name:'Save changes',exact:true}).click();await title(owner,'Our agreement');
    await go(client,'context');await client.getByText('We agree additional work before starting it.',{exact:true}).waitFor({state:'visible'});
  });
  await check('draft, publication, section discussion and client approval work through the interface',async()=>{
    await go(owner,'materials');await owner.getByRole('button',{name:'Create material',exact:true}).click();
    await owner.getByLabel('Title',{exact:true}).fill('Launch outline');
    await owner.getByLabel('Short summary',{exact:true}).fill('A clear starting point for our next conversation.');
    const contents=owner.getByLabel('Content',{exact:true});
    await contents.nth(0).fill('We are preparing the first shared direction.');
    await contents.nth(1).fill('Start with the smallest useful release and review the result together.');
    await contents.nth(2).fill('Leave your feedback on the sections below.');
    await owner.getByRole('button',{name:'Save internal draft',exact:true}).click();await title(owner,'Launch outline');
    materialId=new URL(owner.url()).hash.split('/')[1];
    await publish(owner);
    await go(client,'materials');await client.getByRole('link',{name:'Launch outline',exact:true}).click();await title(client,'Launch outline');
    const discussion=client.locator('.ws-document-block').first().locator('details');
    await discussion.locator('summary').click();await discussion.getByLabel('Comment',{exact:true}).fill('Can we make the first action more specific?');
    await discussion.getByRole('button',{name:'Post comment',exact:true}).click();await saved(client);
    await client.getByRole('button',{name:'Approve this version',exact:true}).click();await saved(client);
    await client.locator('.ws-review-records').getByText('Approved',{exact:true}).waitFor({state:'visible'});
    await go(owner,'material/'+materialId);const teamDiscussion=owner.locator('.ws-document-block').first().locator('details');
    await teamDiscussion.locator('summary').click();await teamDiscussion.getByRole('button',{name:'Reply',exact:true}).click();
    await teamDiscussion.getByLabel('Comment',{exact:true}).fill('Yes. We will include a concrete review checklist.');
    await teamDiscussion.getByRole('button',{name:'Post comment',exact:true}).click();await saved(owner);
  });
  await check('a new version preserves the old discussion and does not inherit approval',async()=>{
    await owner.getByRole('button',{name:'Edit draft',exact:true}).click();
    await owner.getByLabel('Content',{exact:true}).nth(2).fill('Check the goal, audience and next step. Then approve this version or request changes.');
    await owner.getByRole('button',{name:'Save internal draft',exact:true}).click();await title(owner,'Launch outline');
    await publish(owner);
    await go(client,'material/'+materialId);
    assert.equal(await client.locator('.ws-review-records').count(),0);
    const versionSelect=client.locator('[data-version-select]');
    const oldVersion=await versionSelect.locator('option').filter({hasText:'Version 1'}).getAttribute('value');
    await versionSelect.selectOption(oldVersion);
    await client.waitForFunction(expected=>document.querySelector('[data-version-select]')?.value===expected&&!document.querySelector('#ws-content .ws-loading'),oldVersion);
    const discussion=client.locator('.ws-document-block').first().locator('details');await discussion.locator('summary').click();
    await discussion.getByText('Can we make the first action more specific?',{exact:true}).waitFor({state:'visible'});
    assert.equal(await client.getByRole('button',{name:'Approve this version',exact:true}).count(),0);
    await go(client,'material/'+materialId);await client.getByRole('button',{name:'Request changes',exact:true}).click();
    await client.getByLabel('What should change?',{exact:true}).fill('Please include an example before we proceed.');
    await client.getByRole('button',{name:'Send feedback',exact:true}).click();await saved(client);
    await go(owner,'team');await owner.getByText('Changes requested',{exact:true}).first().waitFor({state:'visible'});
    await owner.locator('[data-action="open-inbox-item"][data-id="'+materialId+'"]').click();await title(owner,'Launch outline');
  });
  await check('questionnaire answers survive draft save, reload, submission and team review',async()=>{
    await go(owner,'forms');await owner.getByRole('button',{name:'Create questionnaire',exact:true}).click();
    await owner.getByLabel('Title',{exact:true}).fill('Before our next review');
    await owner.getByLabel('What these answers will help us do',{exact:true}).fill('Your answer will help the team choose the next step.');
    await owner.getByLabel('Question',{exact:true}).fill('What should we prioritise?');
    await owner.getByLabel('Why we are asking',{exact:true}).fill('We will use this in the review.');
    await owner.getByLabel('Answer format',{exact:true}).selectOption('textarea');
    await owner.getByLabel('Availability',{exact:true}).selectOption('active');
    await owner.getByRole('button',{name:'Save changes',exact:true}).click();await title(owner,'Questionnaires');
    await go(client,'forms');await client.getByRole('link',{name:'Before our next review',exact:true}).click();
    formId=new URL(client.url()).hash.split('/')[1];
    await client.getByLabel('What should we prioritise?',{exact:false}).fill('A concise first launch.');
    await client.getByRole('button',{name:'Save draft',exact:true}).click();await saved(client);
    await client.reload({waitUntil:'networkidle'});assert.equal(await client.getByLabel('What should we prioritise?',{exact:false}).inputValue(),'A concise first launch.');
    await client.getByRole('button',{name:'Submit to the team',exact:true}).click();await saved(client);
    await go(owner,'form/'+formId);await owner.locator('.ws-response summary').click();
    await owner.getByText('A concise first launch.',{exact:true}).waitFor({state:'visible'});
    await owner.getByRole('button',{name:'Mark reviewed',exact:true}).click();await saved(owner);
  });
  await check('a request can upload an attachment and be turned into an owned task',async()=>{
    await go(client,'work');await client.getByRole('button',{name:'New request',exact:true}).click();
    await client.getByLabel('Short title',{exact:true}).fill('Website direction');
    await client.getByLabel('Tell us what you need',{exact:true}).fill('Please review this idea. <img src=x onerror="window.__injected=true">');
    await client.getByText('Attach files (optional)',{exact:true}).click();
    await client.locator('[name="request_file"]').setInputFiles({name:'brief.txt',mimeType:'text/plain',buffer:Buffer.from('A synthetic client brief.')});
    await client.getByRole('button',{name:'Send request',exact:true}).click();await title(client,'Website direction');
    requestId=new URL(client.url()).hash.split('/')[1];
    assert.equal(await client.evaluate(()=>window.__injected),undefined);
    await client.getByRole('button',{name:'brief.txt',exact:true}).waitFor({state:'visible'});
    await go(owner,'request/'+requestId);await owner.getByRole('button',{name:'Manage request',exact:true}).click();
    await owner.getByLabel('Scope decision',{exact:true}).selectOption('included');
    await owner.getByLabel('Team owner',{exact:true}).selectOption(cfg.users.Owner.id);
    await owner.getByRole('button',{name:'Save changes',exact:true}).click();await title(owner,'Website direction');
    await owner.getByRole('button',{name:'Create linked task',exact:true}).click();
    await owner.getByLabel('Task title',{exact:true}).fill('Approve the website direction');
    await owner.getByLabel('Person (optional)',{exact:true}).selectOption(cfg.users.ClientB.id);
    await owner.getByRole('button',{name:'Save changes',exact:true}).click();await saved(owner);
    await go(client,'work');const task=client.locator('.ws-work-row').filter({hasText:'Approve the website direction'});
    await task.getByRole('button',{name:'Mark complete',exact:true}).click();await saved(client);
    await client.locator('.ws-work-row').filter({hasText:'Approve the website direction'}).getByText('Completed',{exact:true}).waitFor({state:'visible'});
    await go(owner,'request/'+requestId);await owner.getByRole('button',{name:'Manage request',exact:true}).click();await owner.getByLabel('Next action sits with',{exact:true}).selectOption('resolved');await owner.getByRole('button',{name:'Save changes',exact:true}).click();await title(owner,'Website direction');
  });
  await check('a lost response keeps the client draft and retry does not duplicate the committed request',async()=>{
    await go(client,'work');await client.getByRole('button',{name:'New request',exact:true}).click();
    await client.getByLabel('Short title',{exact:true}).fill('Planning our next review');
    await client.getByLabel('Tell us what you need',{exact:true}).fill('Can we set the agenda for our next conversation?');
    let intercepted=false;
    await client.route('**/rest/v1/rpc/platum_mutate',async route=>{
      const body=route.request().postDataJSON();
      if(!intercepted&&body.action==='request.create'){intercepted=true;await route.fetch();await route.abort('failed');}
      else await route.continue();
    });
    await client.getByRole('button',{name:'Send request',exact:true}).click();
    await client.locator('.ws-form-error').waitFor({state:'visible'});
    assert.equal(await client.getByLabel('Tell us what you need',{exact:true}).inputValue(),'Can we set the agenda for our next conversation?');
    await client.unroute('**/rest/v1/rpc/platum_mutate');
    await client.getByRole('button',{name:'Send request',exact:true}).click();await title(client,'Planning our next review');
    assert.equal(success(await rows('requests',cfg.fixture.workspaceB,cfg.users.ClientB),'Retry verification').filter(r=>r.title==='Planning our next review').length,1);
  });
  await check('two browser editors preserve a conflicting draft instead of overwriting it',async()=>{
    const second=await signedPage(cfg.users.Owner);
    await go(owner,'material/'+materialId);await go(second,'material/'+materialId);
    await owner.getByRole('button',{name:'Edit draft',exact:true}).click();await second.getByRole('button',{name:'Edit draft',exact:true}).click();
    await owner.getByLabel('Short summary',{exact:true}).fill('First editor revision.');
    await second.getByLabel('Short summary',{exact:true}).fill('Second editor draft must survive.');
    await owner.getByRole('button',{name:'Save internal draft',exact:true}).click();await title(owner,'Launch outline');
    await second.getByRole('button',{name:'Save internal draft',exact:true}).click();await second.locator('.ws-form-error').waitFor({state:'visible'});
    assert.equal(await second.getByLabel('Short summary',{exact:true}).inputValue(),'Second editor draft must survive.');
    await second.context().close();
  });
  await check('published updates and shared-history exports are readable and omit internal drafts',async()=>{
    await go(owner,'updates');await owner.getByRole('button',{name:'Write an update',exact:true}).click();
    await owner.getByLabel('Title',{exact:true}).fill('A clear direction for the next step');
    await owner.getByLabel('Update',{exact:true}).fill('The outline is published, your answers are reviewed, and the next task is agreed.');
    await owner.getByRole('button',{name:'Publish update',exact:true}).click();await saved(owner);
    await go(client,'updates');await client.getByText('A clear direction for the next step',{exact:true}).waitFor({state:'visible'});
    await client.getByRole('button',{name:'Mark updates as read',exact:true}).click();await saved(client);
    await client.reload({waitUntil:'networkidle'});assert.equal(await client.locator('.ws-timeline .ws-new').count(),0);
    const downloadEvent=client.waitForEvent('download');
    await client.getByRole('button',{name:'Download shared history',exact:true}).click();
    const download=await downloadEvent;const content=fs.readFileSync(await download.path(),'utf8');
    assert.match(content,/Launch outline/);assert.equal(content.includes('First editor revision.'),false);
  });
  await check('desktop and phone layouts support the primary path and keyboard disclosures',async()=>{
    await go(owner,'home');await title(owner,'Fieldwork collaboration');await noOverflow(owner);
    await owner.screenshot({path:path.join(out,'team-desktop.png'),fullPage:true});
    const mobile=await signedPage(cfg.users.ClientB,{width:390,height:844});
    await go(mobile,'home');await title(mobile,'Fieldwork collaboration');await noOverflow(mobile);
    await mobile.screenshot({path:path.join(out,'client-mobile.png'),fullPage:true});
    await mobile.getByRole('button',{name:'Menu',exact:true}).click();
    await mobile.locator('#ws-nav a[href="#materials"]').click();await title(mobile,'Materials');
    await mobile.getByRole('link',{name:'Launch outline',exact:true}).click();await title(mobile,'Launch outline');
    const summary=mobile.locator('.ws-document-block details summary').first();await summary.focus();await mobile.keyboard.press('Enter');
    assert.equal(await mobile.locator('.ws-document-block details').first().getAttribute('open')!==null,true);
    await noOverflow(mobile);await mobile.screenshot({path:path.join(out,'material-mobile.png'),fullPage:true});
    await mobile.setViewportSize({width:320,height:740});await noOverflow(mobile);
    await mobile.context().close();
  });
  await check('a new client follows the actual local invitation email, reloads and loses access after revocation',async()=>{
    const email='browser-invite-'+randomUUID().slice(0,8)+'@platum.test';
    await go(owner,'members');await owner.getByRole('button',{name:'Invite someone',exact:true}).click();
    await owner.getByLabel('Email address',{exact:true}).fill(email);
    await owner.getByRole('button',{name:'Send invitation',exact:true}).click();
    await owner.getByText('Invitation sent.',{exact:true}).waitFor({state:'visible',timeout:15000});
    let message;
    for(let attempt=0;attempt<20;attempt++){
      const inbox=await (await fetch(cfg.mailUrl+'/api/v1/messages')).json();
      message=inbox.messages?.find(m=>JSON.stringify(m.To).includes(email));
      if(message)break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(message,'The invitation must reach the local inbox.');
    const content=await (await fetch(cfg.mailUrl+'/api/v1/message/'+message.ID)).json();
    const urls=[...content.HTML.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
    const invitation=urls.find(url=>url.startsWith(cfg.apiUrl+'/auth/v1/verify'));
    assert.ok(invitation,'The actual Auth verification link must exist.');
    const context=await browser.newContext();const invited=await context.newPage();lastPage=invited;
    invited.on('pageerror',error=>errors.push(error.message));
    await invited.goto(invitation,{waitUntil:'networkidle'});
    await title(invited,'Fieldwork collaboration');
    await invited.reload({waitUntil:'networkidle'});await title(invited,'Fieldwork collaboration');
    await go(owner,'members');
    await owner.locator('.ws-work-row:has([data-action="revoke-member"])').filter({hasText:email}).getByRole('button',{name:'Remove access',exact:true}).click();
    await owner.getByText('Access updated.',{exact:true}).waitFor({state:'visible'});
    await invited.reload({waitUntil:'networkidle'});await invited.getByText('No workspace access yet',{exact:true}).waitFor({state:'visible'});
    await context.close();
    const invalidContext=await browser.newContext();const invalid=await invalidContext.newPage();
    await invalid.goto(cfg.appUrl+'/client-space.html#error=access_denied&error_description=Link_expired',{waitUntil:'networkidle'});
    await invalid.getByText('This sign-in link is invalid or has expired. Request a new link below, or contact your team.',{exact:true}).waitFor({state:'visible'});
    assert.equal(await invalid.locator('#workspace-app').isVisible(),false);
    await invalidContext.close();
  });
  await check('isolated public test access remains separate from authenticated collaboration',async()=>{
    const context=await browser.newContext();const page=await context.newPage();let workspaceCalls=0;
    page.on('request',r=>{if(r.url().includes('/rest/v1/'))workspaceCalls++;});
    await page.goto(cfg.appUrl+'/client-space.html',{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Enter test workspace',exact:true}).click();
    await page.waitForFunction(()=>window.CLIENT_SPACE_AUTH_CONTEXT?.isTestWorkspace===true);
    assert.equal(await page.evaluate(()=>window.CLIENT_SPACE_AUTH_CONTEXT.accessToken),null);
    assert.equal(await page.locator('#workspace-app').isVisible(),false);
    assert.equal(workspaceCalls,0);
    await context.close();
  });
  assert.deepEqual(errors,[],'No unhandled application errors');
  fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({passed,applicationErrors:errors,scope:'headless Chromium, local real Supabase, desktop and phone',date:new Date().toISOString()},null,2));
  await browser.close();console.log(passed.length+' browser scenarios passed.');
})().catch(async error=>{
  console.error('FAIL '+error.message.replace(/([?&#](?:access_token|refresh_token|token|token_hash)=)[^&#\s"]+/g,'$1[redacted]'));
  if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error('Page state:',(await lastPage.locator('#ws-content').innerText().catch(()=>'' )).slice(0,1600));}
  await browser?.close();process.exitCode=1;
});
