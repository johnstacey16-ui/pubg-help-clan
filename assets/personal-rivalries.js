'use strict';
// A fast, player-first view of confirmed kills already present in saved PUBG
// telemetry analyses. This never fetches raw telemetry or the PUBG API.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){
  root.PersonalRivalries=api;
  api.init();
 }
})(typeof window!=='undefined'?window:globalThis,function(){
 const $=id=>document.getElementById(id);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 const num=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 const fmt=n=>num(n)===null?'—':n.toLocaleString('en-GB');
 const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?
  new Date(v).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';
 let player=null,data=null,requestId=0,detailId=0;
 function eligible(rows){
  return (Array.isArray(rows)?rows:[]).filter(r=>
   typeof r?.name==='string'&&r.name.length<=90&&
   (num(r.kills)>0||num(r.deaths)>0));
 }
 function leaders(rows){
  const valid=eligible(rows);
  const top=metric=>valid.slice().sort((a,b)=>
   (num(b[metric])??0)-(num(a[metric])??0)||
   (num(b.matchesSampled)??0)-(num(a.matchesSampled)??0)||
   a.name.localeCompare(b.name))[0]||null;
  const killed=valid.filter(r=>num(r.kills)>0);
  const killedBy=valid.filter(r=>num(r.deaths)>0);
  return {mostKilled:killed.length?top('kills'):null,
   mostKilledBy:killedBy.length?top('deaths'):null};
 }
 function visible(rows,query='',sort='kills'){
  const q=String(query).toLowerCase().trim();
  const valid=eligible(rows).filter(r=>r.name.toLowerCase().includes(q));
  const metric=r=>sort==='deaths'?(num(r.deaths)??0):
   sort==='trades'?(num(r.kills)??0)+(num(r.deaths)??0):(num(r.kills)??0);
  return valid.sort((a,b)=>metric(b)-metric(a)||
   (num(b.matchesSampled)??0)-(num(a.matchesSampled)??0)||
   a.name.localeCompare(b.name));
 }
 function parameters(opponent){
  const params=new URLSearchParams({route:'rivals',name:player});
  const days=$('personal-rivals-days').value;
  if(days&&days!=='0')params.set('days',days);
  if(opponent)params.set('opponent',opponent);
  return params;
 }
 function setPlayer(name){
  const selected=typeof name==='string'&&name.trim()?name:null;
  if(selected!==player){player=selected;data=null;requestId++;detailId++;}
  if(!$('personal-rivals-player'))return;
  $('personal-rivals-player').textContent=player||'Choose a saved player above';
  $('personal-rivals-load').disabled=!player;
  if(!data){
   $('personal-rivals-highlights').innerHTML='';
   $('personal-rivals-table').innerHTML='';
   $('personal-rivals-detail').innerHTML='';
   $('personal-rivals-count').textContent='No rivalry records loaded.';
   $('personal-rivals-status').textContent=player?
    'Select Show kill rivalries to read previously analysed matches for '+player+'.':
    'Select a saved player above first.';
  }
 }
 function highlight(title,entry,metric){
  return '<div class="personal-rivals-card"><small>'+escape(title)+'</small>'+
   (entry?'<strong>'+escape(entry.name)+'</strong><b>'+fmt(entry[metric])+
    ' confirmed kills</b><span>Across '+fmt(entry.matchesSampled)+
    ' recorded match(es) involving this name</span>':
    '<strong>Not enough recorded fights</strong><span>No attributable player kills in saved analyses.</span>')+
   '</div>';
 }
 function paint(){
  if(!data)return;
  const all=eligible(data.rivals),ranked=visible(all,
   $('personal-rivals-search').value,$('personal-rivals-sort').value);
  const winner=data.killLeaders||leaders(all);
  $('personal-rivals-highlights').innerHTML=
   highlight('Who you have killed most',winner.mostKilled,'kills')+
   highlight('Who has killed you most',winner.mostKilledBy,'deaths');
  $('personal-rivals-count').textContent=ranked.length+' of '+all.length+
   ' recorded opponent name groups shown · '+fmt(data.matchesAnalysed)+
   ' analysed match(es) in this period.';
  $('personal-rivals-table').innerHTML=ranked.map(r=>{
   const kills=num(r.kills)??0,deaths=num(r.deaths)??0,diff=kills-deaths;
   return '<tr><td><button type="button" class="personal-rivals-name" data-rival="'+
    escape(r.name)+'">'+escape(r.name)+'</button></td><td>'+fmt(kills)+
    '</td><td>'+fmt(deaths)+'</td><td>'+ (diff>0?'+':'')+diff+
    '</td><td>'+fmt(r.matchesSampled)+'</td></tr>';
  }).join('')||'<tr><td colspan="5">No recorded direct player kills match these filters.</td></tr>';
 }
 async function load(){
  if(!player)return;
  const request=++requestId,selected=player;
  detailId++;data=null;
  $('personal-rivals-load').disabled=true;
  $('personal-rivals-status').textContent='Reading saved combat analyses…';
  $('personal-rivals-highlights').innerHTML='';
  $('personal-rivals-table').innerHTML='';
  $('personal-rivals-detail').innerHTML='';
  try{
   const response=await fetch('/api/public-matches?'+parameters().toString(),{
    cache:'no-store',headers:{Accept:'application/json'}});
   const body=await response.json();
   if(!response.ok||body.schemaVersion!==2||!Array.isArray(body.rivals))
    throw Error(body.error||'Saved kill rivalries unavailable');
   if(request!==requestId||selected!==player)return;
   data=body;
   $('personal-rivals-status').textContent=
    fmt(body.matchesAnalysed)+' of '+fmt(body.matchesScanned)+
    ' saved combat analyses included. These are confirmed recorded kills, not lifetime totals. '+
    (body.matchesAnalysed===0?
     'Analyse a saved match using the button below to start collecting evidence.':
     'Select an opponent to see the actual match results.');
   paint();
  }catch(error){
   if(request!==requestId||selected!==player)return;
   $('personal-rivals-status').textContent='Could not read saved rivalry reports: '+error.message;
   $('personal-rivals-count').textContent='No rivalry data available.';
  }finally{
   if(request===requestId)$('personal-rivals-load').disabled=!player;
  }
 }
 async function detail(opponent){
  if(!player||!data||typeof opponent!=='string')return;
  const request=++detailId,selected=player,box=$('personal-rivals-detail');
  box.textContent='Reading confirmed fights with '+opponent+'…';
  try{
   const response=await fetch('/api/public-matches?'+parameters(opponent).toString(),{
    cache:'no-store',headers:{Accept:'application/json'}});
   const body=await response.json();
   if(!response.ok||body.schemaVersion!==2||!Array.isArray(body.encounters))
    throw Error(body.error||'Saved match details unavailable');
   if(request!==detailId||selected!==player)return;
   const fights=body.encounters.filter(m=>num(m.kills)>0||num(m.deaths)>0);
   box.innerHTML='<h3>Recorded fights with '+escape(opponent)+'</h3>'+
    '<p class="small muted">Showing '+fights.length+' match(es) with direct kill events among '+
    fmt(body.encountersReturned)+' returned appearances. Up to 30 source matches can appear in this breakdown. Counts are only for saved telemetry.</p>'+
    '<div class="scroll-table"><table><thead><tr><th>DATE</th><th>MAP</th>'+
    '<th>MODE</th><th>YOU KILLED THEM</th><th>THEY KILLED YOU</th></tr></thead><tbody>'+
    (fights.map(m=>'<tr><td>'+escape(date(m.playedAt))+'</td><td>'+
     escape(m.map)+'</td><td>'+escape(m.mode)+'</td><td>'+
     fmt(m.kills)+'</td><td>'+fmt(m.deaths)+'</td></tr>').join('')||
     '<tr><td colspan="5">No confirmed kills are present in the returned matches.</td></tr>')+
    '</tbody></table></div>';
  }catch(error){
   if(request===detailId)box.textContent='Could not read rivalry match details: '+error.message;
  }
 }
 function init(){
  if(!$('personal-rivals-panel'))return;
  $('personal-rivals-load').addEventListener('click',load);
  $('personal-rivals-days').addEventListener('change',()=>{if(player&&data)void load();});
  $('personal-rivals-sort').addEventListener('change',paint);
  $('personal-rivals-search').addEventListener('input',paint);
  $('personal-rivals-table').addEventListener('click',event=>{
   const button=event.target.closest?.('[data-rival]');
   if(button)void detail(button.dataset.rival);
  });
  $('personal-rivals-analyse').addEventListener('click',()=>{
   const box=$('telemetry-opt-in');
   if(!box)return;
   box.open=true;box.scrollIntoView?.({behavior:'smooth',block:'start'});
  });
  setPlayer(null);
 }
 return{init,setPlayer,load,detail,leaders,visible,eligible};
});
