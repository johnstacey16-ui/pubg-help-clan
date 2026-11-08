'use strict';
// Source-only PUBG combat/event analysis. No 2D replay or position tracking.
(function(){
 const $=id=>document.getElementById(id);
 // Display-only translation. Keep source map IDs unchanged for API filtering.
 const displayMap=value=>{
   const dictionary=typeof window!=='undefined'?window.PubgReference:null;
   return dictionary?.mapName?dictionary.mapName(value):value;
 };
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 })[c]);
 const n=v=>typeof v==='number'&&Number.isFinite(v)?
  v.toLocaleString('en-GB',{maximumFractionDigits:2}):'—';
 let person=null,matches=[],report=null;
 let eventPage=0,rivalsRequest=0,rivalDetailRequest=0;
 let rivalData=null;
 function matchesChanged(name,items){
  person=name;matches=Array.isArray(items)?items.filter(m=>
   typeof m.id==='string'&&/^[\da-f-]{36}$/i.test(m.id)):[];
  report=null;
  const select=$('telemetry-match'),previous=select.value;
  select.innerHTML=matches.map(m=>
   '<option value="'+escape(m.id)+'">'+escape(displayMap(m.map||'Unknown map'))+
   ' · '+escape(m.playedAt||'saved match')+' · '+escape(m.id.slice(0,8))+'</option>'
  ).join('');
  if(matches.some(m=>m.id===previous))select.value=previous;
  else select.value=matches[0]?.id||'';
  $('telemetry-load').disabled=!matches.length;
  $('telemetry-status').textContent=matches.length?
   'Select a saved match, then analyse its real telemetry. First retrieval uses the shared web cooldown; saved analyses reuse Supabase.':
   'No detailed saved matches for this player yet. Refresh recent matches first.';
  $('telemetry-report').innerHTML='';
  $('telemetry-event-list').innerHTML='';
  $('telemetry-event-count').textContent='Load real match telemetry to explore events.';
  rivalData=null;rivalDetailRequest++;
  $('telemetry-rivals-table').innerHTML='';
  $('telemetry-rivals-count').textContent='No saved rival report loaded.';
  $('telemetry-rival-detail').innerHTML='<p class="small muted">Select a visible opponent to inspect observed encounters.</p>';
  $('telemetry-rivals-note').textContent='Select a player and read previously analysed matches.';
  $('telemetry-rivals-refresh').disabled=!person;
  rivalsRequest++;
 }
 function renderEventBrowser(){
  const events=Array.isArray(report?.playerEvents)?report.playerEvents:[];
  const kind=$('telemetry-event-type').value;
  const search=$('telemetry-event-search').value.trim().toLowerCase();
  const filtered=events.filter(row=>
   (!kind||row.type===kind)&&
   (!search||[row.type,row.actor,row.subject,row.sourceIndex,row.timestamp].some(value=>
    String(value??'').toLowerCase().includes(search))));
  const size=40,pages=Math.max(1,Math.ceil(filtered.length/size));
  eventPage=Math.min(Math.max(0,eventPage),pages-1);
  $('telemetry-event-prev').disabled=eventPage===0;
  $('telemetry-event-next').disabled=eventPage>=pages-1;
  const coverage=report?.activityCoverage;
  $('telemetry-event-count').textContent=filtered.length+' matching player events · '+
   'page '+(eventPage+1)+' of '+pages+' · '+
   (coverage?(coverage.returned||events.length)+' of '+coverage.observed+
    ' meaningful events retained'+(coverage.truncated?' (bounded sample)':''):
    events.length+' stored event rows (older saved report)')+
   ' · '+(report?.sourceEvents||0)+' total PUBG match source events.';
  $('telemetry-event-list').innerHTML=filtered.slice(eventPage*size,(eventPage+1)*size)
   .map(row=>{
    return '<tr><td>'+n(row.sourceIndex)+'</td><td>'+escape(row.timestamp||'—')+
     '</td><td>'+escape(row.type)+'</td><td>'+escape(row.actor)+'</td><td>'+
     escape(row.subject)+'</td><td>'+n(row.damage)+'</td></tr>';
   }).join('')||'<tr><td colspan="6">No real event rows match this filter.</td></tr>';
 }
 function exportEvents(){
  if(!report)return;
  const payload={
   matchId:report.matchId,player:report.player,
   source:'Sanitized selected-player event references from a genuine PUBG match',
   activityCoverage:report.activityCoverage||null,
   events:Array.isArray(report.playerEvents)?report.playerEvents:[]
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  try{
   const a=document.createElement('a');
   a.href=url;a.download='pubg-player-events-'+String(report.matchId||'match').slice(0,36)+'.json';
   a.click();
  }finally{URL.revokeObjectURL(url);}
 }
 function rivalsParams(opponent){
  const params=new URLSearchParams({name:person,route:'rivals'});
  const days=$('telemetry-rivals-days').value||'0';
  if(days!=='0')params.set('days',days);
  const map=$('telemetry-rivals-map').value,mode=$('telemetry-rivals-mode').value;
  if(map)params.set('map',map);
  if(mode)params.set('mode',mode);
  if(opponent)params.set('opponent',opponent);
  return params;
 }
 function dateLabel(date){
  return typeof date==='string'&&Number.isFinite(Date.parse(date))?
   new Date(date).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):
   'Date unavailable';
 }
 function rivalOptions(id,values,fallback){
  const select=$(id),old=select.value;
  const labels=Array.isArray(values)?values.filter(v=>
   typeof v==='string'&&v.trim()&&v.length<=100):[];
  select.innerHTML='<option value="">'+fallback+'</option>'+
   labels.map(v=>'<option value="'+escape(v)+'">'+escape(id==='telemetry-rivals-map'?displayMap(v):v)+'</option>').join('');
  select.value=old&&labels.includes(old)?old:'';
 }
 function renderRivalRows(){
  if(!rivalData)return;
  const search=String($('telemetry-rivals-search').value||'').toLowerCase().trim(),
   order=$('telemetry-rivals-sort').value;
  const list=(rivalData.rivals||[]).filter(row=>
   typeof row.name==='string'&&row.name.toLowerCase().includes(search))
   .slice().sort((a,b)=>{
    const metric=row=>order==='matches'?row.matchesSampled:
     order==='kills'?row.kills:order==='deaths'?row.deaths:
     order==='damage'?row.damageDealt:order==='latest'?
     (Number.isFinite(Date.parse(row.lastMatchAt))?Date.parse(row.lastMatchAt):null):
     ((Number(row.kills)||0)+(Number(row.deaths)||0));
    const left=metric(a),right=metric(b);
    return (right===null?-1:right)-(left===null?-1:left)||
     (b.matchesSampled||0)-(a.matchesSampled||0)||a.name.localeCompare(b.name);
   });
  $('telemetry-rivals-count').textContent=list.length+' visible name group(s) shown · '+
   rivalData.opponentNames+' observed in the filtered reports · '+
   rivalData.matchesAnalysed+' of '+rivalData.matchesScanned+
   ' previously analysed matches included. Up to 80 names are returned; search applies to those 80.';
  $('telemetry-rivals-table').innerHTML=list.map(row=>
   '<tr><td><button class="rival-detail-open" type="button" data-rival-name="'+
   escape(row.name)+'">'+escape(row.name)+'</button></td>'+
   '<td>'+n(row.matchesSampled)+'</td><td>'+n(row.kills)+'</td>'+
   '<td>'+n(row.deaths)+'</td><td>'+
   n(row.damageDealt)+(row.damageDealtObserved!==undefined?
    '<small class="rival-observed">n='+n(row.damageDealtObserved)+'</small>':'')+'</td><td>'+
   n(row.damageTaken)+(row.damageTakenObserved!==undefined?
    '<small class="rival-observed">n='+n(row.damageTakenObserved)+'</small>':'')+'</td>'+
   '<td>'+escape(dateLabel(row.lastMatchAt))+'</td></tr>'
  ).join('')||'<tr><td colspan="7">No saved opponent names match these filters. Analyse a genuine match first or widen the selection.</td></tr>';
 }
 async function readRivals(){
  if(!person)return;
  const request=++rivalsRequest,selectedName=person;
  rivalDetailRequest++;
  const button=$('telemetry-rivals-refresh');
  button.disabled=true;
  $('telemetry-rivals-note').textContent='Reading previously analysed match reports…';
  $('telemetry-rival-detail').innerHTML='<p class="small muted">Choose an observed opponent after the report loads.</p>';
  try{
   const response=await fetch('/api/public-matches?'+rivalsParams().toString(),
    {cache:'no-store',headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok||data.schemaVersion!==2||!Array.isArray(data.rivals))
    throw Error(data.error||'Saved rival reports unavailable');
   if(request!==rivalsRequest||selectedName!==person)return;
   rivalData=data;
   rivalOptions('telemetry-rivals-map',data.mapOptions,'All recorded maps');
   rivalOptions('telemetry-rivals-mode',data.modeOptions,'All recorded modes');
   const context=data.filterDays?'Last '+data.filterDays+' days':'All saved dates';
   $('telemetry-rivals-note').textContent=context+
    ' · '+data.matchesAnalysed+' distinct analysed matches included'+
    (data.undatedMatches?' · '+data.undatedMatches+' missing valid event dates':'')+
    '. Names are visible labels only; matching names do not establish the same PUBG account.';
   renderRivalRows();
  }catch(error){
   if(request!==rivalsRequest)return;
   rivalData=null;
   $('telemetry-rivals-note').textContent='Rival reports unavailable: '+error.message;
   $('telemetry-rivals-table').innerHTML='';
   $('telemetry-rivals-count').textContent='No saved rival report available.';
  }finally{
   if(request===rivalsRequest)button.disabled=false;
  }
 }
 async function readRivalDetail(opponent){
  if(!rivalData||!person||typeof opponent!=='string'||!opponent)return;
  const request=++rivalDetailRequest,selectedName=person,box=$('telemetry-rival-detail');
  box.innerHTML='<p class="small muted">Reading recorded encounters for '+escape(opponent)+'…</p>';
  try{
   const response=await fetch('/api/public-matches?'+rivalsParams(opponent).toString(),
    {cache:'no-store',headers:{Accept:'application/json'}});
   const data=await response.json();
   if(!response.ok||data.schemaVersion!==2||!Array.isArray(data.encounters))
    throw Error(data.error||'Saved encounters unavailable');
   if(request!==rivalDetailRequest||selectedName!==person)return;
   box.innerHTML='<h4>Observed encounters · '+escape(opponent)+'</h4>'+
    '<p class="small muted">'+n(data.encountersReturned)+' of '+
    n(data.encountersAvailable)+' matching saved reports displayed (up to 30). '+
    'Names are not verified account identities. Missing damage is unavailable, not zero.</p>'+
    '<div class="scroll-table"><table><thead><tr>'+
    '<th>ACTUAL MATCH DATE</th><th>MAP</th><th>MODE</th><th>YOU KILLED</th>'+
    '<th>THEY KILLED YOU</th><th>DAMAGE DEALT</th><th>DAMAGE TAKEN</th>'+
    '</tr></thead><tbody>'+
    data.encounters.map(m=>'<tr><td>'+escape(dateLabel(m.playedAt))+
     '</td><td>'+escape(displayMap(m.map))+'</td><td>'+escape(m.mode)+
     '</td><td>'+n(m.kills)+'</td><td>'+n(m.deaths)+
     '</td><td>'+n(m.damageDealt)+'</td><td>'+n(m.damageTaken)+'</td></tr>'
    ).join('')+'</tbody></table></div>';
  }catch(error){
   if(request!==rivalDetailRequest)return;
   box.textContent='Saved opponent encounter details unavailable: '+error.message;
  }
 }

 function render(){
  if(!report)return;
  const summary=report.combatSummary||{},rows=report.rivals||[];
  $('telemetry-report').innerHTML='<div class="stats cc-telemetry-stats">'+
   [['Kills (sampled)',summary.kills],['Deaths (sampled)',summary.deaths],
    ['Damage dealt (sampled)',summary.damageDealt],['Damage taken (sampled)',summary.damageTaken],
    ['Knocks (sampled)',summary.knocks],['Revives (sampled)',summary.revives]
   ].map(([title,value])=>'<div class="card metric"><small>'+escape(title)+
    '</small><strong>'+n(value)+'</strong></div>').join('')+'</div>'+
   '<h3>Confirmed opponents in this match</h3>'+
   '<div class="scroll-table"><table><thead><tr><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>DAMAGE DEALT</th><th>DAMAGE TAKEN</th></tr></thead><tbody>'+
   (rows.map(x=>'<tr><td>'+escape(x.name)+'</td><td>'+n(x.kills)+'</td><td>'+
    n(x.deaths)+'</td><td>'+n(x.damageDealt)+'</td><td>'+n(x.damageTaken)+
    '</td></tr>').join('')||'<tr><td colspan="5">No attributable opponents in this telemetry sample.</td></tr>')+
   '</tbody></table></div>'+
   '<details><summary>Weapon damage in this match</summary>'+
   '<div class="scroll-table"><table><thead><tr><th>WEAPON / CAUSE</th><th>DAMAGE</th></tr></thead><tbody>'+
   (report.weapons||[]).map(x=>'<tr><td>'+escape(x.name)+'</td><td>'+n(x.damage)+'</td></tr>').join('')+
   '</tbody></table></div></details>'+

   '<p class="small muted">'+escape(report.note)+'</p>';
  $('telemetry-event-type').innerHTML='<option value="">All recorded player events</option>'+
   [...new Set((report.playerEvents||[]).map(e=>e.type))].sort().map(type=>
    '<option value="'+escape(type)+'">'+escape(type)+'</option>').join('');
  $('telemetry-event-search').value='';eventPage=0;
  renderEventBrowser();
 }
 async function load(){
  if(!person||!$('telemetry-match').value)return;
  $('telemetry-load').disabled=true;
  $('telemetry-status').textContent='Reading real PUBG telemetry or a stored analysis…';
  $('telemetry-report').innerHTML='';
  try{
   const params=new URLSearchParams({name:person,match:$('telemetry-match').value,route:'telemetry'});
   const res=await fetch('/api/public-telemetry?'+params.toString(),{cache:'no-store'});
   const body=await res.json();
   if(!res.ok)throw Error((body.error||'Telemetry unavailable')+
    (body.retryAfterSeconds?' · Retry after '+body.retryAfterSeconds+'s':''));
   if(body.schemaVersion!==1||!Array.isArray(body.playerEvents)||!Array.isArray(body.rivals))
    throw Error('Unexpected telemetry analysis');
   report=body;render();
   $('telemetry-status').textContent='Actual '+n(body.sourceEvents)+
    ' PUBG events from '+n(body.playerEvents?.length||0)+
    ' saved player activity references · '+body.cache+' derived report · '+
    (body.analysedAt||'')+
    '. Player and opponent values are match-local, without playback or 2D position tracking.';
  }catch(error){
   report=null;
   $('telemetry-status').textContent=error.message;
  }finally{$('telemetry-load').disabled=false;}
 }
 function init(){
  $('telemetry-load').addEventListener('click',load);
  $('telemetry-rivals-refresh').addEventListener('click',readRivals);
  ['telemetry-rivals-days','telemetry-rivals-map','telemetry-rivals-mode']
   .forEach(id=>$(id).addEventListener('change',readRivals));
  $('telemetry-rivals-search').addEventListener('input',renderRivalRows);
  $('telemetry-rivals-sort').addEventListener('change',renderRivalRows);
  $('telemetry-rivals-table').addEventListener('click',event=>{
   const target=event.target.closest?.('[data-rival-name]');
   if(target)void readRivalDetail(target.dataset.rivalName);
  });
  $('telemetry-event-type').addEventListener('change',function(){eventPage=0;renderEventBrowser();});
  $('telemetry-event-search').addEventListener('input',function(){eventPage=0;renderEventBrowser();});
  $('telemetry-event-prev').addEventListener('click',function(){eventPage--;renderEventBrowser();});
  $('telemetry-event-next').addEventListener('click',function(){eventPage++;renderEventBrowser();});
  $('telemetry-event-export').addEventListener('click',exportEvents);
 }
 init();
 window.TelemetryView={matchesChanged,renderForTest:data=>{report=data;render();},
  renderEventBrowser};
})();
