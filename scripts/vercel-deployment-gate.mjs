// Vercel Ignored Build Step: exit 0 = skip; exit 1 = continue deployment.
// Preserve the normal GitHub CI workflow. Only explicit [deploy] release commits
// should publish the HELP Clan website, Discord bot and API together.
import {execFileSync} from 'node:child_process';

let message=process.env.VERCEL_GIT_COMMIT_MESSAGE;
if(!message){
  try{
    message=execFileSync('git',['log','-1','--format=%B'],{
      encoding:'utf8',
      stdio:['ignore','pipe','pipe']
    });
  }catch(error){
    console.error('Cannot identify Git commit message; skip Vercel build safely.');
    process.exit(0);
  }
}
if(/(?:^|\s)\[deploy\](?=\s|$)/i.test(message)){
  console.log('Explicit [deploy] release: allow Vercel build.');
  process.exit(1);
}
console.log('Development, test or documentation commit: skip Vercel build.');
process.exit(0);
