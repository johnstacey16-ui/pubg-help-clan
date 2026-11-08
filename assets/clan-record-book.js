'use strict';
// Lightweight, archive-only clan record book. No PUBG or telemetry downloads,
// charts, background polling, identifiers or external libraries.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document)root.ClanRecordBook=api;
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
 const categories=Object.freeze([
  {key:'kills',label:'Most kills',unit:'count'},
  {key:'damage',label:'Highest damage',unit:'damage'},
  {key:'headshots',label:'Most headshots',unit:'count'},
  {key:'assists',label:'Most assists',unit:'count'},
  {key:'knocks',label:'Most knocks',unit:'count'},
  {key:'revives',label:'Most revives',unit:'count'},
  {key:'longestKillMeters',label:'Longest kill',unit:'meters'},
  {key:'timeSurvivedSeconds',label:'Longest survival',unit:'duration'},
  {key:'roadKills',label:'Most road kills',unit:'count'},
  {key:'vehicleDestroys',label:'Vehicles destroyed',unit:'count'}
 ]);
 const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 const fmt=(n,d=0)=>num(n)===null?'—':n.toLocaleString('en-GB',{
  maximumFractionDigits:d
 });
 function value(n,unit){
  if(num(n)===null)return '—';
  if(unit==='duration'){
   const s=Math.floor(n);
   return Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';
  }
  if(unit==='meters')return fmt(n,1)+' m';
  return fmt(n,unit==='damage'?1:0);
 }
 function collect(records,metric){
  return (Array.isArray(records)?records:[]).filter(r=>
    r?.metric===metric&&num(r.value)!==null&&r.value>0&&
    typeof r.name==='string'&&typeof r.rank==='number')
   .sort((a,b)=>a.rank-b.rank).slice(0,5);
 }
 function summarize(data){
  const coverage=new Map((Array.isArray(data?.coverage)?data.coverage:[])
   .filter(c=>c&&typeof c.metric==='string').map(c=>[c.metric,c.observed]));
  return categories.map(category=>{
   const top=collect(data?.records,category.key);
   return{...category,observed:coverage.get(category.key)??0,
    leader:top[0]||null,leaders:top};
  });
 }
 let cache=new Map(),generation=0,ready=false;
 function render(data){
  if(!data||!$('clan-record-metrics'))return;
  const metrics=summarize(data);
  const picked=$('clan-record-metric').value;
  const chosen=metrics.find(m=>m.key===picked)||metrics[0];
  $('clan-record-kpis').innerHTML=[
   ['Verified clan players',data.verifiedPlayers],
   ['Players with saved matches',data.observedPlayers],
   ['Player-match observations',data.playerMatchObservations],
   ['Distinct saved games',data.distinctMatches]
  ].map(([label,number])=>'<div class="clan-record-kpi"><small>'+
   esc(label)+'</small><strong>'+fmt(number)+'</strong></div>').join('');
  $('clan-record-metrics').innerHTML=metrics.map(m=>
   '<button type="button" class="clan-record-pick'+
    (m.key===chosen.key?' selected':'')+'" data-record-metric="'+esc(m.key)+
    '" aria-pressed="'+String(m.key===chosen.key)+'">'+
    '<small>'+esc(m.label)+'</small><strong>'+
    (m.leader?esc(value(m.leader.value,m.unit)):'—')+'</strong>'+
    '<span>'+(m.leader?esc(m.leader.name):'No positive record')+'</span>'+
    '</button>'
  ).join('');
  $('clan-record-description').textContent='Top five distinct clan players’ best single games for '+
   chosen.label.toLowerCase()+', from the saved '+data.periodDays+
   '-day archive. '+fmt(chosen.observed)+' player-match records contain this official '+
   'statistic (including genuine zeros). This is not a career high or global ranking.';
  $('clan-record-table').innerHTML=chosen.leaders.map(r=>
   '<tr><td>'+fmt(r.rank)+'</td>'+
   '<td><button type="button" class="player-button" data-profile="'+
   esc(r.name)+'">'+esc(r.name)+'</button><small class="clan-record-platform">'+
   (r.platform==='xbox'?'Xbox':'PlayStation')+'</small></td>'+
   '<td><strong>'+esc(value(r.value,chosen.unit))+'</strong></td>'+
   '<td>'+esc(displayMap(r.map))+'</td><td>'+esc(r.mode)+'</td>'+
   '<td>'+esc(new Date(r.playedAt).toLocaleDateString('en-GB',{
    year:'numeric',month:'short',day:'numeric',timeZone:'UTC'
   }))+'</td></tr>'
  ).join('')||'<tr><td colspan="6" class="empty">No observed positive '+
    esc(chosen.label.toLowerCase())+' record in these archived matches.</td></tr>';
 }
 async function load(force=false){
  if(!$('clan-record-metrics'))return;
  const days=Number($('clan-record-days').value)||30;
  const previous=cache.get(days);
  if(!force&&previous&&Date.now()-previous.storedAt<90000){
   $('clan-record-status').textContent='Read-only saved PUBG record book ready. '+
    fmt(previous.data.distinctMatches)+' distinct saved games in '+days+
    ' days. No PUBG API calls (browser-cached).';
   render(previous.data);return;
  }
  const token=++generation;
  $('clan-record-reload').disabled=true;
  $('clan-record-status').textContent='Reading saved '+days+'-day clan match records…';
  try{
   const response=await fetch('/api/public-matches?route=clan-records&days='+days,
    {cache:'no-store',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Record archive unavailable');
   const body=await response.json();
   if(body.schemaVersion!==1||body.kind!=='clan-match-records'||
     body.periodDays!==days||!Array.isArray(body.records)||
     !Array.isArray(body.coverage))throw Error('Unexpected match archive');
   if(token!==generation)return;
   cache.set(days,{data:body,storedAt:Date.now()});
   $('clan-record-status').textContent='Read-only saved PUBG record book ready. '+
    fmt(body.distinctMatches)+' distinct saved games in '+days+' days. No PUBG API calls.';
   render(body);
  }catch(error){
   if(token!==generation)return;
   $('clan-record-status').textContent=
    'Saved match record book is temporarily unavailable. No PUBG refresh was attempted.';
  }finally{
   if(token===generation)$('clan-record-reload').disabled=false;
  }
 }
 function init(){
  if(ready||!$('clan-record-metric'))return;
  ready=true;
  $('clan-record-metric').innerHTML=categories.map(x=>
   '<option value="'+x.key+'">'+esc(x.label)+'</option>').join('');
  $('clan-record-days').addEventListener('change',()=>load());
  $('clan-record-reload').addEventListener('click',()=>load(true));
  $('clan-record-metric').addEventListener('change',()=>{
   const item=cache.get(Number($('clan-record-days').value));
   if(item)render(item.data);
  });
  $('clan-record-metrics').addEventListener('click',event=>{
   const button=event.target.closest?.('[data-record-metric]');
   if(!button)return;
   $('clan-record-metric').value=button.dataset.recordMetric;
   const item=cache.get(Number($('clan-record-days').value));
   if(item)render(item.data);
  });
 }
 return{categories,collect,summarize,value,init,load,render};
});
