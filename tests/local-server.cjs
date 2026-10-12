'use strict';
const {cfg,guard}=require('./local-support.cjs');
(async()=>{
  await guard();
  if(!cfg.users?.Owner?.id)throw new Error('Create the local fixture identities first.');
  Object.assign(process.env,{
    PLATUM_SUPABASE_URL:cfg.apiUrl,
    PLATUM_SUPABASE_PUBLISHABLE_KEY:cfg.anonKey,
    PLATUM_SUPABASE_SERVICE_ROLE_KEY:cfg.serviceKey,
    PLATUM_APP_URL:cfg.appUrl,
    PLATUM_DEV_PORT:new URL(cfg.appUrl).port,
    PLATUM_BOOTSTRAP_USER_IDS:cfg.users.Owner.id,
  });
  require('../scripts/dev-server');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
