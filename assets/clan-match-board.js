'use strict';
// Read-only clan match archive rankings. A game shared by two clan members
// counts twice in player observations, once in the unique match count.
// Only server-aggregated, service-role-sanitized numbers reach this script.
(function(root,factory){
  const mod=factory();
  if(typeof module==='object'&&module.exports)module.exports=mod;
  if(root&&root.document)root.ClanMatchBoard=mod;
})(typeof window!=='undefined'?window:globalThis,function(){
  const $=id=>document.getElementById(id);
  // Display-only translation. Keep source map IDs unchanged for API filtering.
  const displayMap=value=>{
    const dictionary=typeof window!=='undefined'?window.PubgReference:null;
    return dictionary?.mapName?dictionary.mapName(value):value;
  };
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  const integer=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
  const fmt=(n,d=0)=>integer(n)===null?'—':n.toLocaleString('en-GB',{maximumFractionDigits:d});
  const pct=n=>integer(n)===null?'—':fmt(n,1)+'%';
  const duration=n=>integer(n)===null?'—':
    Math.floor(n/60)+'m '+String(Math.floor(n%60)).padStart(2,'0')+'s';
  const fields=['games','placed','wins','top10','killsObserved','kills',
    'damageObserved','damage','assistsObserved','assists',
    'knocksObserved','knocks','survivalObserved','survivalSeconds','placementTotal'];
  function aggregate(rows,{map='',mode=''}={}){
    const grouped=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      if(!r||map&&r.map!==map||mode&&r.mode!==mode||
        !['xbox','psn'].includes(r.platform)||!r.name)continue;
      const key=r.platform+':'+r.name.toLowerCase();
      if(!grouped.has(key)){
        const item={key,name:r.name,platform:r.platform,latest:null};
        for(const f of fields)item[f]=0;
        grouped.set(key,item);
      }
      const item=grouped.get(key);
      for(const f of fields)item[f]+=integer(r[f])??0;
      if(typeof r.latest==='string'&&(!item.latest||r.latest>item.latest))
        item.latest=r.latest;
    }
    return [...grouped.values()].map(r=>({
      ...r,winRate:r.placed?100*r.wins/r.placed:null,
      top10Rate:r.placed?100*r.top10/r.placed:null,
      killsPerGame:r.killsObserved?r.kills/r.killsObserved:null,
      damagePerGame:r.damageObserved?r.damage/r.damageObserved:null,
      averageSurvival:r.survivalObserved?r.survivalSeconds/r.survivalObserved:null,
      averagePlacement:r.placed?r.placementTotal/r.placed:null
    }));
  }
  function orderRows(rows,sort='killsPerGame'){
    const field=['games','wins','winRate','top10Rate','killsPerGame',
      'damagePerGame','averageSurvival','latest'].includes(sort)?sort:'killsPerGame';
    return [...rows].sort((a,b)=>{
      const x=field==='latest'?Date.parse(a.latest)||0:integer(a[field]);
      const y=field==='latest'?Date.parse(b.latest)||0:integer(b[field]);
      if(x===null)return y===null?a.name.localeCompare(b.name):1;
      if(y===null)return -1;
      return y-x||b.games-a.games||a.name.localeCompare(b.name);
    });
  }
  function listMaps(rows,mode=''){
    const totals=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      if(mode&&r.mode!==mode)continue;
      totals.set(r.map,(totals.get(r.map)||0)+(integer(r.games)||0));
    }
    return [...totals].map(([name,count])=>({name,count}))
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  }
  function csvCell(v){
    let text=String(v??'');
    if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  }
  function exportCsv(rows,days,map,mode){
    const headers=['periodDays','mapFilter','modeFilter','name','platform',
      'observedGames','knownFinishes','wins','winRatePct','top10RatePct',
      'killsObserved','kills','killsPerObservedMatch','damageObserved',
      'damage','damagePerObservedMatch','survivalObserved',
      'avgSurvivalSeconds','averagePlacement'];
    const cells=r=>[days,displayMap(map||'All maps'),mode||'All modes',r.name,r.platform,
      r.games,r.placed,r.wins,r.winRate,r.top10Rate,r.killsObserved,r.kills,
      r.killsPerGame,r.damageObserved,r.damage,r.damagePerGame,
      r.survivalObserved,r.averageSurvival,r.averagePlacement];
    return [headers.map(csvCell).join(','),...rows.map(r=>cells(r).map(csvCell).join(','))].join('\r\n')+'\r\n';
  }
  const choices=[
    ['games','Recorded player-matches','integer'],
    ['winRate','Win %','percent'],
    ['top10Rate','Top-10 %','percent'],
    ['killsPerGame','Kills / observed match','decimal'],
    ['damagePerGame','Damage / observed match','decimal'],
    ['averageSurvival','Average survival','duration'],
    ['averagePlacement','Average placement','decimal']
  ];
  function showMetric(field,n){
    if(field==='percent')return pct(n);
    if(field==='duration')return duration(n);
    return fmt(n,field==='decimal'?2:0);
  }
  let stored=null,loadedAt=0,pending=null,lastRequest=0,ready=false;
  function render(){
    if(!stored||!$('clan-board-table'))return;
    const all=stored.rows;
    for(const [id,field,allText] of [
      ['clan-board-map','map','All maps'],['clan-board-mode','mode','All modes']]){
      const sel=$(id),current=sel.value;
      const values=[...new Set(all.map(r=>r[field]))].sort((a,b)=>a.localeCompare(b));
      sel.innerHTML='<option value="">'+allText+'</option>'+
        values.map(x=>'<option value="'+esc(x)+'">'+esc(field==='map'?displayMap(x):x)+'</option>').join('');
      sel.value=values.includes(current)?current:'';
    }
    rerender();
  }
  function rerender(){
    if(!stored)return;
    const map=$('clan-board-map').value,mode=$('clan-board-mode').value,
      min=Math.max(1,Number($('clan-board-min').value)||3),
      search=$('clan-board-search').value.trim().toLowerCase();
    const groups=aggregate(stored.rows,{map,mode});
    const sorted=orderRows(groups.filter(r=>r.games>=min&&
      (!search||r.name.toLowerCase().includes(search))),$('clan-board-sort').value);
    const observed=groups.reduce((n,r)=>n+r.games,0);
    const withGames=groups.length;
    const kpis=[
      ['Verified clan players',stored.clanPlayers],
      ['Players with saved matches',withGames],
      ['Player-match observations',observed],
      ['Distinct matches in full window',stored.distinctMatches]
    ];
    $('clan-board-kpis').innerHTML=kpis.map(([label,value])=>
      '<div class="clan-board-kpi"><small>'+esc(label)+'</small><strong>'+
      fmt(value)+'</strong></div>').join('');
    $('clan-board-note').textContent=stored.periodDays+'-day rolling archive · '+
      withGames+' players observed in the selected map/mode · '+sorted.length+
      ' meet the '+min+'-game minimum. Total distinct matches covers the full '+
      stored.periodDays+'-day window before map/mode filtering. One shared game can '+
      'produce multiple player-match observations. Not lifetime or skill-adjusted rankings.';
    $('clan-board-table').innerHTML=sorted.map((r,i)=>
      '<tr><td>'+String(i+1)+'</td><td><button type="button" class="player-button" data-clan-compare="'+
      esc(r.key)+'">'+esc(r.name)+'</button><small class="clan-board-platform">'+
      (r.platform==='xbox'?'Xbox':'PlayStation')+'</small></td>'+
      '<td>'+fmt(r.games)+'</td><td>'+fmt(r.placed)+'</td>'+
      '<td>'+fmt(r.wins)+'</td><td>'+pct(r.winRate)+'</td>'+
      '<td>'+pct(r.top10Rate)+'</td><td>'+fmt(r.killsPerGame,2)+'</td>'+
      '<td>'+fmt(r.damagePerGame,1)+'</td><td>'+duration(r.averageSurvival)+'</td></tr>'
    ).join('')||'<tr><td colspan="10" class="empty">No clan players meet these filters. Reduce the minimum games or choose another map, mode or period.</td></tr>';
    const mapList=listMaps(stored.rows,mode);
    const max=Math.max(1,...mapList.map(x=>x.count));
    $('clan-board-map-bars').innerHTML=mapList.slice(0,12).map(x=>
      '<div class="clan-board-map-row"><span>'+esc(displayMap(x.name))+'</span>'+
      '<div class="clan-board-track"><div data-width="'+
      Math.round(x.count/max*100)+'"></div></div><strong>'+fmt(x.count)+'</strong></div>'
    ).join('')||'<p class="small muted">No archived maps in this period.</p>';
    $('clan-board-map-bars').querySelectorAll('[data-width]').forEach(el=>{
      el.style.width=el.dataset.width+'%';
    });
    const options=groups.sort((a,b)=>a.name.localeCompare(b.name))
      .map(r=>'<option value="'+esc(r.key)+'">'+esc(r.name)+
       ' ('+(r.platform==='xbox'?'Xbox':'PSN')+', '+fmt(r.games)+' games)</option>').join('');
    for(const id of ['clan-board-compare-a','clan-board-compare-b']){
      const sel=$(id),old=sel.value;
      sel.innerHTML=options; if(groups.some(r=>r.key===old))sel.value=old;
    }
    if(groups.length>1&&$('clan-board-compare-a').value===$('clan-board-compare-b').value){
      $('clan-board-compare-b').value=groups.find(x=>x.key!==$('clan-board-compare-a').value).key;
    }
    renderCompare(groups);
    const csv=$('clan-board-export');
    csv.disabled=!sorted.length;
    csv.dataset.rowcount=String(sorted.length);
  }
  function renderCompare(groups){
    if(!groups)groups=aggregate(stored?.rows||[],{
      map:$('clan-board-map').value,mode:$('clan-board-mode').value
    });
    const left=groups.find(x=>x.key===$('clan-board-compare-a').value),
      right=groups.find(x=>x.key===$('clan-board-compare-b').value);
    if(!left||!right||left.key===right.key){
      $('clan-board-compare').innerHTML='<p class="small muted">Choose two different saved clan players to compare their observed records.</p>';
      return;
    }
    $('clan-board-compare').innerHTML='<p class="small muted">'+
      esc(left.name)+' ('+fmt(left.games)+' saved games) vs '+
      esc(right.name)+' ('+fmt(right.games)+' saved games). Unequal and small samples '+
      'are shown, not corrected or used to declare a winner.</p>'+
      '<div class="clan-board-compare-grid">'+choices.map(([key,label,unit])=>
        '<div class="clan-board-pair"><strong>'+esc(showMetric(unit,left[key]))+
        '</strong><span>'+esc(label)+'</span><strong>'+
        esc(showMetric(unit,right[key]))+'</strong></div>').join('')+'</div>';
  }
  async function load(force=false){
    if(!$('clan-board-kpis'))return;
    const days=Number($('clan-board-days').value)||30;
    if(!force&&stored&&stored.periodDays===days&&Date.now()-loadedAt<60000){
      render();return;
    }
    if(pending&&pending.days===days&&!force)return pending.promise;
    const token=++lastRequest;
    $('clan-board-status').textContent='Reading saved '+days+'-day clan match history…';
    $('clan-board-refresh').disabled=true;
    const work=(async()=>{
      try{
        const response=await fetch('/api/public-matches?route=clan-board&days='+days,{
          cache:'no-store',headers:{Accept:'application/json'}
        });
        if(!response.ok)throw Error('History HTTP '+response.status);
        const result=await response.json();
        if(!result||result.schemaVersion!==1||
          result.kind!=='clan-match-board'||!Array.isArray(result.rows))
          throw Error('Invalid saved clan comparison response');
        if(token!==lastRequest)return;
        stored=result;loadedAt=Date.now();
        $('clan-board-status').textContent='Saved comparison ready · '+fmt(result.playerMatchObservations)+
          ' player-match observations across '+fmt(result.distinctMatches)+' unique matches.';
        render();
      }catch(error){
        if(token!==lastRequest)return;
        $('clan-board-status').textContent='Saved clan match comparisons are temporarily unavailable. '+
          'No new PUBG data was requested.';
      }finally{
        if(token===lastRequest){
          $('clan-board-refresh').disabled=false;
          pending=null;
        }
      }
    })();
    pending={days,promise:work};
    return work;
  }
  function init(){
    if(ready||!$('clan-board-kpis'))return;
    ready=true;
    $('clan-board-days').addEventListener('change',()=>load(true));
    $('clan-board-refresh').addEventListener('click',()=>load(true));
    for(const id of ['clan-board-map','clan-board-mode','clan-board-sort',
       'clan-board-min','clan-board-search'])$(id).addEventListener(
       id==='clan-board-search'?'input':'change',rerender);
    for(const id of ['clan-board-compare-a','clan-board-compare-b'])
      $(id).addEventListener('change',()=>renderCompare());
    $('clan-board-table').addEventListener('click',event=>{
      const button=event.target.closest?.('[data-clan-compare]');
      if(!button)return;
      $('clan-board-compare-a').value=button.dataset.clanCompare;
      const second=$('clan-board-compare-b');
      if(second.value===button.dataset.clanCompare){
        const alternative=[...second.options].find(x=>x.value!==button.dataset.clanCompare);
        if(alternative)second.value=alternative.value;
      }
      renderCompare();
      $('clan-board-compare-panel').scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('clan-board-export').addEventListener('click',()=>{
      if(!stored)return;
      const map=$('clan-board-map').value,mode=$('clan-board-mode').value,
        min=Number($('clan-board-min').value)||3,
        needle=$('clan-board-search').value.trim().toLowerCase();
      const selected=orderRows(aggregate(stored.rows,{map,mode}).filter(r=>
        r.games>=min&&(!needle||r.name.toLowerCase().includes(needle))),
        $('clan-board-sort').value);
      if(!selected.length)return;
      const csv=exportCsv(selected,stored.periodDays,map,mode);
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;
      a.download='pubg-clan-saved-matches-'+stored.periodDays+'d.csv';
      a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
    });
  }
  return{aggregate,orderRows,listMaps,exportCsv,init,load,render,rerender,
    duration,pct};
});
