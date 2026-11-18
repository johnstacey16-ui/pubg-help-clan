'use strict';

// Keep the source of identity authoritative: both console shard and account ID
// must come from saved, confirmed PUBG player records. No API calls here.
const ACCOUNT_ID=/^[a-zA-Z0-9._-]{8,160}$/;
function selectSavedConsoleAccount(rows,name,platform='auto'){
  const exact=(Array.isArray(rows)?rows:[]).filter(row=>
    typeof row?.gamertag==='string' &&
    row.gamertag.toLowerCase()===name.toLowerCase() &&
    ['xbox','psn'].includes(row.platform) &&
    typeof row.pubg_account_id==='string' &&
    ACCOUNT_ID.test(row.pubg_account_id));
  const consoles=[...new Set(exact.map(row=>row.platform))];
  if(platform==='auto'&&consoles.length>1)
    return{status:409,body:{
      error:'This saved gamertag exists on Xbox and PlayStation. Choose the correct console.',
      code:'platform_ambiguous',choices:consoles
    }};
  const player=exact.find(row=>platform==='auto'||row.platform===platform);
  if(player)return{player};
  if(consoles.length)
    return{status:409,body:{
      error:'The player is saved on a different console. Choose that console.',
      suggestedPlatform:consoles[0]
    }};
  return{status:404,body:{error:'No confirmed console account saved for this gamertag.'}};
}
module.exports={selectSavedConsoleAccount};
