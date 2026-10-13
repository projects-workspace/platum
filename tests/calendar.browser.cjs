'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {cfg,guard,team,rpc,success,createSuiteUsers}=require('./local-support.cjs');
const out=process.env.PLATUM_BROWSER_OUTPUT;
if(!out||path.resolve(out).startsWith(path.resolve(__dirname,'..')+path.sep))throw new Error('Use a private output directory outside the repository.');
fs.mkdirSync(out,{recursive:true});
const passed=[],errors=[];let browser,lastPage;
async function check(name,fn){await fn();passed.push(name);console.log('PASS '+name);}
async function signedPage(actor){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.addInitScript(session=>localStorage.setItem('client-cabinet:auth:v1',JSON.stringify({accessToken:session.access_token,refreshToken:session.refresh_token,expiresAt:Date.now()+session.expires_in*1000})),actor.session);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());return page;
}
async function title(page,text){await page.waitForFunction(value=>document.querySelector('#ws-content h1')?.textContent===value,text);}
async function saved(page){await page.waitForFunction(()=>!document.querySelector('#workspace-app [aria-busy="true"]')&&!document.querySelector('#ws-content .ws-loading'));await page.locator('#ws-notice:not(.is-error)').filter({hasText:'Saved.'}).waitFor({state:'visible'});}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
(async()=>{
  await guard();const users=await createSuiteUsers('CalendarBrowser');
  const w=success(await team(users.Owner,'create_workspace',null,{name:'Calendar browser verification'}),'Browser workspace').workspace.id;
  success(await team(users.Owner,'invite',w,{email:users.ClientB.email,role:'client'}),'Invite browser client');
  success(await rpc('platum_accept_invitations',{},users.ClientB.session.access_token),'Accept browser client');
  browser=await chromium.launch({headless:true});const owner=await signedPage(users.Owner),client=await signedPage(users.ClientB);
  async function go(page,view){lastPage=page;const url=cfg.appUrl+'/client-space.html?workspace='+w+'#'+view;if(page.url()===url)await page.reload({waitUntil:'networkidle'});else await page.goto(url,{waitUntil:'networkidle'});await page.locator('#workspace-app').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#ws-content .ws-loading'));}
  let eventId;const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  await check('team proposes an event through the calendar editor and it persists after reload',async()=>{
    await go(owner,'calendar');await title(owner,'Calendar');await owner.getByRole('button',{name:'Propose an event',exact:true}).click();
    await owner.getByLabel('Event title',{exact:true}).fill('Review next steps');await owner.getByLabel('Time zone',{exact:true}).fill('Europe/Prague');
    await owner.getByLabel('Starts',{exact:true}).fill(day+'T10:00');await owner.getByLabel('Ends',{exact:true}).fill(day+'T11:00');
    await owner.getByLabel('Agenda',{exact:true}).fill('Choose one practical next action.');await owner.getByLabel('Location or meeting link',{exact:true}).fill('https://example.com/meeting');
    await owner.getByRole('button',{name:'Send proposal',exact:true}).click();await title(owner,'Review next steps');eventId=new URL(owner.url()).hash.split('/')[1];
    await owner.reload({waitUntil:'networkidle'});await title(owner,'Review next steps');assert.ok(eventId);
  });
  await check('client sets shared availability and a personal display zone',async()=>{
    await go(client,'availability');await client.getByRole('button',{name:'Edit my availability',exact:true}).click();
    await client.getByLabel('Time zone',{exact:true}).fill('Asia/Kathmandu');await client.getByLabel('A note about your rhythm',{exact:true}).fill('Mornings work best.');
    await client.getByRole('button',{name:'Add weekly window',exact:true}).click();await client.getByLabel('Day',{exact:true}).selectOption('2');
    await client.getByRole('button',{name:'Add unavailable dates',exact:true}).click();await client.getByLabel('First day',{exact:true}).fill('2026-12-20');await client.getByLabel('Last day (inclusive)',{exact:true}).fill('2026-12-22');
    await client.getByRole('button',{name:'Save shared availability',exact:true}).click();await title(client,'Availability');
    await go(owner,'availability');await owner.getByText('Mornings work best.',{exact:true}).waitFor({state:'visible'});
    await go(client,'calendar');await client.getByText(/Displayed in Asia\/Kathmandu/).waitFor({state:'visible'});
  });
  await check('client confirms, comments by keyboard, and reschedules without carrying approval forward',async()=>{
    await go(client,'event/'+eventId);await title(client,'Review next steps');
    await client.getByRole('button',{name:'Send response',exact:true}).click();await saved(client);
    assert.equal(await client.getByRole('button',{name:'Send response',exact:true}).count(),0);
    await client.getByLabel('Add to this proposal’s discussion',{exact:true}).fill('Please include the latest result.');
    const post=client.getByRole('button',{name:'Post comment',exact:true});await post.focus();await client.keyboard.press('Enter');await saved(client);
    await client.getByText('Please include the latest result.',{exact:true}).waitFor({state:'visible'});
    await client.getByRole('button',{name:'Propose another time',exact:true}).click();await client.getByLabel('Starts',{exact:true}).fill(day+'T12:00');await client.getByLabel('Ends',{exact:true}).fill(day+'T13:00');
    await client.getByRole('button',{name:'Send proposal',exact:true}).click();await title(client,'Review next steps');
    await client.getByText('Proposal 2 · proposed',{exact:true}).waitFor({state:'visible'});
    await client.locator('.ws-calendar-history').filter({hasText:'Proposal 1'}).locator('summary').click();await client.getByText('Please include the latest result.',{exact:true}).waitFor({state:'visible'});
    await go(owner,'team');const inboxItem=owner.locator('[data-action="open-inbox-item"][data-id="'+eventId+'"]');await inboxItem.waitFor({state:'visible'});await inboxItem.click();await title(owner,'Review next steps');
    await owner.getByRole('button',{name:'Send response',exact:true}).click();await saved(owner);
  });
  await check('calendar download includes current confirmation and rescheduled UTC time',async()=>{
    const download=owner.waitForEvent('download');await owner.getByRole('button',{name:'Download event',exact:true}).click();
    const file=await download;await file.saveAs(path.join(out,'event.ics'));const text=fs.readFileSync(path.join(out,'event.ics'),'utf8');
    assert.match(text,/STATUS:CONFIRMED/);assert.match(text,/SUMMARY:Review next steps/);assert.match(text,/UID:/);assert.ok(text.includes(day.replaceAll('-','')+'T100000Z'));
  });
  await check('invalid times retain input and saving after correction works',async()=>{
    await owner.getByRole('button',{name:'Propose another time',exact:true}).click();await owner.getByLabel('Time zone',{exact:true}).fill('Not/AZone');
    await owner.getByRole('button',{name:'Send proposal',exact:true}).click();await owner.locator('.ws-form-error:not([hidden])').waitFor({state:'visible'});
    assert.equal(await owner.getByLabel('Event title',{exact:true}).inputValue(),'Review next steps');
    await owner.getByLabel('Time zone',{exact:true}).fill('Europe/Prague');await owner.getByRole('button',{name:'Send proposal',exact:true}).click();await title(owner,'Review next steps');
  });
  await check('calendar and event controls work on phones without horizontal overflow',async()=>{
    for(const width of [390,320]){await client.setViewportSize({width,height:844});await go(client,'calendar');await title(client,'Calendar');await noOverflow(client);await client.screenshot({path:path.join(out,'calendar-'+width+'.png'),fullPage:true});
      await client.locator('[data-action="calendar-day"]').filter({hasText:'15'}).first().focus();await client.keyboard.press('Enter');await noOverflow(client);
      await go(client,'event/'+eventId);await title(client,'Review next steps');await noOverflow(client);}
  });
  assert.deepEqual(errors,[],'No unhandled application exceptions');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'real local Supabase browser',passed,errors},null,2));
  console.log(passed.length+' calendar browser groups passed.');
})().catch(async error=>{if(lastPage)await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error(error.message);process.exitCode=1;}).finally(async()=>{await browser?.close();});
