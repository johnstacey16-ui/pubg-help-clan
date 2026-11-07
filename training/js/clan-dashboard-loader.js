'use strict';
// Dashboard dependencies load only when its toolkit workspace is selected.
(function(){
  const scripts=['/assets/clan-analytics.js','/assets/command-centre.js',
    '/assets/pubg-dictionaries.js','/assets/source-explorer.js',
    '/assets/telemetry-view.js','/assets/global-board.js',
    '/assets/survival-view.js','/assets/cache-health.js',
    '/assets/full-stats.js','/assets/weapon-explorer.js','/assets/clan-weapon-board.js',
    '/assets/match-lab.js','/assets/match-lobby.js','/assets/clan-match-board.js','/assets/clan-activity-pulse.js',
    '/assets/squad-chemistry.js','/assets/clan-record-book.js',
    '/assets/site.js'];
  let running=null;
  function load(src){
    return new Promise((resolve,reject)=>{
      const tag=document.createElement('script');
      tag.src=src;tag.async=false;tag.onload=resolve;
      tag.onerror=()=>reject(Error('Unable to load '+src));
      document.body.appendChild(tag);
    });
  }
  function activate(){
    if(running)return running;
    running=(async()=>{for(const src of scripts)await load(src);})().catch(error=>{
      console.error('Clan workspace failed:',error.message);
      running=null;
      const status=document.getElementById('notice');
      if(status){status.hidden=false;status.textContent='Dashboard could not load. Reopen this toolkit tab to retry.';}
    });
    return running;
  }
  document.addEventListener('help:panel-changed',event=>{
    if(event.detail?.id==='panel-clan')void activate();
  });
})();
