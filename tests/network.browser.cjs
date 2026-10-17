'use strict';
// Browser -> actual workspace-data/API -> local PostgreSQL/RLS. Auth and mail
// delivery are synthetic; no production or external provider is contacted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {randomUUID}=require('node:crypto');
const {db,ids,bootstrap,actor,query,mutate}=require('./network-database.cjs');
const {createHandler}=require('../api/community');
let base,queue=Promise.resolve();
const mails=[];
const withSQL=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
const runAs=(id,fn,role='authenticated')=>withSQL(async()=>{await actor(id,role);try{return await fn();}finally{await db.exec('reset role');}});
const secret='sb_secret_synthetic_test_only';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function rpc(name,payload,id,role='authenticated'){
 const specs={platum_accept_invitations:[],platum_accept_community_invitations:[],platum_members:['workspace_id'],platum_network_mutate:['action','scope_id','payload','operation_id'],platum_community_service:['action','actor_id','community_id','payload','operation_id']};
 const args=specs[name];if(!args)throw new Error('Unexpected fixture RPC '+name);
 const values=args.map(k=>k==='payload'?JSON.stringify(payload[k]):payload[k]);
 return runAs(id,async()=>(await query('select public.'+name+'('+args.map((k,i)=>'$'+(i+1)+(k==='payload'?'::jsonb':'')).join(',')+') result',values))[0].result,role);
}
async function requestBody(req){const chunks=[];for await(const c of req)chunks.push(c);return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
const known=new Set(Object.values(ids));
const idFor=req=>{const token=String(req.headers.authorization||'').replace('Bearer synthetic-','');return known.has(token)?token:null;};
let server,browser;
(async()=>{
 await bootstrap();const workspace=randomUUID();
 await db.query("insert into public.workspaces(id,slug,name,created_by,updated_by) values($1,'network-browser','Network browser',$2,$2)",[workspace,ids.founder]);
 await db.query("insert into public.workspace_members(workspace_id,user_id,role,created_by) values($1,$2,'team',$3)",[workspace,ids.team,ids.founder]);
 const staticFiles=new Set(['index.html','client-space.html','client-space.css','agency-os.css','workspace-app.css','workspace-calendar.css','workspace-learning.css','workspace-progress.css','client-space.i18n.js','client-space.config.js','client-space-auth.js','cabinet-data.js','workspace-data.js','workspace-calendar-domain.js','workspace-calendar.js','workspace-learning.js','workspace-progress.js','workspace-network.js','workspace-app.js','client-space.js','agency-os.js']);
 let communityHandler;
 server=http.createServer(async(req,res)=>{
  const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   const url=new URL(req.url,base),id=idFor(req);
   if(url.pathname==='/api/community')return communityHandler(req,res);
   if(url.pathname==='/api/team')return send(id?{canCreate:id===ids.founder,platformRole:id===ids.founder?'founder':null,supabaseUrl:base}:{error:'Sign in again'},id?200:401);
   if(url.pathname.startsWith('/rest/v1/')){
    if(!id)return send({message:'UNAUTHENTICATED'},401);
    if(url.pathname.startsWith('/rest/v1/rpc/'))return send(await rpc(url.pathname.split('/').pop(),await requestBody(req),id));
    const table=url.pathname.split('/').pop();if(!/^[a-z_]+$/.test(table))return send({},400);
    const clauses=[],params=[];for(const [key,value] of url.searchParams){if(['select','order','limit','offset'].includes(key))continue;if(!/^[a-z_]+$/.test(key)||!value.startsWith('eq.'))return send({},400);params.push(value.slice(3));clauses.push('"'+key+'"=$'+params.length);}
    const order=url.searchParams.get('order'),limit=Math.min(200,Number(url.searchParams.get('limit'))||200),offset=Number(url.searchParams.get('offset'))||0;
    if(order&&!/^[a-z_]+\.(asc|desc)$/.test(order))return send({},400);
    const sql='select * from public."'+table+'"'+(clauses.length?' where '+clauses.join(' and '):'')+(order?' order by "'+order.split('.')[0]+'" '+order.split('.')[1]:'')+' limit '+limit+' offset '+offset;
    return send(await runAs(id,()=>query(sql,params)));
   }
   const role=/fixture=([a-z]+)/.exec(req.headers.cookie||'')?.[1]||'founder';const who=ids[role];
   if(url.pathname==='/client-space-auth.js'){
    res.setHeader('Content-Type','text/javascript');return res.end(`window.CLIENT_SPACE_AUTH_CONTEXT={user:{id:${JSON.stringify(who)}},accessToken:${JSON.stringify('synthetic-'+who)},platformRole:${JSON.stringify(role==='founder'?'founder':null)}};window.CLIENT_SPACE_AUTH_READY=Promise.resolve(window.CLIENT_SPACE_AUTH_CONTEXT);document.body.classList.remove('auth-loading');document.body.classList.add('is-authenticated');document.getElementById('auth-gate').setAttribute('aria-hidden','true');`);
   }
   if(url.pathname==='/client-space.config.js'){res.setHeader('Content-Type','text/javascript');return res.end('window.CLIENT_SPACE_CONFIG='+JSON.stringify({supabaseUrl:base,supabasePublishableKey:'synthetic',enableCollaboration:true,enablePublicTestWorkspace:false}));}
   const file=url.pathname==='/'?'client-space.html':url.pathname.slice(1);if(!staticFiles.has(file)){res.writeHead(404);return res.end();}
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(__dirname,'..',file)));
  }catch(error){send({message:error.message,code:error.code||'P0001'},400);}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 communityHandler=createHandler({PLATUM_SUPABASE_URL:base,PLATUM_SUPABASE_SERVICE_ROLE_KEY:secret,PLATUM_APP_URL:base},async(url,options)=>{
  const u=new URL(url),payload=options.body?JSON.parse(options.body):{};
  try{
   if(u.pathname==='/auth/v1/user'){const id=String(options.headers.Authorization||'').replace('Bearer synthetic-','');if(!known.has(id))return response({},401);return response({id,email_confirmed_at:id===ids.unconfirmed?null:'2026-01-01T00:00:00Z'});}
   assert.equal(options.headers.apikey,secret);
   if(u.pathname==='/rest/v1/rpc/platum_community_service')return response(await rpc('platum_community_service',payload,payload.actor_id,'service_role'));
   if(u.pathname==='/auth/v1/invite'||u.pathname==='/auth/v1/otp'){mails.push(payload.email);return response({});}
   return response({},404);
  }catch(error){return response({message:error.message,code:error.code},403);}
 });
 browser=await chromium.launch({headless:true});const errors=[],missing=new Set();
 async function pageFor(role){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'fixture',value:role,url:base}]);const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());return page;}
 async function go(page,route){const url=base+'/client-space.html#'+route;if(page.url()===url)await page.reload({waitUntil:'domcontentloaded'});else await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('#ws-content h1').waitFor();await page.waitForFunction(()=>!document.querySelector('#ws-content .ws-loading'));}
 async function save(page){await page.locator('#ws-content form button[type=submit]').last().click();await page.waitForFunction(()=>!document.querySelector('#ws-content form[aria-busy=true]'));assert.equal(await page.locator('.ws-form-error:not([hidden])').count(),0,(await page.locator('.ws-form-error').allTextContents()).join('; '));}
 const founder=await pageFor('founder');await go(founder,'contacts');await founder.locator('[data-action=network-contact-new]').click();
 await founder.locator('[name=name]').fill('Synthetic partner');await founder.locator('[name=organisation]').fill('Example studio');await founder.locator('[name="category:partner"]').check();await founder.locator('[name=context]').fill('Synthetic private context');await founder.locator('[name=next_action]').fill('Discuss a collaboration');await save(founder);
 await founder.getByRole('heading',{name:'Synthetic partner',exact:true}).waitFor();await founder.locator('[name=body]').fill('First introduction recorded.');await save(founder);await founder.getByText('First introduction recorded.',{exact:true}).waitFor();
 await go(founder,'contacts');await founder.locator('[name=contact_search]').fill('no match');assert.equal(await founder.locator('[data-contact-search-text]:visible').count(),0);await founder.locator('[name=contact_search]').fill('studio');assert.equal(await founder.locator('[data-contact-search-text]:visible').count(),1);
 await go(founder,'communities');await founder.locator('[data-action=network-community-new]').click();await founder.locator('[name=name]').fill('Synthetic professional circle');await founder.locator('#ws-content [name=description]').fill('Local browser verification only');await save(founder);
 await founder.getByRole('heading',{name:'Synthetic professional circle',exact:true}).waitFor();const c=(await runAs(ids.founder,()=>query('select * from public.communities')))[0];
 await go(founder,'community-members/'+c.id);await founder.locator('[data-action=network-invite-new]').click();await founder.locator('#ws-content [name=email]').fill('member@platum.test');await save(founder);assert.deepEqual(mails,['member@platum.test']);
 const member=await pageFor('member');await go(member,'communities');assert.equal(await member.locator('#ws-nav a[href="#work"]').count(),0);await member.getByRole('link',{name:'Synthetic professional circle',exact:true}).click();await member.getByRole('heading',{name:'Synthetic professional circle',exact:true}).waitFor();
 await member.locator('[data-action=network-profile]').click();await member.locator('[name=display_name]').fill('Synthetic member');await member.locator('[name=bio]').fill('Research and community collaboration');await member.locator('[name=profile_visible]').check();
 await member.locator('[data-language-selector]:visible').first().selectOption('uk');assert.equal(await member.locator('[name=bio]').inputValue(),'Research and community collaboration');await member.locator('[data-language-selector]:visible').first().selectOption('en');await save(member);
 await member.getByRole('heading',{name:'Synthetic member',exact:true}).waitFor();
 await member.locator('[data-action=network-profile]').click();await member.locator('[name=bio]').fill('My unsaved version');
 await runAs(ids.member,async()=>{const profile=(await query('select * from public.community_members where user_id=$1',[ids.member]))[0];await mutate('community.profile',c.id,{revision:profile.revision,display_name:'Synthetic member',bio:'A newer profile',profile_visible:true});});
 await member.locator('#ws-content form button[type=submit]').click();await member.locator('.ws-form-error:not([hidden])').waitFor();assert.equal(await member.locator('[name=bio]').inputValue(),'My unsaved version');
 await member.locator('[data-action=reload-editor]').click();await member.locator('[name=bio]').waitFor();assert.equal(await member.locator('[name=bio]').inputValue(),'A newer profile');await member.locator('[data-action=cancel-editor]').click();
 await member.locator('[data-action=network-post-new]').click();await member.locator('[name=title]').fill('Useful reference');await member.locator('[name=body]').fill('A local synthetic resource.');await member.locator('[name=status]').selectOption('published');await save(member);
 await member.getByRole('heading',{name:'Useful reference',exact:true}).waitFor();await member.locator('[name=body]').fill('A discussion response.');await save(member);await member.getByText('A discussion response.',{exact:true}).waitFor();
 await go(founder,'community/'+c.id);await founder.locator('[data-action=network-event-new]').click();await founder.locator('[name=title]').fill('Community call');await founder.locator('[name=timezone]').fill('Europe/Warsaw');await founder.locator('[name=starts]').fill('2027-01-20T12:00');await founder.locator('[name=ends]').fill('2027-01-20T13:00');await save(founder);
 const ev=(await runAs(ids.founder,()=>query('select * from public.community_events')))[0];await go(member,'community-event/'+ev.id);await member.locator('[data-response=yes]').click();await member.locator('[data-response=yes][aria-pressed=true]').waitFor();
 await founder.locator('[data-action=network-event-edit]').click();await founder.locator('[name=starts]').fill('2027-01-21T12:00');await founder.locator('[name=ends]').fill('2027-01-21T13:00');await save(founder);
 const updatedEvent=(await runAs(ids.founder,()=>query('select * from public.community_events')))[0];assert.notEqual(updatedEvent.current_version_id,ev.current_version_id,'event update saved a new version');
 await go(member,'community-event/'+ev.id);assert.equal(await member.locator('[data-response=yes]').getAttribute('aria-pressed'),'false');
 await go(member,'community/'+c.id);await member.locator('[data-action=network-referral-new]').click();await member.locator('[name=name]').fill('Suggested participant');await member.locator('#ws-content [name=email]').fill('client@platum.test');await member.locator('[name=reason]').fill('Synthetic candidate for collaboration');await save(member);
 await go(founder,'community-members/'+c.id);await founder.locator('[data-action=network-referral-invite]').click();assert.equal(await founder.locator('#ws-content [name=email]').inputValue(),'client@platum.test');await save(founder);assert.deepEqual(mails,['member@platum.test','client@platum.test']);
 const evidence=process.env.PLATUM_NETWORK_SCREENSHOTS||'/private/tmp/platum-network-evidence';fs.mkdirSync(evidence,{recursive:true});
 for(const page of [founder,member]){
  await go(page,'community/'+c.id);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+width);
   await page.locator('[data-language-selector]:visible').first().selectOption('uk');
   const absent=await page.evaluate(()=>[...document.querySelectorAll('[data-i18n-key]')].map(n=>n.dataset.i18nKey).filter(k=>!PLATUM_I18N.has(k)));absent.forEach(x=>missing.add(x));
   await page.screenshot({path:path.join(evidence,(page===founder?'manager':'member')+'-'+width+'.png'),fullPage:true});
  }
 }
 await member.locator('[data-language-selector]:visible').first().selectOption('en');
 await go(founder,'community-members/'+c.id);await founder.locator('[data-action=network-revoke-member][data-id="'+ids.member+'"]').click();await founder.waitForFunction(()=>!document.querySelector('[data-action="network-revoke-member"]'));
 await go(member,'community/'+c.id);await member.getByRole('heading',{name:'Not available',exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual([...missing],[],'missing translations');
 console.log('PASS browser: contact create/history/search; independent community; real API invitation with simulated mail; member-only entry; opt-in profile; localized drafts; publication/discussion; event revisions/RSVP; revocation; 1440/390/320px.');
 console.log('Evidence: '+evidence+' (synthetic local PostgreSQL; Auth/email transport simulated).');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await db.close();});
