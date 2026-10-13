'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {cfg,guard,team,rpc,success,createSuiteUsers}=require('./local-support.cjs');
const out=process.env.PLATUM_BROWSER_OUTPUT;
if(!out||path.resolve(out).startsWith(path.resolve(__dirname,'..')+path.sep))throw new Error('Use a private output directory outside the repository.');
fs.mkdirSync(out,{recursive:true});
let browser,lastPage;const passed=[],errors=[];
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function pageFor(actor){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.addInitScript(s=>localStorage.setItem('client-cabinet:auth:v1',JSON.stringify({accessToken:s.access_token,refreshToken:s.refresh_token,expiresAt:Date.now()+s.expires_in*1000})),actor.session);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());return page;}
async function title(page,text){await page.waitForFunction(t=>document.querySelector('#ws-content h1')?.textContent===t,text);}
async function saved(page){await page.waitForFunction(()=>!document.querySelector('#workspace-app [aria-busy="true"]')&&!document.querySelector('#ws-content .ws-loading'));await page.locator('#ws-notice:not(.is-error)').filter({hasText:'Saved.'}).waitFor({state:'visible'});}
(async()=>{
  await guard();const users=await createSuiteUsers('LearningBrowser');const w=success(await team(users.Owner,'create_workspace',null,{name:'Learning browser verification'}),'Create browser space').workspace.id;
  success(await team(users.Owner,'invite',w,{email:users.ClientB.email,role:'client'}),'Invite local client');success(await rpc('platum_accept_invitations',{},users.ClientB.session.access_token),'Accept');
  browser=await chromium.launch({headless:true});const owner=await pageFor(users.Owner),client=await pageFor(users.ClientB);
  async function go(page,view){lastPage=page;const url=cfg.appUrl+'/client-space.html?workspace='+w+'#'+view;if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});await page.locator('#workspace-app').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#ws-content .ws-loading'));}
  let lessonId,inspirationId;
  await check('team drafts and publishes a short lesson through its dedicated editor',async()=>{
    await go(owner,'learning');await title(owner,'Learning & practice');await owner.getByRole('button',{name:'Create a practice',exact:true}).click();
    await owner.getByLabel('Practice title',{exact:true}).fill('Write a useful brief');await owner.getByLabel('What this helps with',{exact:true}).fill('Make the next piece of work easier to explain.');
    await owner.getByLabel('Short explanation',{exact:true}).fill('Describe who this is for, what they need, and the next useful action.');await owner.getByLabel('Practical action',{exact:true}).fill('Write three sentences about your next release.');
    await owner.getByRole('button',{name:'Save internal draft',exact:true}).click();await title(owner,'Write a useful brief');lessonId=new URL(owner.url()).hash.split('/')[1];
    await go(client,'learning');assert.equal(await client.getByRole('link',{name:'Write a useful brief',exact:true}).count(),0);
    await owner.getByRole('button',{name:'Publish practice',exact:true}).click();await saved(owner);
    await go(client,'lesson/'+lessonId);await title(client,'Write a useful brief');await client.getByLabel('Your practice response',{exact:true}).waitFor({state:'visible'});
  });
  await check('private draft survives reload and submits for visible team feedback',async()=>{
    await client.getByLabel('Your practice response',{exact:true}).fill('Our audience needs a concrete next action.');await client.getByRole('button',{name:'Save private draft',exact:true}).click();await saved(client);
    await client.reload({waitUntil:'networkidle'});await title(client,'Write a useful brief');assert.equal(await client.getByLabel('Your practice response',{exact:true}).inputValue(),'Our audience needs a concrete next action.');
    await go(owner,'lesson/'+lessonId);assert.equal(await owner.getByText('Our audience needs a concrete next action.',{exact:true}).count(),0);
    await client.getByRole('button',{name:'Submit practice',exact:true}).click();await saved(client);
    await go(owner,'team');await owner.locator('[data-action="open-inbox-item"][data-id="'+lessonId+'"]').click();await title(owner,'Write a useful brief');
    await owner.getByLabel('Practice outcome',{exact:true}).selectOption('needs_changes');await owner.getByLabel('Your feedback',{exact:true}).fill('Please name the action and its result.');const response=owner.waitForResponse(r=>r.url().endsWith('/rpc/platum_learning_mutate')&&r.request().postDataJSON()?.action==='learning.feedback');await owner.getByRole('button',{name:'Send feedback',exact:true}).click();assert.equal((await response).ok(),true);await owner.locator('.ws-practice-feedback').getByText('Please name the action and its result.',{exact:true}).waitFor({state:'visible'});
    await go(client,'lesson/'+lessonId);await client.getByText('Please name the action and its result.',{exact:true}).waitFor({state:'visible'});
  });
  await check('client makes a second attempt and the team records completion without losing history',async()=>{
    await client.getByLabel('Your practice response',{exact:true}).fill('The audience will select a workshop date using the published form.');await client.getByRole('button',{name:'Submit practice',exact:true}).click();await saved(client);
    await go(owner,'lesson/'+lessonId);await owner.getByLabel('Practice outcome',{exact:true}).selectOption('completed');await owner.getByLabel('Your feedback',{exact:true}).fill('This is specific enough to use in the next task.');
    const response=owner.waitForResponse(r=>r.url().endsWith('/rpc/platum_learning_mutate')&&r.request().postDataJSON()?.action==='learning.feedback');await owner.getByRole('button',{name:'Send feedback',exact:true}).focus();await owner.keyboard.press('Enter');assert.equal((await response).ok(),true);await owner.locator('.ws-practice-feedback').getByText('This is specific enough to use in the next task.',{exact:true}).waitFor({state:'visible'});
    await go(client,'learning');await client.getByText('Practice completed',{exact:true}).waitFor({state:'visible'});
    await client.getByRole('link',{name:'Write a useful brief',exact:true}).click();await title(client,'Write a useful brief');assert.equal(await client.locator('.ws-practice-attempt').count(),2);
  });
  await check('a revised lesson starts a fresh practice while keeping the prior feedback',async()=>{
    await owner.getByRole('button',{name:'Edit practice',exact:true}).click();await owner.getByLabel('Practical action',{exact:true}).fill('Use feedback from the published release to revise your brief.');await owner.getByRole('button',{name:'Save internal draft',exact:true}).click();await title(owner,'Write a useful brief');
    await owner.getByRole('button',{name:'Publish practice',exact:true}).click();await saved(owner);
    await go(client,'learning');await client.getByText('Ready to try',{exact:true}).waitFor({state:'visible'});assert.equal(await client.getByText('Practice completed',{exact:true}).count(),0);
    await go(client,'lesson/'+lessonId);await client.getByText('This is specific enough to use in the next task.',{exact:true}).waitFor({state:'visible'});
  });
  await check('inspiration can be shared, discussed, edited and filtered without losing comment context',async()=>{
    await go(client,'inspiration');await client.getByRole('button',{name:'Add inspiration',exact:true}).click();await client.getByLabel('Reference title',{exact:true}).fill('A clear example');await client.getByLabel('Reference link',{exact:true}).fill('https://example.com/one');
    await client.getByLabel('Idea or notes',{exact:true}).fill('The original example.');await client.getByLabel('Why it matters for this project',{exact:true}).fill('This makes the practical action easy to understand.');await client.getByLabel('Tag (optional)',{exact:true}).fill('Writing');await client.getByRole('button',{name:'Save changes',exact:true}).click();await title(client,'A clear example');inspirationId=new URL(client.url()).hash.split('/')[1];
    await go(owner,'inspiration-item/'+inspirationId);await owner.getByLabel('Your comment',{exact:true}).fill('We can use this format for the next brief.');await owner.getByRole('button',{name:'Post comment',exact:true}).click();await saved(owner);
    await client.getByRole('button',{name:'Edit reference',exact:true}).click();await client.getByLabel('Reference link',{exact:true}).fill('https://example.com/two');await client.getByLabel('Idea or notes',{exact:true}).fill('The revised example.');await client.getByRole('button',{name:'Save changes',exact:true}).click();await title(client,'A clear example');
    await client.getByText('Reference when this comment was posted',{exact:true}).click();await client.getByText('The original example.',{exact:true}).waitFor({state:'visible'});
    await go(client,'inspiration');await client.getByRole('button',{name:'Writing',exact:true}).click();await client.getByRole('link',{name:'A clear example',exact:true}).waitFor({state:'visible'});
  });
  await check('learning and inspiration remain usable at phone widths with no application exceptions',async()=>{
    for(const width of [390,320])for(const view of ['learning','lesson/'+lessonId,'inspiration','inspiration-item/'+inspirationId]){
      await client.setViewportSize({width,height:844});await go(client,view);assert.equal(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,view+' at '+width);
      if(view.startsWith('lesson/'))await client.screenshot({path:path.join(out,'practice-'+width+'.png'),fullPage:true});
    }
    assert.deepEqual(errors,[]);
  });
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'real local Supabase browser',passed,errors},null,2));console.log(passed.length+' learning browser groups passed.');
})().catch(async error=>{if(lastPage)await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(error.message);process.exitCode=1;}).finally(async()=>{await browser?.close();});
