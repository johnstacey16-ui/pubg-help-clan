'use strict';
// Client-only intelligence derived from already fetched, sanitized saved PUBG match records.
// No extra PUBG API calls, historical reconstruction, or fabricated missing matches.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)root.MatchLab=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const $=id=>document.getElementById(id);
  // Display-only translation. Keep source map IDs unchanged for API filtering.
  const displayMap=value=>{
    const dictionary=typeof window!=='undefined'?window.PubgReference:null;
    return dictionary?.mapName?dictionary.mapName(value):value;
  };
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
  function value(x){
    if((typeof x!=='number'&&typeof x!=='string')||
       (typeof x==='string'&&!x.trim()))return null;
    const n=Number(x);
    return Number.isFinite(n)&&n>=0&&n<=1e10?n:null;
  }
  function label(x,fallback){
    return typeof x==='string'&&x.trim()?x.slice(0,100):fallback;
  }
  function rows(matches){
    const seen=new Set();
    return (Array.isArray(matches)?matches:[]).filter(m=>{
      if(!m||typeof m.id!=='string'||!m.id||seen.has(m.id))return false;
      seen.add(m.id);return true;
    }).slice(0,100);
  }
  function filter(items,{map='',mode='',outcome='all',order='newest'}={}){
    const matches=rows(items).filter(m=>
      (!map||label(m.map,'Unknown map')===map)&&
      (!mode||label(m.mode,'Unknown mode')===mode)&&
      (outcome==='all'||
        (outcome==='win'&&value(m.placement)===1)||
        (outcome==='top10'&&value(m.placement)!==null&&value(m.placement)<=10)||
        (outcome==='other'&&value(m.placement)!==null&&value(m.placement)>10)||
        (outcome==='unknown'&&value(m.placement)===null)));
    const newest=m=>Number.isFinite(Date.parse(m.playedAt))?Date.parse(m.playedAt):0;
    const descending=(key,a,b)=>(value(b[key])??-1)-(value(a[key])??-1);
    return matches.sort((a,b)=>{
      if(order==='oldest')return newest(a)-newest(b)||a.id.localeCompare(b.id);
      if(order==='kills'||order==='damage')return descending(order,a,b)||newest(b)-newest(a);
      if(order==='placement'){
        const av=value(a.placement),bv=value(b.placement);
        if(av===null)return bv===null?newest(b)-newest(a):1;
        if(bv===null)return -1;
        return av-bv||newest(b)-newest(a);
      }
      return newest(b)-newest(a)||a.id.localeCompare(b.id);
    });
  }
  function sum(items,key){
    const numbers=items.map(m=>value(m[key])).filter(n=>n!==null);
    return{total:numbers.length?numbers.reduce((a,b)=>a+b,0):null,count:numbers.length};
  }
  function summary(items){
    const count=items.length;
    const finishes=items.map(m=>value(m.placement)).filter(n=>n!==null&&n>=1);
    const wins=finishes.filter(n=>n===1).length,top10=finishes.filter(n=>n<=10).length;
    const kills=sum(items,'kills'),damage=sum(items,'damage'),
      assists=sum(items,'assists'),knocks=sum(items,'knocks'),
      survival=sum(items,'timeSurvivedSeconds'),
      roadKills=sum(items,'roadKills'),vehicles=sum(items,'vehicleDestroys');
    return {
      count,ranked:finishes.length,wins,top10,
      winRate:finishes.length?100*wins/finishes.length:null,
      top10Rate:finishes.length?100*top10/finishes.length:null,
      avgPlace:finishes.length?finishes.reduce((a,b)=>a+b,0)/finishes.length:null,
      kills:kills.total,killsObserved:kills.count,
      killsPerMatch:kills.count?kills.total/kills.count:null,
      damage:damage.total,damageObserved:damage.count,
      damagePerMatch:damage.count?damage.total/damage.count:null,
      assists:assists.total,knocks:knocks.total,
      survival:survival.total,survivalObserved:survival.count,
      averageSurvivalSeconds:survival.count?survival.total/survival.count:null,
      roadKills:roadKills.total,vehicleDestroys:vehicles.total
    };
  }
  function groups(items,key){
    const byKey=new Map();
    for(const m of items){
      const k=label(m[key],key==='map'?'Unknown map':'Unknown mode');
      if(!byKey.has(k))byKey.set(k,[]);
      byKey.get(k).push(m);
    }
    return [...byKey].map(([name,records])=>({name,...summary(records)}))
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  }
  const fmt=(n,digits=0)=>value(n)===null?'—':Number(n).toLocaleString('en-GB',{maximumFractionDigits:digits});
  const pct=n=>value(n)===null?'—':fmt(n,1)+'%';
  function duration(n){
    const seconds=value(n);
    if(seconds===null)return '—';
    const whole=Math.floor(seconds);
    return Math.floor(whole/60)+'m '+String(whole%60).padStart(2,'0')+'s';
  }
  const DEATH_LABELS=Object.freeze({
    alive:'Alive at match end',byplayer:'Killed by player',byzone:'Died to zone',
    suicide:'Suicide',logout:'Disconnected'
  });
  const deathText=x=>DEATH_LABELS[x]||'—';
  const EXTRA_FIELDS=Object.freeze([
    {label:'Time survived',key:'timeSurvivedSeconds',unit:'duration',group:'Survival'},
    {label:'Death type',key:'deathType',unit:'death',group:'Survival'},
    {label:'Kill placement',key:'killPlace',group:'Combat'},
    {label:'Kill streaks',key:'killStreaks',group:'Combat'},
    {label:'Road kills',key:'roadKills',group:'Combat'},
    {label:'Team kills',key:'teamKills',group:'Combat'},
    {label:'Swam',key:'swimMeters',unit:'meters',group:'Movement'},
    {label:'Vehicles destroyed',key:'vehicleDestroys',group:'Vehicles & equipment'},
    {label:'Weapons acquired',key:'weaponsAcquired',group:'Vehicles & equipment'}
  ]);
  function detailValue(m,field){
    if(field.unit==='death')return deathText(m[field.key]);
    if(field.unit==='duration')return duration(m[field.key]);
    if(field.unit==='meters')return value(m[field.key])===null?'—':fmt(m[field.key],1)+' m';
    return fmt(m[field.key]);
  }
  function uniqueSquad(m){
    const names=new Set();
    return (Array.isArray(m.squad)?m.squad:[]).filter(p=>{
      if(!p||typeof p.name!=='string'||!p.name.trim())return false;
      const key=p.name.trim().toLowerCase();
      if(names.has(key))return false;
      names.add(key);return true;
    }).slice(0,8);
  }
  function squadStats(m){
    const squad=uniqueSquad(m);
    if(!squad.length)return null;
    const kills=sum(squad,'kills'),damage=sum(squad,'damage'),assists=sum(squad,'assists');
    const self=squad.find(p=>p.isSelf===true);
    const ownKills=self?value(self.kills):null;
    return{members:squad.length,teamKills:kills.total,
      teamDamage:damage.total,teamAssists:assists.total,
      ownKills,share:kills.total>0&&ownKills!==null?100*ownKills/kills.total:null};
  }
  function recentTrend(items,metric='kills',limit=12){
    return filter(items,{order:'newest'}).slice(0,Math.max(1,Math.min(30,limit))).reverse()
      .map(m=>({id:m.id,map:label(m.map,'Unknown map'),
       playedAt:m.playedAt,
       value:value(m[metric]),placement:value(m.placement)}));
  }

  // Chronological, all-map windows; the UI filters must never affect the sample.
  // Missing official fields remain unavailable, not guessed zeroes.
  const FORM_FIELDS=Object.freeze([
    {key:'killsPerMatch',label:'Kills / game',observed:'killsObserved',digits:2},
    {key:'damagePerMatch',label:'Damage / game',observed:'damageObserved',digits:1},
    {key:'wins',label:'Wins',observed:'ranked',digits:0},
    {key:'top10',label:'Top-10 finishes',observed:'ranked',digits:0},
    {key:'avgPlace',label:'Average placement',observed:'ranked',digits:1,lowerIsBetter:true}
  ]);
  function recentForm(items){
    const saved=rows(items);
    const dated=saved.filter(m=>typeof m.playedAt==='string'&&
      Number.isFinite(Date.parse(m.playedAt)))
      .sort((a,b)=>Date.parse(b.playedAt)-Date.parse(a.playedAt)||
        a.id.localeCompare(b.id));
    const latest=summary(dated.slice(0,10)),previous=summary(dated.slice(10,20));
    const fullWindows=latest.count===10&&previous.count===10;
    const metrics=FORM_FIELDS.map(spec=>{
      const nowObserved=latest[spec.observed],oldObserved=previous[spec.observed];
      const now=nowObserved?latest[spec.key]:null;
      const old=oldObserved?previous[spec.key]:null;
      const complete=fullWindows&&nowObserved===10&&oldObserved===10;
      const difference=complete?Number((now-old).toFixed(spec.digits)):null;
      const direction=difference===null?'unavailable':difference===0?'same':
        ((difference>0)!==Boolean(spec.lowerIsBetter)?'better':'worse');
      return {...spec,now,old,nowObserved,oldObserved,complete,difference,direction};
    });
    const better=metrics.filter(m=>m.direction==='better').length;
    const worse=metrics.filter(m=>m.direction==='worse').length;
    let verdict='Not enough history';
    if(fullWindows){
      if(metrics.some(m=>!m.complete))verdict='Incomplete stats';
      else if(better>=3&&worse<=1)verdict='Improving';
      else if(worse>=3&&better<=1)verdict='Declining';
      else if(!better&&!worse)verdict='Steady';
      else verdict='Mixed form';
    }
    return {latestCount:latest.count,previousCount:previous.count,
      datedCount:dated.length,undatedCount:saved.length-dated.length,
      metrics,verdict,better,worse};
  }
  function renderRecentForm(items){
    const host=$('recent-form-rows'),status=$('recent-form-status');
    if(!host||!status)return;
    const form=recentForm(items);
    const complete=form.latestCount===10&&form.previousCount===10;
    const count=form.latestCount+' / 10 latest games · '+
      form.previousCount+' / 10 previous games';
    status.textContent=form.verdict+' · '+count+
      (form.undatedCount?' · '+form.undatedCount+' undated saved game(s) excluded':'')+'. '+
      (!complete?'At least 20 dated saved games are needed for equal 10-game windows.':
        form.verdict==='Incomplete stats'?
          'Missing source fields prevent a complete verdict; only fully observed changes are shown.':
          form.better+' indicators improved and '+form.worse+
            ' declined. This is descriptive form, not a skill rating.');
    host.innerHTML=form.metrics.map(m=>{
      const field=v=>v===null?'—':fmt(v,m.digits);
      const coverage=n=>'<small>'+n+' / 10 observed</small>';
      const delta=m.direction==='unavailable'?
        '<span class="recent-form-change">— Awaiting comparable data</span>':
        m.direction==='same'?
          '<span class="recent-form-change same">No change</span>':
          '<span class="recent-form-change '+m.direction+'">'+
          (m.difference>0?'↑ +':'↓ −')+fmt(Math.abs(m.difference),m.digits)+
          ' · '+(m.direction==='better'?'Better':'Worse')+'</span>';
      return '<tr><th scope="row">'+escape(m.label)+'</th>'+
        '<td><strong>'+field(m.now)+'</strong>'+coverage(m.nowObserved)+'</td>'+
        '<td><strong>'+field(m.old)+'</strong>'+coverage(m.oldObserved)+'</td>'+
        '<td>'+delta+'</td></tr>';
    }).join('');
  }

  function renderGroup(id,arr){
    $(id).innerHTML=arr.map(g=>'<tr><td><strong>'+escape(id==='match-map-table'?displayMap(g.name):g.name)+'</strong></td>'+
      '<td>'+fmt(g.count)+'</td><td>'+fmt(g.wins)+'</td>'+
      '<td>'+pct(g.winRate)+'</td><td>'+fmt(g.kills)+'</td>'+
      '<td>'+fmt(g.killsPerMatch,2)+'</td><td>'+fmt(g.damagePerMatch,1)+
      '</td><td>'+fmt(g.avgPlace,1)+'</td></tr>').join('')||
      '<tr><td colspan="8" class="empty">No observed matches in this selection.</td></tr>';
  }
  let source=null,ready=false,knownName=null;
  function reset(){
    source=null;knownName=null;
    if(!$('match-lab-summary'))return;
    $('match-lab-summary').innerHTML='';
    if($('recent-form-rows'))$('recent-form-rows').innerHTML='';
    if($('recent-form-status'))$('recent-form-status').textContent='Choose a player to compare their last 20 dated saved games.';
    $('match-lab-coverage').textContent='Choose a player to analyse actual saved matches.';
    $('match-map-table').innerHTML='';
    $('match-mode-table').innerHTML='';
    $('match-trend').innerHTML='';
    $('match-results').innerHTML='';
    for(const key of ['match-map-filter','match-mode-filter']){
      $(key).innerHTML='<option value="">All '+(key.includes('map')?'maps':'modes')+'</option>';
    }
  }
  function render(response){
    if(!$('match-lab-summary'))return;
    source=response||null;
    const original=rows(source?.matches);
    renderRecentForm(original);
    const identity=String(source?.platform||'')+':'+String(source?.name||'');
    if(identity!==knownName){
      knownName=identity;
      for(const key of ['match-outcome-filter','match-order'])$(key).value=key==='match-order'?'newest':'all';
      for(const key of ['match-map-filter','match-mode-filter'])$(key).value='';
    }
    for(const [element,key,empty] of [
      ['match-map-filter','map','All maps'],['match-mode-filter','mode','All modes']]){
      const select=$(element),previous=select.value;
      const values=[...new Set(original.map(m=>label(m[key],key==='map'?'Unknown map':'Unknown mode')))]
        .sort((a,b)=>a.localeCompare(b));
      select.innerHTML='<option value="">'+empty+'</option>'+
        values.map(v=>'<option value="'+escape(v)+'">'+escape(key==='map'?displayMap(v):v)+'</option>').join('');
      select.value=values.includes(previous)?previous:'';
    }
    rerender();
  }
  function rerender(){
    if(!source)return;
    const all=rows(source.matches);
    const matches=filter(all,{
      map:$('match-map-filter').value,mode:$('match-mode-filter').value,
      outcome:$('match-outcome-filter').value,order:$('match-order').value
    });
    const s=summary(matches);
    const stats=[
      ['Saved matches shown',s.count],['Known finishes',s.ranked],
      ['Wins',s.ranked?s.wins:null],['Win rate',pct(s.winRate)],
      ['Kills per match',fmt(s.killsPerMatch,2)],['Damage per match',fmt(s.damagePerMatch,1)],
      ['Top-10 rate',pct(s.top10Rate)],['Average placement',fmt(s.avgPlace,1)],
      ['Average survival',duration(s.averageSurvivalSeconds)],
      ['Road kills observed',fmt(s.roadKills)],
      ['Vehicles destroyed',fmt(s.vehicleDestroys)]
    ];
    $('match-lab-summary').innerHTML=stats.map(([title,figure])=>
      '<div class="match-lab-kpi"><small>'+escape(title)+'</small><strong>'+
      escape(figure===null?'—':figure)+'</strong></div>').join('');
    const origin=source.archivedCount?'180-day stored archive':'Temporary saved PUBG match cache';
    $('match-lab-coverage').textContent=matches.length+' of '+all.length+
      ' unique saved match reports displayed · '+s.ranked+
      ' known placements · '+s.killsObserved+' match kills records · '+
      s.damageObserved+' match damage records · '+s.survivalObserved+
      ' match survival records. '+origin+
      '. These are observed samples, NOT lifetime totals or an estimate of missing games.';
    renderGroup('match-map-table',groups(matches,'map'));
    renderGroup('match-mode-table',groups(matches,'mode'));
    const trend=recentTrend(matches,$('match-trend-metric').value,12);
    const high=Math.max(1,...trend.map(t=>t.value??0));
    $('match-trend').innerHTML=trend.map(t=>{
      const p=t.value===null?0:Math.max(t.value>0?5:2,Math.round(t.value/high*100));
      return '<div class="match-trend-item" title="'+escape(displayMap(t.map))+'">'+
        '<strong>'+fmt(t.value,1)+'</strong><div class="match-trend-rail">'+
        '<span data-height="'+p+'" aria-hidden="true"></span></div>'+
        '<small>'+escape(displayMap(t.map))+'</small>'+
        '<small>'+(t.placement===null?'Place —':'#'+fmt(t.placement))+'</small></div>';
    }).join('')||'<p class="match-empty">No saved matches match these filters.</p>';
    $('match-trend').querySelectorAll('[data-height]').forEach(el=>{
      el.style.height=el.dataset.height+'%';
    });
    $('match-results').innerHTML=matches.map(m=>{
      const team=uniqueSquad(m),squad=squadStats(m);
      const stamp=Number.isFinite(Date.parse(m.playedAt))?
        new Date(m.playedAt).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Date unavailable';
      const metrics=[['PLACEMENT',value(m.placement)!==null?'#'+fmt(m.placement):'—'],
        ['KILLS',fmt(m.kills)],['DAMAGE',fmt(m.damage,1)],['ASSISTS',fmt(m.assists)]];
      const secondary=[
        ['Headshots',m.headshots],['Knocks',m.knocks],['Revives',m.revives],
        ['Heals',m.heals],['Boosts',m.boosts],['Longest kill (m)',m.longestKillMeters],
        ['Walked (m)',m.walkMeters],['Driven (m)',m.driveMeters],
        ['Match duration (s)',m.durationSeconds]
      ].map(([n,v])=>escape(n)+' '+fmt(v,1)).join(' · ');
      const detailed=EXTRA_FIELDS.map(field=>'<div class="match-detail-stat">'+
        '<span>'+escape(field.label)+'</span><strong>'+
        escape(detailValue(m,field))+'</strong></div>');
      return '<article class="match-card">'+
        '<header class="match-heading"><div><span class="match-map">'+
        escape(displayMap(label(m.map,'Unknown map')))+'</span><span class="badge">'+
        escape(label(m.mode,'Unknown mode'))+'</span></div>'+
        '<span class="small muted">'+escape(stamp)+'</span></header>'+
        '<div class="match-metrics">'+metrics.map(([name,v])=>'<div><small>'+
          name+'</small><strong>'+escape(v)+'</strong></div>').join('')+'</div>'+
        '<p class="match-secondary">'+secondary+'</p>'+
        '<details class="match-detail"><summary>Complete official participant stats</summary>'+
        '<p class="small muted">Fields are from the saved PUBG match participant. “—” means not returned or not archived. Death status does not identify another player.</p>'+
        '<div class="match-detail-grid">'+detailed.join('')+'</div></details>'+
        (squad?'<div class="match-squad-overview">'+
          'Recorded squad: '+fmt(squad.members)+' · Squad kills '+fmt(squad.teamKills)+
          ' · Squad damage '+fmt(squad.teamDamage,1)+
          ' · Your recorded kill share '+pct(squad.share)+'</div>':'')+
        '<details class="match-squad"><summary>Recorded squad roster · '+team.length+
        ' player(s)</summary>'+
        (team.length?team.map(member=>'<div class="match-teammate"><strong>'+
          (member.isSelf?'★ ':'')+escape(member.name)+'</strong><span>'+
          fmt(member.kills)+' kills · '+fmt(member.damage,1)+' damage · '+
          fmt(member.assists)+' assists · '+fmt(member.knocks)+' knocks'+
          (value(member.headshots)!==null?' · '+fmt(member.headshots)+' headshots':'')+
          (value(member.revives)!==null?' · '+fmt(member.revives)+' revives':'')+
          (value(member.timeSurvivedSeconds)!==null?' · '+duration(member.timeSurvivedSeconds)+' survived':'')+
          '</span></div>').join(''):
          '<p class="small muted">No squad roster saved for this match.</p>')+
        '</details><button type="button" class="secondary match-analysis-select" data-lobby-match="'+
         escape(m.id)+'">View saved lobby</button> <button type="button" class="secondary match-analysis-select" data-combat-match="'+
         escape(m.id)+'">Analyse combat events</button></article>';
    }).join('')||'<p class="match-empty">No matches match these filters. Change the selection to show more stored reports.</p>';
  }
  function init(){
    if(ready||!$('match-lab-summary'))return;
    ready=true;
    ['match-map-filter','match-mode-filter','match-outcome-filter','match-order','match-trend-metric']
      .forEach(id=>$(id).addEventListener('change',rerender));
    $('match-results').addEventListener('click',e=>{
      const button=e.target.closest?.('[data-combat-match]');
      const id=button?.dataset.combatMatch;
      const select=$('telemetry-match');
      if(!id||!select||![...select.options].some(option=>option.value===id))return;
      select.value=id;
      const optIn=$('telemetry-opt-in');
      if(optIn)optIn.open=true; // User explicitly selected optional event analysis.
      $('telemetry-status').textContent='Selected saved match '+id.slice(0,8)+
       '. Choose Analyse selected match to inspect genuine combat events, if available.';
      $('telemetry-panel').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  return{rows,filter,summary,groups,recentTrend,recentForm,squadStats,fmt,pct,duration,deathText,EXTRA_FIELDS,render,rerender,reset,init};
});
