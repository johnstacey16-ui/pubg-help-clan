'use strict';
const {AUDIENCE}=require('../lib/github-oidc');
// GitHub Actions uses its short-lived verified OIDC identity. No shared secret required.
// Each invocation is short; no attempt to bypass Vercel Hobby's scheduled cron.
const BACKFILL_ENDPOINT='https://pubg-help-clan.vercel.app/api/sync?mode=backfill';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function githubToken(){
 const raw=process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
 const serviceToken=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 if(!raw||!serviceToken)throw Error('GitHub Actions OIDC permission id-token: write is required.');
 const url=new URL(raw);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.actions.githubusercontent.com'))
   throw Error('Untrusted OIDC token service');
 url.searchParams.set('audience',AUDIENCE);
 const res=await fetch(url,{
   headers:{Authorization:'Bearer '+serviceToken,Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(15000)
 });
 if(!res.ok)throw Error('GitHub OIDC identity request failed with HTTP '+res.status);
 const payload=await res.json();
 if(typeof payload.value!=='string'||!payload.value.includes('.'))
   throw Error('GitHub OIDC returned an invalid token');
 return payload.value;
}
async function main(){
 const secret=process.env.PUBG_SYNC_CRON_SECRET; // Optional backward compatibility.
 const cycles=Math.min(25,Math.max(1,Number(process.env.PUBG_BACKFILL_CYCLES)||20));
 for(let i=0;i<cycles;i++){
   // Reissue the 5-minute OIDC token for each cycle, never log the JWT.
   const credential=secret||await githubToken();
   const response=await fetch(BACKFILL_ENDPOINT,{
     method:'GET',headers:{Authorization:'Bearer '+credential,Accept:'application/json','Cache-Control':'no-store'},
     redirect:'error',signal:AbortSignal.timeout(45000)
   });
   if(!response.ok)throw Error('Authenticated backfill endpoint returned HTTP '+response.status+
      '; make sure the updated GitHub commit is deployed before running this job.');
   const result=await response.json();
   if(!result?.seasonCollection ||
      !Number.isInteger(result.seasonCollection.playersAttempted))
     throw Error('Production sync response is missing season collection status; check the deployed API.');
   const progress=result.extras||{},season=result.seasonCollection,
    rivalry=result.rivalryCollection||{};
   console.log(JSON.stringify({cycle:i+1,import:result.status,identified:result.identified,
     matched:result.matched,backfillDone:progress.done,backfillTotal:progress.total,
     backfillPending:progress.pending,backfillUnavailable:progress.unavailableTotal,
     seasonAttempted:season.playersAttempted,seasonSaved:season.seasonSaved,
     rankedSaved:season.rankedSaved,rateLimited:season.rateLimited||progress.rateLimited,
     rivalryMatchesClaimed:rivalry.claimed,rivalryMatchesSaved:rivalry.matchesSaved,
     rivalryPlayerReports:rivalry.playersSaved,rivalryErrors:rivalry.errors}));
   if(result.status==='no_work'&&
      progress.claimed===0&&season.playersAttempted===0&&rivalry.claimed===0) {
     console.log('No due backfill jobs. Future-dated maintenance does not waste runner minutes.');
     break;
   }
   if(i+1<cycles)await sleep(66000); // Rate limiter itself is atomic at 10/65 sec.
 }
}
if(require.main===module)main().catch(error=>{
 console.error('Backfill stopped:',error.message);process.exitCode=1;
});
module.exports={main};
