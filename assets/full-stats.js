'use strict';
// Official numeric mode fields: https://github.com/pubg/api-documentation-content/blob/master/swagger/en/schemas/gameModeStats.yml
(function(root,make){
 const api=make();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root&&root.document){root.FullPubgStats=api;api.init();}
})(typeof window!=='undefined'?window:globalThis,function(){
 const MODES=['solo','duo','squad','solo-fpp','duo-fpp','squad-fpp'];
 // PUBG key, display name, group, aggregation across modes, display unit, definition
 const FIELDS=Object.freeze([
 ['kills','Kills','Combat','sum','count','Enemy players killed'],
 ['headshotKills','Headshot kills','Combat','sum','count','Enemies killed by headshots'],
 ['assists','Assists','Combat','sum','count','Enemies damaged who were killed by teammates'],
 ['damageDealt','Damage dealt','Combat','sum','number','Damage excluding self-inflicted damage'],
 ['dBNOs','Knockdowns (DBNO)','Combat','sum','count','Enemies knocked down'],
 ['longestKill','Longest kill','Combat','max','meters','Farthest recorded kill'],
 ['roundMostKills','Most kills in one match','Combat','max','count','Highest kills in a single match'],
 ['maxKillStreaks','Maximum kill streak','Combat','max','count','Highest recorded kill streak'],
 ['roadKills','Road kills','Combat','sum','count','Vehicle kills'],
 ['roundsPlayed','Matches played','Survival','sum','count','Rounds in this game mode'],
 ['wins','Wins','Survival','sum','count','Victory finishes'],
 ['losses','Losses','Survival','sum','count','Defeats'],
 ['top10s','Top 10 finishes','Survival','sum','count','Matches finished in the Top 10'],
 ['revives','Teammate revives','Survival','sum','count','Teammates revived'],
 ['timeSurvived','Total time survived','Survival','sum','seconds','Accumulated survival time'],
 ['longestTimeSurvived','Longest time survived','Survival','max','seconds','Longest survival time in a match'],
 ['mostSurvivalTime','Most survival time','Survival','max','seconds','Additional survival maximum reported by PUBG'],
 ['suicides','Suicides','Survival','sum','count','Self-inflicted deaths'],
 ['teamKills','Team kills','Survival','sum','count','Teammates killed'],
 ['walkDistance','Distance walked','Movement','sum','meters','Distance travelled on foot'],
 ['rideDistance','Distance driven','Movement','sum','meters','Distance travelled in vehicles'],
 ['swimDistance','Distance swum','Movement','sum','meters','Distance travelled swimming'],
 ['heals','Healing items used','Equipment','sum','count','Healing items used'],
 ['boosts','Boost items used','Equipment','sum','count','Boost items used'],
 ['vehicleDestroys','Vehicles destroyed','Equipment','sum','count','Vehicles destroyed'],
 ['weaponsAcquired','Weapons acquired','Equipment','sum','count','Weapons picked up'],
 ['dailyKills','Recent-day kills','Recent activity','single','count','Kills on the most recent day played in this mode'],
 ['dailyWins','Recent-day wins','Recent activity','single','count','Wins on the most recent day played in this mode'],
 ['weeklyKills','Recent-week kills','Recent activity','single','count','Kills in the most recent week played in this mode'],
 ['weeklyWins','Recent-week wins','Recent activity','single','count','Wins in the most recent week played in this mode'],
 ['days','Days (PUBG field)','Other','single','count','PUBG does not document this field precisely']
 ].map(r=>Object.freeze({key:r[0],label:r[1],group:r[2],aggregate:r[3],unit:r[4],description:r[5]})));
 const GROUPS=['Combat','Survival','Movement','Equipment','Recent activity','Other'];
 const byKey=Object.fromEntries(FIELDS.map(f=>[f.key,f]));
 let players=[],selected=null,ready=false;
 // Display names can collide across consoles. No PUBG account IDs reach the DOM.
 const optionValue=(p,list)=>list.some(x=>x!==p&&x.name.toLowerCase()===p.name.toLowerCase())
  ?JSON.stringify([p.platform,p.name]):p.name;
 const el=id=>document.getElementById(id);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function numeric(x){
  if(x==null||x===''||(typeof x!=='string'&&typeof x!=='number'))return null;
  const n=Number(x);return Number.isFinite(n)&&n>=0&&n<=1e12?n:null;
 }
 function metricValue(p,mode,field){
  if(!p?.modes||!field)return null;
  if(mode!=='all')return numeric(p.modes[mode]?.[field.key]);
  if(field.aggregate==='single')return null;
  const values=MODES.map(m=>numeric(p.modes[m]?.[field.key])).filter(n=>n!==null);
  if(!values.length)return null;
  return field.aggregate==='max'?Math.max(...values):values.reduce((a,b)=>a+b,0);
 }
 function derived(p,mode){
  const get=key=>metricValue(p,mode,byKey[key]);
  const matches=get('roundsPlayed'),kills=get('kills'),damage=get('damageDealt'),
   wins=get('wins'),top10=get('top10s'),headshots=get('headshotKills');
  const divide=(a,b,factor=1)=>a===null||b===null||b===0?null:a/b*factor;
  return {matches,kills,damage,killsPerMatch:divide(kills,matches),
   damagePerMatch:divide(damage,matches),winRate:divide(wins,matches,100),
   top10Rate:divide(top10,matches,100),headshotRate:divide(headshots,kills,100)};
 }
 function formatted(n,unit){
  if(n===null||n===undefined)return '—';
  if(unit==='seconds'){
   const seconds=Math.floor(n),h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60);
   return h?h.toLocaleString('en-GB')+'h '+m+'m':m?m+'m '+seconds%60+'s':seconds+'s';
  }
  return n.toLocaleString('en-GB',{maximumFractionDigits:unit==='count'?0:2})+
   (unit==='meters'?' m':'');
 }
 function modeName(m){return m.replace('-fpp',' FPP').toUpperCase()+(m.includes('fpp')?'':' TPP');}
 function render(){
  if(!ready)return;
  const p=players.find(x=>optionValue(x,players)===selected),mode=el('full-mode').value,
   category=el('full-category').value,query=el('full-query').value.trim().toLowerCase();
  if(!p){
   el('full-source').textContent='No saved player available. Load the clan roster or search a player first.';
   el('full-summary').innerHTML='';el('full-results').textContent='No saved player selected.';
   el('full-mode-table').innerHTML='';return;
  }
  const stats=derived(p,mode),value=(n,u)=>formatted(n,u);
  const summaries=[['Kills',value(stats.kills,'count')],['Matches',value(stats.matches,'count')],
   ['Kills / match',value(stats.killsPerMatch,'number')],
   ['Damage / match',value(stats.damagePerMatch,'number')],
   ['Win rate',stats.winRate===null?'—':value(stats.winRate,'number')+'%'],
   ['Top 10 rate',stats.top10Rate===null?'—':value(stats.top10Rate,'number')+'%'],
   ['Headshot kill rate',stats.headshotRate===null?'—':value(stats.headshotRate,'number')+'%']];
  el('full-summary').innerHTML=summaries.map(pair=>'<article class="full-stat-kpi"><small>'+
   escape(pair[0])+'</small><strong>'+escape(pair[1])+'</strong></article>').join('');
  const available=FIELDS.filter(f=>metricValue(p,mode,f)!==null).length;
  el('full-source').textContent=p.name+' · '+(p.platform==='psn'?'PlayStation':'Xbox')+
   ' · '+(mode==='all'?'Available lifetime modes':modeName(mode))+
   ' · '+available+'/'+FIELDS.length+' documented fields available · Last saved '+
   (p.updatedAt&&!Number.isNaN(Date.parse(p.updatedAt))?
    new Date(p.updatedAt).toLocaleDateString('en-GB'):'unknown')+
   '. A dash means unavailable, not zero.';
  const filtered=FIELDS.filter(f=>(category==='all'||f.group===category)&&
   (!query||(f.label+' '+f.key+' '+f.description).toLowerCase().includes(query)));
  el('full-results').innerHTML=GROUPS.map(group=>{
   const fields=filtered.filter(f=>f.group===group);
   if(!fields.length)return '';
   return '<section class="full-stat-group"><h3>'+escape(group)+'</h3>'+
    '<div class="scroll-table"><table><thead><tr><th>STATISTIC</th><th>SAVED VALUE</th><th>PUBG FIELD</th></tr></thead><tbody>'+
    fields.map(f=>'<tr><td><strong>'+escape(f.label)+'</strong><small>'+escape(f.description)+
     '</small></td><td class="full-stat-value">'+escape(value(metricValue(p,mode,f),f.unit))+
     '</td><td><code>'+escape(f.key)+'</code></td></tr>').join('')+
    '</tbody></table></div></section>';
  }).join('')||'<p class="muted">No fields match these filters.</p>';
  el('full-mode-table').innerHTML=MODES.map(m=>{
   const s=derived(p,m),count=FIELDS.filter(f=>numeric(p.modes?.[m]?.[f.key])!==null).length;
   return '<tr><td>'+escape(modeName(m))+'</td><td>'+escape(value(s.matches,'count'))+
    '</td><td>'+escape(value(s.kills,'count'))+'</td><td>'+escape(value(s.damage,'number'))+
    '</td><td>'+(s.winRate===null?'—':escape(value(s.winRate,'number')+'%'))+
    '</td><td>'+count+'/'+FIELDS.length+'</td></tr>';
  }).join('');
 }
 function setPlayers(list){
  players=Array.isArray(list)?list.filter(p=>p&&typeof p.name==='string'&&
   ['xbox','psn'].includes(p.platform)):[];
  if(!players.some(p=>optionValue(p,players)===selected))
   selected=players[0]?optionValue(players[0],players):null;
  if(ready){
   el('full-player').innerHTML=players.map(p=>'<option value="'+escape(optionValue(p,players))+'"'+
    (optionValue(p,players)===selected?' selected':'')+'>'+escape(p.name)+' · '+
    (p.platform==='xbox'?'Xbox':'PlayStation')+'</option>').join('');
   el('full-player').value=selected||'';
   el('full-player').disabled=!players.length;render();
  }
 }
 function select(name,platform='auto'){
  const direct=players.filter(p=>optionValue(p,players)===name&&
   (platform==='auto'||p.platform===platform));
  const matches=players.filter(p=>p.name===name&&
   (platform==='auto'||p.platform===platform));
  const chosen=direct.length===1?direct[0]:matches.length===1?matches[0]:null;
  if(chosen)selected=optionValue(chosen,players);
  if(ready){el('full-player').value=selected||'';render();}
 }
 function init(){
  if(ready||!el('full-player'))return;
  ready=true;
  el('full-player').addEventListener('change',e=>{selected=e.target.value;render();});
  ['full-mode','full-category'].forEach(id=>el(id).addEventListener('change',render));
  el('full-query').addEventListener('input',render);
  setPlayers(players);
 }
 return {FIELDS,MODES,metricValue,derived,formatted,setPlayers,select,show:render,init};
});
