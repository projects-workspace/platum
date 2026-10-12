'use strict';
const fs=require('node:fs');
const {cfg,guard,createUser}=require('./local-support.cjs');
(async()=>{
  await guard();
  cfg.users={};
  for(const name of ['Owner','Teammate','ClientA','ClientB','Outsider'])cfg.users[name]=await createUser(name);
  fs.writeFileSync(process.env.PLATUM_TEST_CONFIG,JSON.stringify(cfg,null,2),{mode:0o600});
  console.log('Created five synthetic local Auth identities. Credentials remain in the private temporary config.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
