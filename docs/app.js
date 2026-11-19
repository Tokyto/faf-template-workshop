import * as Core from './core.js';
import * as Sim from './simulation.js';
import * as Factory from './factory.js';
import * as View from './viewport.js';
import {openTransfer} from './transfer.js';
import * as Layout from './layout.js';
import {createTemplateLink, readPrefsFile, readTemplateLink} from './browser-files.js';
const $=id=>document.getElementById(id), $$=q=>[...document.querySelectorAll(q)];
const EMPTY_PREFS = "profile = { current = 1, profiles = { { Name = 'Browser workspace' } } }";
const state={doc:null,prefsName:'',exportedSignature:null,catalog:null,rules:null,units:new Map(),profile:0,mode:'building',selected:-1,selectedBuilding:-1,faction:'Cybran',queueFaction:'Cybran',layoutFactions:[...Core.factions],factionSpecific:false,selectedUnit:'urb1104',tool:'place',keepOriginal:false,mirrorAxis:'x',placementSymmetry:'none',gridSize:30,snap:1,viewX:0,viewZ:0,hover:null,drag:null,pan:null,spaceDown:false,history:[],redo:[],showShields:true,showStats:true,showAdjacency:true,economyExpanded:{building:false,factory:true}};
const images=new Map();let toastTimer;
const shieldPreviews=new WeakMap();let analysisKey='',analysisCache=null;
function previewId(b){return shieldPreviews.get(current())?.get(b.entity+':'+b.id)||null;}
function simulation(){const buildings=current()?.buildings||[],key=JSON.stringify(buildings.map(b=>[b.id,b.x,b.z]));if(key!==analysisKey||!analysisCache){analysisKey=key;analysisCache=Sim.analyzeLayout(buildings,state.units,state.rules);}return analysisCache;}
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),error?9500:6500);}
function profile(){return state.doc?.profiles[state.profile];}
function list(){const p=profile();return p?(state.mode==='building'?p.buildings:p.queues):[];}
function current(){return list()[state.selected];}
function workspaceSignature() {
  return JSON.stringify(state.doc.profiles.map(p => [
    p.buildings.map(Core.signature),
    p.queues.map(Core.signature)
  ]));
}
function hasUnexportedChanges() {
  return state.exportedSignature === null
    ? Core.dirty(state.doc)
    : state.exportedSignature !== workspaceSignature();
}
function snapshot(){return {profiles:state.doc.profiles.map(p=>({buildings:structuredClone(p.buildings),queues:structuredClone(p.queues)})),profile:state.profile,mode:state.mode,selected:state.selected,selectedBuilding:state.selectedBuilding};}
function restore(s){s.profiles.forEach((p,i)=>{state.doc.profiles[i].buildings=structuredClone(p.buildings);state.doc.profiles[i].queues=structuredClone(p.queues);});Object.assign(state,{profile:s.profile,mode:s.mode,selected:s.selected,selectedBuilding:s.selectedBuilding});}
function edit(fn){const before=snapshot();try{fn();state.history.push(before);if(state.history.length>80)state.history.shift();state.redo=[];render();}catch(e){restore(before);render();toast(e.message,true);}}
function makeTemplate(name='New layout'){return state.mode==='building'?{kind:'building',name,icon:'default',buildings:[],extra:[]}:{kind:'factory',name:name==='New layout'?'New factory queue':name,icon:'default',queue:[],extra:[]};}
function ensureTemplate(){if(!current()){list().push(makeTemplate());state.selected=list().length-1;}return current();}
function unit(id){return state.units.get(id)||{id,name:id,description:'Unknown / modded unit',faction:'Unknown',tech:1,w:2,h:2,mass:0,energy:0};}
function icon(id){const im=document.createElement('img'),src=Core.catalogIconSource(id,state.units);if(src)im.src=src;im.alt='';im.addEventListener('error',()=>{im.style.visibility='hidden';});return im;}
function img(id){if(!images.has(id)){const im=new Image(),src=Core.catalogIconSource(id,state.units);im.onload=drawGrid;if(src)im.src=src;images.set(id,im);}return images.get(id);}
function factionOf(t){return [...new Set((t.kind==='building'?t.buildings:t.queue).map(e=>unit(e.id).faction))].join(' + ')||state.faction;}
function crossFactionEnabled(){return Number(Core.scalar(Core.get(Core.get(profile()?.node,'options'),'gui_all_race_templates'),1))!==0;}
function compatibility(t){return Core.templateCompatibility(t,state.units,crossFactionEnabled());}
function factionLabel(t){const entries=t.buildings||t.queue;if(!entries.length)return 'Empty template';const available=compatibility(t).factions;return available.length===4?'All factions':available.length?available.join(' · '):'No supported faction';}
function visibleTemplates(){return list().map((t,i)=>({t,i})).filter(({t})=>{
  if(!(t.buildings||t.queue).length)return true;
  const fs=compatibility(t).factions;
  return state.mode==='factory'?(!fs.length||fs.includes(state.queueFaction)):state.layoutFactions.length>0&&(!state.factionSpecific||fs.length<4)&&(!fs.length||fs.some(f=>state.layoutFactions.includes(f)));
});}
function factionImage(faction){const im=document.createElement('img');im.src='factions/'+faction.toLowerCase()+'.svg';im.alt='';return im;}
function renderFactionFilters(){
  const row=$('templateFactionFilters');
  if(!row.children.length)for(const faction of Core.factions){const b=document.createElement('button');b.dataset.faction=faction;b.append(factionImage(faction));const label=document.createElement('span');label.textContent=faction==='Seraphim'?'Sera':faction;b.append(label);b.addEventListener('click',()=>{
    if(state.mode==='factory'){state.queueFaction=faction;state.faction=faction;state.selectedUnit=null;}
    else state.layoutFactions=state.layoutFactions.includes(faction)?state.layoutFactions.filter(f=>f!==faction):[...state.layoutFactions,faction];
    const visible=visibleTemplates();if(!visible.some(v=>v.i===state.selected))state.selected=visible[0]?.i??-1;state.selectedBuilding=-1;fit();render();
  });row.append(b);}
  for(const b of row.children){const active=state.mode==='factory'?b.dataset.faction===state.queueFaction:state.layoutFactions.includes(b.dataset.faction);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.title=state.mode==='factory'?'Choose '+b.dataset.faction+' queues':'Show layouts usable by '+b.dataset.faction;}
  $('limitedFilter').classList.toggle('hidden',state.mode==='factory');$('allTemplateFactions').classList.toggle('hidden',state.mode==='factory');
  $('factionSpecific').checked=state.factionSpecific;
  const visible=visibleTemplates(),position=visible.findIndex(v=>v.i===state.selected);
  $('templateFirst').disabled=state.selected<=0;$('templateUp').disabled=position<=0;$('templateDown').disabled=position<0||position>=visible.length-1;
}
function duplicateKey(t){return t.kind==='building'?JSON.stringify(t.buildings.map(({id,x,z})=>[id,x,z])):JSON.stringify(t.queue);}
function connectFile(doc, filename = '') {
  const drafts = !state.prefsName && state.doc ? [...profile().buildings, ...profile().queues] : [];
  const draftSelection = drafts.includes(current()) ? current() : null;
  state.doc = doc;
  state.prefsName = filename;
  state.exportedSignature = null;
  state.profile = doc.current;
  state.history = [];
  state.redo = [];
  for (const template of drafts) {
    const target = template.kind === 'building' ? profile().buildings : profile().queues;
    target.push(template);
  }
  const visible = visibleTemplates();
  selectTemplate(visible.find(({t}) => t === draftSelection)?.i ?? visible[0]?.i ?? -1);
}
function selectTemplate(i){state.selected=i;state.selectedBuilding=-1;const t=current(),first=(t?.buildings||t?.queue||[])[0];if(first&&state.units.has(first.id))state.faction=unit(first.id).faction;if(state.mode==='factory')state.faction=state.queueFaction;fit();render();}
function fit(){const t=current();if(t?.kind==='building'&&t.buildings.length){const b=Core.bounds(t.buildings,state.units),s=state.showShields?Sim.shieldBounds(t.buildings,state.units,previewId):null;const xmin=Math.min(b.xmin,s?.xmin??b.xmin),xmax=Math.max(b.xmax,s?.xmax??b.xmax),zmin=Math.min(b.zmin,s?.zmin??b.zmin),zmax=Math.max(b.zmax,s?.zmax??b.zmax);state.viewX=(xmin+xmax)/2;state.viewZ=(zmin+zmax)/2;state.gridSize=Math.min(View.MAX_SPAN,Math.max(16,xmax-xmin+6,zmax-zmin+6));}else{state.viewX=0;state.viewZ=0;state.gridSize=30;}}
function renderTemplates(){
  $('templates').replaceChildren();const items=list(),visible=visibleTemplates();$('templateTotal').textContent=visible.length===items.length?items.length:visible.length+' / '+items.length;
  if(!visible.length){const d=document.createElement('div');d.className='empty-list';d.textContent=items.length?'No templates match these faction filters.':state.mode==='building'?'No layouts in this profile yet. Start with a new template, or place a building on the grid.':'No factory queues yet. Click a unit in the catalog to create one.';$('templates').append(d);return;}
  const keys=items.map(duplicateKey);
  visible.forEach(({t,i})=>{const b=document.createElement('button');b.className='template-card'+(i===state.selected?' active':'');b.dataset.index=i;b.append(icon(t.icon));const text=document.createElement('span');text.className='card-text';const strong=document.createElement('strong');strong.textContent=Core.displayName(t.name);text.append(strong);const sub=document.createElement('small');const count=t.kind==='building'?t.buildings.length:t.queue.reduce((n,e)=>n+e.count,0);sub.textContent=`${count} ${t.kind==='building'?(count===1?'building':'buildings'):(count===1?'unit':'units')} · ${factionLabel(t)}`;text.append(sub);const duplicates=keys.filter(k=>k===keys[i]).length-1;if(duplicates){const d=document.createElement('small');d.className='duplicate-tag';d.textContent=`Same ${t.kind==='building'?'layout':'queue'} as ${duplicates} other${duplicates>1?'s':''}`;text.append(d);}const rank=document.createElement('span');rank.className='template-rank';rank.textContent=i+1;b.append(text,rank);b.addEventListener('click',()=>selectTemplate(i));$('templates').append(b);});
}
function eligible(u){return state.mode==='building'?Sim.directlyBuildable(u):u.queueEligible;}
function filteredUnits(){const search=$('unitSearch').value.toLowerCase().trim(),tech=Number($('techFilter').value),role=$('roleFilter').value;return state.catalog.units.filter(u=>{
  if(u.faction!==state.faction||!eligible(u)||tech&&u.tech!==tech)return false;
  if(search&&!`${u.name} ${u.description} ${u.id}`.toLowerCase().includes(search))return false;
  if(state.mode==='factory')return role==='all'||role==='upgrade'&&u.structure||u.domain===role&&!u.structure;
  const c=u.categories||[];const economy=c.includes('ECONOMIC')||c.includes('ENERGYPRODUCTION')||c.includes('MASSPRODUCTION')||c.includes('MASSSTORAGE')||c.includes('ENERGYSTORAGE');const defense=c.includes('DEFENSE')||c.includes('SHIELD')||c.includes('ANTIMISSILE')||c.includes('ARTILLERY');const intel=c.includes('INTELLIGENCE')||c.includes('RADAR')||c.includes('SONAR')||c.includes('OMNI');
  return role==='all'||role==='economy'&&economy||role==='defense'&&defense||role==='factory'&&u.factory||role==='intel'&&intel||role==='other'&&!economy&&!defense&&!u.factory&&!intel;
}).sort((a,b)=>a.tech-b.tech||a.description.localeCompare(b.description)||a.name.localeCompare(b.name));}
function renderUnits(){
  const filtered=filteredUnits();if(!filtered.some(u=>u.id===state.selectedUnit))state.selectedUnit=filtered.some(u=>u.id==='urb1104')?'urb1104':filtered[0]?.id||null;
  $('units').replaceChildren();$('unitCount').textContent=filtered.length;
  for (const u of filtered) {
    const b = document.createElement('button');
    b.className = 'unit-card' + (state.selectedUnit === u.id ? ' active' : '');
    b.dataset.unit = u.id;
    b.append(icon(u.id));
    const text = document.createElement('span');
    text.className = 'unit-text';
    const name = document.createElement('strong');
    name.textContent = u.name;
    const description = document.createElement('small');
    const upgrade = state.mode === 'factory' && u.factory && u.upgradeFrom !== 'none';
    description.textContent = `${u.tech === 4 ? 'EXP' : 'T' + u.tech} · ${u.description}${upgrade ? ' · upgrade' : ''}`;
    text.append(name, description);
    b.append(text);
    if (state.mode === 'building') {
      const size = document.createElement('span');
      size.className = 'unit-size';
      size.textContent = `${u.w}×${u.h}`;
      b.append(size);
    }
    b.addEventListener('click', () => {
      state.selectedUnit = u.id;
      if (state.mode === 'factory') {
        appendQueue(u);
      } else {
        state.tool = 'place';
        renderUnits();
        renderTools();
        drawGrid();
      }
      renderUnitDetails();
    });
    $('units').append(b);
  }
  if(!filtered.length){const d=document.createElement('div');d.className='empty-list';d.textContent='No units match these filters.';$('units').append(d);}
  $$('#factionButtons button').forEach(b=>b.classList.toggle('active',b.dataset.faction===state.faction));
  $('convertFaction').textContent='Convert layout to '+state.faction+' ↗';$('convertFaction').disabled=state.mode!=='building'||!current()?.buildings.length;
  renderUnitDetails();
}
function renderUnitDetails(){
  const u=state.units.get(state.selectedUnit);$('unitDetails').replaceChildren();if(!u){$('unitDetails').textContent='Select a unit to see its size and cost.';return;}
  const title=document.createElement('strong');title.textContent=u.name;$('unitDetails').append(title);const role=document.createElement('div');role.className='muted';role.textContent=`${u.id} · ${u.faction} · ${u.tech===4?'Experimental':'Tech '+u.tech}`;$('unitDetails').append(role);
  const detail=text=>{const d=document.createElement('div');d.textContent=text;$('unitDetails').append(d);};
  if(u.structure)detail(`Placement footprint: ${u.w} × ${u.h} cells`);
  if(u.shield)detail(`Shield radius: ${Sim.formatNumber(u.shield.radius)} cells`);
  if(u.productionMass)detail(`Base production: +${Sim.formatNumber(u.productionMass)} M/s`);
  if(u.productionEnergy)detail(`Base production: +${Sim.formatNumber(u.productionEnergy)} E/s`);
  if(u.artillery)detail(`Base shot interval: ${Sim.formatNumber(1/u.artillery.rateOfFire)} s`);
  const costs=document.createElement('div');costs.className='costs';for(const [label,value,cls] of [['M',u.mass,'mass'],['E',u.energy,'energy']]){const s=document.createElement('span');s.className=cls;s.textContent=`${label} ${value.toLocaleString()}`;costs.append(s);}$('unitDetails').append(costs);
  if(state.mode==='building'&&current()?.buildings[state.selectedBuilding]&&Sim.directlyBuildable(u)){const b=document.createElement('button');b.id='replaceBuilding';b.className='replace-button';b.textContent='Replace selected with '+u.name;b.addEventListener('click',()=>edit(()=>{const t=current(),old=t.buildings[state.selectedBuilding],replacement={...old,id:u.id};if(t.buildings.some((other,i)=>i!==state.selectedBuilding&&Core.overlaps(replacement,other,state.units)))throw new Error('The replacement would overlap another footprint');if(t.icon===old.id&&state.selectedBuilding===0)t.icon=u.id;t.buildings[state.selectedBuilding]=replacement;}));$('unitDetails').append(b);}
}
function renderTools(){
  $$('.toolbar [data-tool]').forEach(b=>{b.classList.toggle('active',b.dataset.tool===state.tool);b.setAttribute('aria-pressed',String(b.dataset.tool===state.tool));});
  $('undo').disabled=!state.history.length;$('redo').disabled=!state.redo.length;
  for(const id of ['duplicateTemplate','removeTemplate'])$(id).disabled=!current();
  for(const id of ['center','rotate','mirror'])$(id).disabled=!current()?.buildings?.length;
  const dirty = hasUnexportedChanges();
  $('exportPrefs').disabled = !state.prefsName;
  $('shareTemplate').disabled = !(current()?.buildings || current()?.queue)?.length;
  $('dirtyLabel').textContent = dirty ? 'Unexported changes' : state.exportedSignature !== null ? 'Copy exported' : 'Ready';
  $('dirtyLabel').classList.toggle('dirty',dirty);$('fileStatus').classList.toggle('dirty',dirty);
  $('filePath').textContent = state.prefsName || 'Browser workspace · Open Game.prefs to edit your game templates';
  $('filePath').title = state.prefsName;
  $('templateIcon').disabled=!current();$('templateIcon').replaceChildren(current()&&current().icon!=='default'?icon(current().icon):document.createTextNode('▦'));
  $('layoutToolbar').classList.toggle('hidden',state.mode!=='building');$('gridOptions').classList.toggle('hidden',state.mode!=='building');$('canvasWrap').classList.toggle('hidden',state.mode!=='building');$('queueWrap').classList.toggle('hidden',state.mode==='building');
  $('overlayBar').classList.toggle('hidden',state.mode!=='building');
  $('keepOriginal').checked=state.keepOriginal;$('mirrorAxis').value=state.mirrorAxis;$('placementSymmetry').value=state.placementSymmetry;
  $('symmetryHint').textContent=state.placementSymmetry==='none'?'':'Symmetry '+({x:'X ↔',z:'Z ↕',both:'X + Z'})[state.placementSymmetry];
  $('rotate').title=(state.keepOriginal?'Add rotated copies':'Rotate the layout')+' · 90° around the orange cursor';
  $('mirror').title=(state.keepOriginal?'Add mirrored copies':'Mirror the layout')+' · '+(state.mirrorAxis==='x'?'X: left / right':'Z: top / bottom')+' around the orange cursor';
  $('economyDetails').open=state.economyExpanded[state.mode];
  $('buildingTab').classList.toggle('active',state.mode==='building');$('queueTab').classList.toggle('active',state.mode==='factory');
  $('typeLabel').textContent=state.mode==='building'?'BUILDING LAYOUT':'FACTORY QUEUE';$('templateName').disabled=!current();$('templateName').value=Core.displayName(current()?.name||'New template');
  $('bottomHint').textContent=state.mode==='building'?'Wheel to zoom at cursor · Middle-drag / Space-drag to pan · Right-click to remove · Ctrl+Z to undo':'Click a catalog unit to append it · Change quantities · Use arrows to change build order';
}
function renderSummary(){
  const t=current();$('templateCompatibility').replaceChildren();
  if(!t){$('templateSummary').textContent='Build a layout or open your saved game profile.';return;}
  const items=t.buildings||t.queue,available=compatibility(t);
  if(t.kind==='building'){const b=Core.bounds(items,state.units);$('templateSummary').textContent=`${items.length} ${items.length===1?'building':'buildings'} · ${b.width}×${b.height} cells · ${factionLabel(t)}`;}
  else $('templateSummary').textContent=`${items.reduce((n,e)=>n+e.count,0)} units · ${items.length} entries · ${factionLabel(t)}`;
  $('templateSummary').title='Stored blueprint IDs: '+factionOf(t)+(t.kind==='building'?'. Compatibility assumes the required engineer tech is available.':'');
  for(const f of Core.factions){const span=document.createElement('span');span.className='compatibility-faction'+(available.factions.includes(f)?' available':'');span.append(factionImage(f));const label=document.createElement('span');label.textContent=f==='Seraphim'?'Sera':f;span.append(label);span.title=available.factions.includes(f)?'Usable by '+f:'Unavailable for '+f+(available.blocked[f]?.length?': '+[...new Set(available.blocked[f])].join(', '):'');$('templateCompatibility').append(span);}
}
function renderSelection(){const t=current(),b=t?.buildings?.[state.selectedBuilding];$('selectedDetails').replaceChildren();$('positionControls').classList.toggle('hidden',!b);if(!b){const m=document.createElement('span');m.className='muted';m.textContent=state.mode==='building'?'The + is where your mouse will anchor the template in-game.':'The queue is saved in exactly the order shown.';$('selectedDetails').append(m);return;}const u=unit(b.id);$('selectedDetails').append(icon(b.id));const text=document.createElement('span');const strong=document.createElement('strong');strong.textContent=u.name;text.append(strong);const sub=document.createElement('small');sub.textContent=`${b.id} · Build order ${state.selectedBuilding+1}`;text.append(sub);$('selectedDetails').append(text);$('positionX').value=b.x;$('positionZ').value=b.z;$('earlier').disabled=state.selectedBuilding===0;$('later').disabled=state.selectedBuilding===t.buildings.length-1;}
function renderValidation(){const t=current();let notes=[];if(t){const items=t.buildings||t.queue;const unknown=items.filter(e=>!state.units.has(e.id));if(unknown.length)notes.push(`${unknown.length} unknown/modded unit ID(s); their footprint is estimated.`);if(t.kind==='building'){let collision=0;for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(Core.overlaps(items[i],items[j],state.units))collision++;if(collision)notes.push(`${collision} overlapping building pair(s). Move them before using this layout.`);const b=Core.bounds(items,state.units);if(Math.abs(b.cx)>0.01||Math.abs(b.cz)>0.01)notes.push(`Layout center: X ${b.cx}, Z ${b.cz}. Center moves the cursor to that point.`);}}
  const invalid=t?.buildings?.filter(b=>state.units.get(b.id)?.directBuildable===false)||[];
  if (invalid.length) {
    const names = [...new Set(invalid.map(building => unit(building.id).name))];
    notes.unshift(`${names.join(', ')} cannot be placed directly. Remove or replace these entries before saving an edited layout.`);
  }
  $('validation').textContent=notes.join(' ');$('repairUpgrades').classList.toggle('hidden',!invalid.some(b=>unit(b.id).templateReplacement));
}
function renderTotals(){
  const t=current(),panel=$('templateTotals');panel.classList.toggle('hidden',!t);if(!t)return;
  const queue=t.kind==='factory',items=queue?t.queue:t.buildings;let cost=Sim.constructionCost(items,state.units),estimate=null;
  panel.classList.toggle('queue',queue);$('totalsScope').textContent=queue?'WHOLE QUEUE':'WHOLE LAYOUT';
  $('queueEconomyControls').classList.toggle('hidden',!queue);
  if(queue){
    const faction=compatibility(t).factions[0]||state.queueFaction,choices=Factory.factoryChoices(state.units,faction),select=$('queueFactory');
    select.replaceChildren();let group;for(const f of choices){if(group?.dataset.domain!==f.domain){group=document.createElement('optgroup');group.dataset.domain=f.domain;group.label=f.domain==='Naval'?'Navy':f.domain;select.append(group);}const o=document.createElement('option');o.value=f.id;o.textContent=`T${f.tech} ${f.name} · ${f.buildRate} BP · ${f.id}`;group.append(o);}
    if(!choices.some(f=>f.id===t._producer)||!t._producerManual&&!Factory.estimateQueue(items,state.units,t._producer,t._assist||0).valid)t._producer=Factory.defaultFactory(items,state.units,faction);
    select.value=t._producer;$('queueAssist').value=t._assist||0;
    estimate=Factory.estimateQueue(items,state.units,t._producer,t._assist||0);
    if(estimate.valid)cost={mass:estimate.mass,energy:estimate.energy,unknownCount:0};
    $('queueDuration').textContent=estimate.valid?Factory.formatDuration(estimate.time):'—';
    $('totalNetMass').textContent=estimate.valid?Sim.formatNumber(estimate.massPerSecond)+' M/s':'—';
    $('totalNetEnergy').textContent=estimate.valid?Sim.formatNumber(estimate.energyPerSecond)+' E/s':'—';
    $('totalNetMass').classList.remove('negative');$('totalNetEnergy').classList.remove('negative');
  }
  $('massIncomeLabel').textContent=queue?'AVG MASS DRAIN / SECOND':'NET MASS / SECOND';
  $('energyIncomeLabel').textContent=queue?'AVG ENERGY DRAIN / SECOND':'NET ENERGY / SECOND';
  $$('.income-breakdown').forEach(el=>el.classList.toggle('hidden',queue));
  $('totalMassCost').textContent=(cost.unknownCount?'≥ ':'')+Sim.formatNumber(cost.mass)+' M';
  $('totalEnergyCost').textContent=(cost.unknownCount?'≥ ':'')+Sim.formatNumber(cost.energy)+' E';
  const count=queue?items.reduce((n,e)=>n+e.count,0):items.length;
  $$('.total-cost-note').forEach(el=>el.textContent=queue&&!estimate?.valid?'Blueprint totals; see warning':`All ${count} ${queue?'units':'buildings'}`);
  $('totalsNote').classList.toggle('estimate-error',queue&&!estimate?.valid);
  $('totalsNote').textContent=queue?(estimate.valid?'Total cost ÷ total build time · Full power · No adjacency or roll-off delays':estimate.errors.join(' ')):'Income at full power · Production − idle upkeep · Adjacency included';
  $('totalsNote').title=queue?'Time-weighted build drain for the selected factory and assist build power. Factory upgrades use differential costs and change the subsequent build rate. Excludes adjacency, unit roll-off/travel time, resource stalls and upkeep of assisting engineers. Estimator settings are not saved in Game.prefs.':'Base blueprint construction costs. Income assumes completed, active buildings; factory production, construction, upgrades, and weapon firing consumption are excluded. Shield upgrade previews do not change totals.';
  if(cost.unknownCount)$('totalsNote').textContent+=` · ${cost.unknownCount} unknown/modded unit(s) excluded from ${queue?'cost':'cost and income'}.`;
  if(queue){syncEconomySummary();return;}
  const total=simulation().totals,signed=n=>(n<0?'−':'+')+Sim.formatNumber(Math.abs(n));
  for(const [id,value,suffix] of [['totalNetMass',total.netMass,' M/s'],['totalNetEnergy',total.netEnergy,' E/s']]){const el=$(id);el.textContent=signed(value)+suffix;el.classList.toggle('negative',value<0);}
  $('totalMassProduction').textContent='+'+Sim.formatNumber(total.mass);$('totalMassUpkeep').textContent='−'+Sim.formatNumber(total.massUse);
  $('totalEnergyProduction').textContent='+'+Sim.formatNumber(total.energy);$('totalEnergyUpkeep').textContent='−'+Sim.formatNumber(total.energyUse);
  syncEconomySummary();
}
function syncEconomySummary(){
  for(const [target,source] of [['compactMassCost','totalMassCost'],['compactEnergyCost','totalEnergyCost'],['compactNetMass','totalNetMass'],['compactNetEnergy','totalNetEnergy']]){const el=$(target);el.textContent=$(source).textContent;el.classList.toggle('negative',$(source).classList.contains('negative'));}
  const queue=state.mode==='factory';$('compactMassRateLabel').textContent=queue?'Avg mass /s':'Net mass /s';$('compactEnergyRateLabel').textContent=queue?'Avg energy /s':'Net energy /s';
}
function resizeCanvas(){
  if(state.mode!=='building'||!state.catalog)return;
  const wrap=$('canvasWrap'),pane=document.querySelector('.editor-pane'),style=getComputedStyle(pane),available=pane.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const top=wrap.getBoundingClientRect().top+window.scrollY,footer=$('templateTotals').classList.contains('hidden')?0:$('economySummary').getBoundingClientRect().height+10;
  const height=Math.max(300,Math.floor(window.innerHeight-top-footer-16));
  wrap.style.height=height+'px';wrap.style.maxWidth=Math.min(available,Math.floor(height*1.6))+'px';
}
function renderLiveDetails(){
  const t=current(),b=t?.buildings?.[state.selectedBuilding],u=b&&unit(b.id),row=b&&simulation().rows[state.selectedBuilding],el=$('liveDetails');el.replaceChildren();$('shieldControls').classList.add('hidden');
  if(state.mode!=='building'||!row){el.classList.add('hidden');return;}
  const card=(title,value,note,cls='')=>{const c=document.createElement('div');c.className='live-card '+cls;const small=document.createElement('small');small.textContent=title;const strong=document.createElement('strong');strong.textContent=value;const desc=document.createElement('span');desc.textContent=note;c.append(small,strong,desc);el.append(c);};
  const bonus=mod=>`${mod>=1?'+':''}${Sim.formatNumber((mod-1)*100,3)}% adjacency`;
  if(row.massBase)card('MASS / SECOND','+'+Sim.formatNumber(row.mass),`Base ${Sim.formatNumber(row.massBase)} · ${bonus(row.mods.MassProduction)}`,'mass');
  if(row.energyBase)card('ENERGY / SECOND','+'+Sim.formatNumber(row.energy),`Base ${Sim.formatNumber(row.energyBase)} · ${bonus(row.mods.EnergyProduction)}`,'energy');
  if(row.energyUseBase)card('ENERGY UPKEEP / SECOND','−'+Sim.formatNumber(row.energyUse),`Base ${Sim.formatNumber(row.energyUseBase)} · ${bonus(row.mods.EnergyMaintenance)}`,'upkeep');
  if(row.intervalBase){card('NOMINAL SHOT INTERVAL',Sim.formatNumber(row.interval)+' s',`Base ${Sim.formatNumber(row.intervalBase)} s · ${bonus(row.mods.RateOfFire)}`,'artillery');if(row.weaponEnergyBase)card('ENERGY / SHOT',Sim.formatNumber(row.weaponEnergy),`Base ${Sim.formatNumber(row.weaponEnergyBase)} · ${bonus(row.mods.EnergyWeapon)}`,'energy');}
  if(u?.shield){
    const preview=previewId(b),actual=preview?unit(preview):u,s=Sim.shieldCoverage(actual);card('SHIELD RADIUS',Sim.formatNumber(s.radius)+' cells',`Ground footprint R ${Sim.formatNumber(s.groundRadius,2)} · ${Sim.formatNumber(s.health,0)} HP`,'shield');
    if(u.shield.stages?.length>1){const select=$('shieldPreview');select.replaceChildren();for(const id of u.shield.stages){const stage=unit(id),o=document.createElement('option');o.value=id===u.id?'':id;o.textContent=stage.name+(id===u.id?' · as built':' · after upgrade');select.append(o);}select.value=preview||'';$('shieldPreviewNote').textContent=preview?`Coverage only: the saved template still builds ${u.name}.`:'Preview future upgrades without changing the saved unit.';$('shieldControls').classList.remove('hidden');}
  }
  el.classList.toggle('hidden',!el.children.length);
}
function renderQueues(){if(state.mode!=='factory')return;$('queueRows').replaceChildren();const t=current();if(!t?.queue.length){const d=document.createElement('div');d.className='empty-list';d.textContent='Select a unit from the catalog to start the production queue.';$('queueRows').append(d);return;}
  t.queue.forEach((e,i)=>{const row=document.createElement('div');row.className='queue-row';const order=document.createElement('span');order.className='order';order.textContent=i+1;row.append(order,icon(e.id));const name=document.createElement('div');name.className='queue-label';name.textContent=unit(e.id).name;const sub=document.createElement('small');sub.textContent=e.id;name.append(sub);row.append(name);const multiply=document.createElement('span');multiply.className='multiply';multiply.textContent='×';row.append(multiply);const count=document.createElement('input');count.type='number';count.min=1;count.max=9999;count.value=e.count;count.setAttribute('aria-label',`Quantity for queue entry ${i+1}`);count.addEventListener('change',()=>{const n=Number(count.value);if(n===e.count)return;edit(()=>{if(!Number.isInteger(n)||n<1||n>9999)throw new Error('Queue quantities must be between 1 and 9999');e.count=n;});});row.append(count);for(const [label,delta] of [['↑',-1],['↓',1]]){const b=document.createElement('button');b.textContent=label;b.title=delta<0?'Build earlier':'Build later';b.disabled=i+delta<0||i+delta>=t.queue.length;b.addEventListener('click',()=>edit(()=>{[t.queue[i],t.queue[i+delta]]=[t.queue[i+delta],t.queue[i]];}));row.append(b);}const del=document.createElement('button');del.className='danger quiet';del.textContent='✕';del.title='Remove queue entry';del.addEventListener('click',()=>edit(()=>t.queue.splice(i,1)));row.append(del);$('queueRows').append(row);});
}
function render(){if(!state.doc||!state.catalog)return;$('profileSelect').replaceChildren();state.doc.profiles.forEach((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=p.name;$('profileSelect').append(o);});$('profileSelect').value=state.profile;renderTemplates();renderFactionFilters();renderTools();renderUnits();renderSummary();renderSelection();renderValidation();renderQueues();renderTotals();renderLiveDetails();const auto=crossFactionEnabled();$('factionHelp').textContent=state.mode==='building'?`FAF cross-faction templates: ${auto?'ON':'OFF'} in this profile. Filters show the whole layout’s compatibility. One missing counterpart hides the entire layout in-game.`:'Factory queues use explicit unit IDs and are faction-specific.';$('catalogInfo').textContent=`FAF ${state.catalog.version} · ${state.catalog.units.length} units / ${state.catalog.units.filter(Sim.directlyBuildable).length} placeable structures`;resizeCanvas();drawGrid();}
function setMode(mode){state.mode=mode;state.selected=visibleTemplates()[0]?.i??-1;state.selectedBuilding=-1;const opts=mode==='building'?[['all','All structures'],['economy','Economy'],['defense','Defense'],['factory','Factories'],['intel','Intel'],['other','Other']]:[['all','All factories'],['Land','Land units'],['Air','Air units'],['Naval','Naval units'],['upgrade','Factory upgrades']];$('roleFilter').replaceChildren();for(const [value,label] of opts){const o=document.createElement('option');o.value=value;o.textContent=label;$('roleFilter').append(o);}const first=(current()?.buildings||current()?.queue||[])[0];if(first&&state.units.has(first.id))state.faction=unit(first.id).faction;if(state.mode==='factory')state.faction=state.queueFaction;fit();render();}
function appendQueue(u){edit(()=>{const t=ensureTemplate();const existing=t.queue[0]&&unit(t.queue[0].id);if(existing&&existing.faction!==u.faction)throw new Error(`This queue is ${existing.faction}. Create a new queue for ${u.faction}.`);if(!t.queue.length){if(t.name==='New factory queue')t.name=u.domain+' factory queue';if(t.icon==='default')t.icon=u.id;}const last=t.queue.at(-1);if(last?.id===u.id){if(last.count>=9999)throw new Error('Queue quantity limit reached');last.count++;}else t.queue.push({id:u.id,count:1});});}
function geometry(){const r=$('grid').getBoundingClientRect();return View.geometry(r.width,r.height,state.gridSize);}
function point(event){const r=$('grid').getBoundingClientRect(),g=geometry();return {x:Math.round(((event.clientX-r.left-g.cx)/g.cell+state.viewX)/state.snap)*state.snap,z:Math.round(((event.clientY-r.top-g.cz)/g.cell+state.viewZ)/state.snap)*state.snap};}
function placementPreview(){const u=state.units.get(state.selectedUnit);return state.hover&&state.tool==='place'&&u?.structure?Layout.planAdditions(current()?.buildings||[],Layout.symmetricBuildings({id:u.id,...state.hover},state.placementSymmetry),state.units):{rows:[],blocked:false};}
function drawGrid(){
  if(state.mode!=='building'||!state.catalog)return;const canvas=$('grid'),g=geometry();if(!g.width||!g.height)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(g.width*dpr);canvas.height=Math.round(g.height*dpr);const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#13222c';ctx.fillRect(0,0,g.width,g.height);
  const px=x=>g.cx+(x-state.viewX)*g.cell,pz=z=>g.cz+(z-state.viewZ)*g.cell,left=state.viewX+(g.left-g.cx)/g.cell,right=state.viewX+(g.right-g.cx)/g.cell,top=state.viewZ+(g.top-g.cz)/g.cell,bottom=state.viewZ+(g.bottom-g.cz)/g.cell;$('zoomLevel').textContent=Math.round(3000/state.gridSize)+'%';
  ctx.font='9px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let x=Math.ceil(left);x<=right;x++){ctx.strokeStyle=x===0?'#446070':x%5===0?'#2a424f':'#1e3340';ctx.lineWidth=x===0?1.2:.7;ctx.beginPath();ctx.moveTo(px(x),pz(top));ctx.lineTo(px(x),pz(bottom));ctx.stroke();if(x%5===0){ctx.fillStyle='#748d9c';ctx.fillText(x,px(x),pz(top)-10);}}
  for(let z=Math.ceil(top);z<=bottom;z++){ctx.strokeStyle=z===0?'#446070':z%5===0?'#2a424f':'#1e3340';ctx.lineWidth=z===0?1.2:.7;ctx.beginPath();ctx.moveTo(px(left),pz(z));ctx.lineTo(px(right),pz(z));ctx.stroke();if(z%5===0){ctx.fillStyle='#748d9c';ctx.fillText(z,px(left)-12,pz(z));}}
  ctx.save();ctx.beginPath();ctx.rect(g.left,g.top,g.right-g.left,g.bottom-g.top);ctx.clip();
  const t=current(),items=t?.buildings||[],analysis=simulation(),preview=placementPreview();
  if(state.placementSymmetry!=='none'&&state.tool==='place'){ctx.save();ctx.strokeStyle='#ed997388';ctx.lineWidth=1.5;ctx.setLineDash([7,5]);ctx.beginPath();if(['x','both'].includes(state.placementSymmetry)){ctx.moveTo(px(0),pz(top));ctx.lineTo(px(0),pz(bottom));}if(['z','both'].includes(state.placementSymmetry)){ctx.moveTo(px(left),pz(0));ctx.lineTo(px(right),pz(0));}ctx.stroke();ctx.restore();}
  const drawShield=(b,i,ghost=false)=>{const id=ghost?b.id:previewId(b)||b.id,u=unit(id),s=Sim.shieldCoverage(u);if(!s)return;const selected=i===state.selectedBuilding,X=px(b.x),Z=pz(b.z);ctx.save();ctx.fillStyle=ghost?'#82c9df08':selected?'#8ad3e819':'#72bada0b';ctx.strokeStyle=selected?'#91dbefb3':'#70b7d25c';ctx.lineWidth=selected?1.5:1;ctx.beginPath();ctx.arc(X,Z,s.groundRadius*g.cell,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([5,4]);ctx.strokeStyle=selected?'#a1d8e993':'#6da2b941';ctx.beginPath();ctx.arc(X,Z,s.radius*g.cell,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);if(!ghost){ctx.fillStyle=selected?'#c5eaf5':'#83b3c5';ctx.font='10px Segoe UI';ctx.textAlign='center';ctx.fillText(`${u.name} · R ${Sim.formatNumber(s.radius)}${id!==b.id?' · preview':''}`,X,Z-s.radius*g.cell-7);}ctx.restore();};
  if(state.showShields){items.forEach((b,i)=>drawShield(b,i));for(const r of preview.rows)if(!r.duplicate)drawShield(r.building,-2,true);}
  const drawBuilding=(b,i,ghost=false,blocked=false)=>{const u=unit(b.id),r=Core.placementRect(b,u),x=px(r.x0),z=pz(r.z0),W=r.w*g.cell,H=r.h*g.cell;const selected=i===state.selectedBuilding;let bad=u.directBuildable===false;if(ghost)bad=blocked||bad;
    ctx.fillStyle=ghost?(bad?'#c6655b33':'#71bbd844'):(selected?'#497390aa':'#31556a99');ctx.strokeStyle=ghost?(bad?'#ee8c89':'#9fd2ec'):(selected?'#a9d5ed':'#5d879f');ctx.lineWidth=selected?2:1;ctx.fillRect(x+1,z+1,W-2,H-2);ctx.strokeRect(x+1,z+1,W-2,H-2);
    const labels=!ghost&&state.showStats?Sim.gridLabels(analysis.rows[i]):[],lineHeight=W<60?9.5:13,labelHeight=labels.length*lineHeight+3;
    const image=img(b.id);if(image.complete&&image.naturalWidth&&W>20&&H>20){ctx.globalAlpha=ghost?.55:.94;const side=labels.length?Math.min(W-8,H-labelHeight-7,W<60?15:55):Math.min(W-8,H-8,55);if(side>5)ctx.drawImage(image,x+W/2-side/2,z+(H-labelHeight)/2-side/2,side,side);ctx.globalAlpha=1;}
    if(!ghost&&Math.min(W,H)>=18){ctx.fillStyle='#edf6fb';ctx.textAlign='left';ctx.font='bold 9px Segoe UI';ctx.fillText(i+1,x+4,z+8);}
    if(labels.length&&W>=25&&H>=29){ctx.save();ctx.beginPath();ctx.rect(x+1,z+1,W-2,H-2);ctx.clip();ctx.fillStyle='#122029b8';ctx.fillRect(x+2,z+H-labelHeight,W-4,labelHeight-1);ctx.textAlign='center';ctx.font=(W<60?'8.5':'11')+'px Segoe UI';labels.forEach((label,n)=>{ctx.fillStyle=label.color;ctx.fillText(W<60?label.text.replace(' / shot',''):label.text,x+W/2,z+H-labelHeight+lineHeight*(n+.5)+1,W-5);});ctx.restore();}
  };
  items.forEach((b,i)=>drawBuilding(b,i));
  if(state.showAdjacency){const pairs=new Map();for(const link of analysis.links){if(state.selectedBuilding>=0&&link.from!==state.selectedBuilding&&link.to!==state.selectedBuilding)continue;const key=[link.from,link.to].sort((a,b)=>a-b).join(':');if(!pairs.has(key)||link.effect==='RateOfFire')pairs.set(key,link);}ctx.save();ctx.lineWidth=2.5;for(const link of pairs.values()){const a=Core.placementRect(items[link.from],unit(items[link.from].id)),b=Core.placementRect(items[link.to],unit(items[link.to].id));ctx.strokeStyle=link.effect==='MassProduction'?'#9dddae':link.effect==='EnergyProduction'?'#efd18e':link.effect==='RateOfFire'?'#b5b6f0':'#78bbd5';ctx.beginPath();if(Math.abs(a.x1-b.x0)<1e-5||Math.abs(b.x1-a.x0)<1e-5){const X=px(Math.abs(a.x1-b.x0)<1e-5?a.x1:b.x1);ctx.moveTo(X,pz(Math.max(a.z0,b.z0)));ctx.lineTo(X,pz(Math.min(a.z1,b.z1)));}else{const Z=pz(Math.abs(a.z1-b.z0)<1e-5?a.z1:b.z1);ctx.moveTo(px(Math.max(a.x0,b.x0)),Z);ctx.lineTo(px(Math.min(a.x1,b.x1)),Z);}ctx.stroke();}ctx.restore();}
  for(const r of preview.rows)if(!r.duplicate)drawBuilding(r.building,-2,true,preview.blocked);
  const selected=items[state.selectedBuilding];if(selected&&state.showStats){const r=Core.placementRect(selected,unit(selected.id)),labels=Sim.gridLabels(analysis.rows[state.selectedBuilding]);if(labels.length&&Math.min(r.w,r.h)*g.cell<29){ctx.save();ctx.font='10px Segoe UI';const width=Math.max(86,...labels.map(l=>ctx.measureText(l.text).width+16)),X=Math.max(px(left)+width/2,Math.min(px(right)-width/2,px(selected.x))),Y=Math.max(pz(top)+4,pz(r.z0)-labels.length*14-10);ctx.fillStyle='#0e1c27ee';ctx.strokeStyle='#6d92a9';ctx.fillRect(X-width/2,Y,width,labels.length*14+7);ctx.strokeRect(X-width/2,Y,width,labels.length*14+7);ctx.textAlign='center';labels.forEach((l,n)=>{ctx.fillStyle=l.color;ctx.fillText(l.text,X,Y+11+n*14);});ctx.restore();}}
  ctx.restore();const ox=px(0),oz=pz(0);if(ox>=px(left)&&ox<=px(right)&&oz>=pz(top)&&oz<=pz(bottom)){ctx.strokeStyle='#ed9973';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ox-9,oz);ctx.lineTo(ox+9,oz);ctx.moveTo(ox,oz-9);ctx.lineTo(ox,oz+9);ctx.stroke();ctx.fillStyle='#edb296';ctx.font='9px Segoe UI';ctx.textAlign='left';ctx.fillText('cursor',ox+12,oz-10);}
  $('emptyGrid').classList.toggle('hidden',items.length>0);
}
function hit(p){const items=current()?.buildings||[];for(let i=items.length-1;i>=0;i--){const r=Core.placementRect(items[i],unit(items[i].id));if(p.x>=r.x0&&p.x<=r.x1&&p.z>=r.z0&&p.z<=r.z1)return i;}return -1;}
function buildingDescription(i){const b=current()?.buildings?.[i];if(!b)return '';const u=unit(b.id),r=simulation().rows[i],lines=[`${u.name} · ${b.id}`];if(r.massBase)lines.push(`Mass: +${Sim.formatNumber(r.mass)} /s (base ${r.massBase})`);if(r.energyBase)lines.push(`Energy: +${Sim.formatNumber(r.energy)} /s (base ${r.energyBase})`);if(r.energyUseBase)lines.push(`Energy upkeep: ${Sim.formatNumber(r.energyUse)} /s (base ${r.energyUseBase})`);if(r.intervalBase)lines.push(`Nominal shot interval: ${Sim.formatNumber(r.interval)} s (base ${Sim.formatNumber(r.intervalBase)} s)`);if(u.shield){const v=unit(previewId(b)||b.id),s=Sim.shieldCoverage(v);lines.push(`${v.name} shield radius: ${s.radius} cells · ground radius ${Sim.formatNumber(s.groundRadius,2)}`);}if(r.sources.length)lines.push('Bonus from: '+[...new Set(r.sources.map(s=>unit(current().buildings[s.from].id).name))].join(', '));return lines.join('\n');}
$('grid').addEventListener('pointermove',event=>{if(state.pan){const g=geometry();state.viewX=state.pan.viewX-(event.clientX-state.pan.x)/g.cell;state.viewZ=state.pan.viewZ-(event.clientY-state.pan.y)/g.cell;drawGrid();return;}const p=point(event);state.hover=p;$('canvasCoords').textContent=`X ${p.x}  Z ${p.z}`;if(state.drag){const b=current().buildings[state.drag.index];b.x=state.drag.x+p.x-state.drag.point.x;b.z=state.drag.z+p.z-state.drag.point.z;renderSelection();renderSummary();renderValidation();renderLiveDetails();renderTotals();}$('grid').title=buildingDescription(hit(p));drawGrid();});
$('grid').addEventListener('pointerleave',()=>{if(!state.drag){state.hover=null;$('canvasCoords').textContent='';drawGrid();}});
$('grid').addEventListener('pointerdown',event=>{
  if(event.button===1||event.button===0&&state.spaceDown){event.preventDefault();state.pan={x:event.clientX,y:event.clientY,viewX:state.viewX,viewZ:state.viewZ};state.hover=null;$('grid').style.cursor='grabbing';$('grid').setPointerCapture(event.pointerId);return;}if(event.button!==0)return;const p=point(event),h=hit(p),t=current();
  if(state.tool==='select'){state.selectedBuilding=h;if(h>=0){const b=t.buildings[h];state.drag={index:h,x:b.x,z:b.z,point:p,before:snapshot()};$('grid').setPointerCapture(event.pointerId);}renderSelection();renderLiveDetails();renderUnitDetails();drawGrid();return;}
  if(state.tool==='erase'){if(h>=0)edit(()=>{t.buildings.splice(h,1);state.selectedBuilding=-1;});return;}
  if(state.tool==='anchor'){if(t?.buildings.length)edit(()=>{Core.moveAnchor(t,p.x,p.z);state.viewX-=p.x;state.viewZ-=p.z;});return;}
  const u=state.units.get(state.selectedUnit);if(!Sim.directlyBuildable(u)){toast('Select a directly buildable structure in the catalog first.');return;}
  try{
    const result=Layout.appendBuildings(t?.buildings||[],Layout.symmetricBuildings({id:u.id,x:p.x,z:p.z},state.placementSymmetry),state.units);
    if(!result.added){toast('Those buildings are already present.');return;}
    edit(()=>{const tpl=ensureTemplate();if(!tpl.buildings.length){if(tpl.icon==='default')tpl.icon=u.id;if(tpl.name==='New layout')tpl.name=u.description+' layout';}tpl.buildings=result.buildings;state.selectedBuilding=tpl.buildings.length-result.added;});
  }catch(e){toast(e.message,true);}
});
function finishDrag(){if(state.pan){state.pan=null;$('grid').style.cursor=state.spaceDown?'grab':'';return;}if(!state.drag)return;const d=state.drag;state.drag=null;const b=current().buildings[d.index];if(current().buildings.some((other,i)=>i!==d.index&&Core.overlaps(b,other,state.units))){b.x=d.x;b.z=d.z;toast('Move cancelled: the building would overlap another footprint.',true);}else if(b.x!==d.x||b.z!==d.z){state.history.push(d.before);state.redo=[];}render();}
$('grid').addEventListener('pointerup',finishDrag);$('grid').addEventListener('pointercancel',finishDrag);
$('grid').addEventListener('contextmenu',event=>{event.preventDefault();const i=hit(point(event));if(i>=0)edit(()=>{current().buildings.splice(i,1);state.selectedBuilding=-1;});});
function zoom(factor,x,y){const g=geometry();Object.assign(state,View.zoomAt(state,g.width,g.height,x??g.cx,y??g.cz,factor));state.hover=null;drawGrid();}
$('grid').addEventListener('wheel',event=>{event.preventDefault();if(state.drag||state.pan)return;const r=$('grid').getBoundingClientRect(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?r.height:1);if(delta)zoom(Math.exp(Math.max(-0.35,Math.min(0.35,delta*0.0018))),event.clientX-r.left,event.clientY-r.top);},{passive:false});
$('grid').addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
function modal(title,body,actions=[]){$('modalTitle').textContent=title;$('modalBody').replaceChildren(body);$('modalActions').replaceChildren();for(const a of actions){const b=document.createElement('button');b.textContent=a.label;b.className=a.primary?'primary':'';b.addEventListener('click',a.action);$('modalActions').append(b);}$('modal').showModal();}
function confirmAction(title,message){return new Promise(resolve=>{const p=document.createElement('p');p.textContent=message;const close=()=>resolve(false);$('modal').addEventListener('close',close,{once:true});modal(title,p,[{label:'Cancel',action:()=>$('modal').close()},{label:'Continue',primary:true,action:()=>{resolve(true);$('modal').close();}}]);});}
$('closeModal').addEventListener('click',()=>$('modal').close());
function showIconPicker(){
  const t=current();if(!t)return;
  const body=document.createElement('div'),controls=document.createElement('div');controls.className='icon-picker-controls';
  const search=document.createElement('input');search.id='iconSearch';search.placeholder='Search unit name, role or ID…';search.setAttribute('aria-label','Search template icons');
  const faction=document.createElement('select');faction.id='iconFaction';faction.setAttribute('aria-label','Icon faction');
  for(const f of ['All factions',...Core.factions]){const o=document.createElement('option');o.value=f;o.textContent=f;faction.append(o);}
  const scope=document.createElement('select');scope.id='iconScope';scope.setAttribute('aria-label','Icon source');
  for(const [value,label] of [['template','Units in this template'],['all','All unit icons']]){const o=document.createElement('option');o.value=value;o.textContent=label;scope.append(o);}
  controls.append(search,faction,scope);const grid=document.createElement('div');grid.className='icon-picker-grid';grid.id='iconChoices';body.append(controls,grid);
  const draw=()=>{grid.replaceChildren();const ids=new Set((t.buildings||t.queue).map(e=>e.id)),query=search.value.toLowerCase().trim();
    const choices=state.catalog.units.filter(u=>(scope.value==='all'||ids.has(u.id))&&(faction.value==='All factions'||u.faction===faction.value)&&(!query||`${u.name} ${u.description} ${u.id}`.toLowerCase().includes(query)));
    for(const u of choices){const b=document.createElement('button');b.className='icon-choice'+(t.icon===u.id?' active':'');b.dataset.icon=u.id;b.title=`${u.name} · ${u.description} · ${u.faction} · ${u.id}`;const im=icon(u.id);im.loading='lazy';const name=document.createElement('span');name.textContent=u.name;const id=document.createElement('small');id.textContent=u.id;b.append(im,name,id);b.addEventListener('click',()=>{if(t.icon!==u.id)edit(()=>t.icon=u.id);$('modal').close();});grid.append(b);}
    if(!choices.length){const p=document.createElement('p');p.className='muted';p.textContent='No matching icons. Try All unit icons.';grid.append(p);}
  };
  search.addEventListener('input',draw);faction.addEventListener('change',draw);scope.addEventListener('change',draw);
  if(!(t.buildings||t.queue).length)scope.value='all';draw();
  modal('Choose template icon',body,[{label:'Cancel',action:()=>$('modal').close()},{label:'Use first unit',action:()=>{const first=(t.buildings||t.queue)[0];if(first)edit(()=>t.icon=first.id);$('modal').close();}}]);search.focus();
}
$('templateIcon').addEventListener('click',showIconPicker);
for(const [id,delta] of [['templateFirst',0],['templateUp',-1],['templateDown',1]])$(id).addEventListener('click',()=>{
  const visible=visibleTemplates(),position=visible.findIndex(v=>v.i===state.selected),to=id==='templateFirst'?0:visible[position+delta]?.i;
  if(to===undefined||state.selected<0||to===state.selected)return;
  edit(()=>{state.selected=Core.moveTemplate(list(),state.selected,to);});
});
function refreshTemplateFilters(){const visible=visibleTemplates();if(!visible.some(v=>v.i===state.selected))state.selected=visible[0]?.i??-1;state.selectedBuilding=-1;fit();render();}
$('factionSpecific').addEventListener('change',()=>{state.factionSpecific=$('factionSpecific').checked;refreshTemplateFilters();});
$('allTemplateFactions').addEventListener('click',()=>{state.layoutFactions=[...Core.factions];state.factionSpecific=false;refreshTemplateFilters();});
$('repairUpgrades').addEventListener('click',()=>edit(()=>{const t=current();t.buildings=t.buildings.map(b=>{const u=state.units.get(b.id);if(u?.directBuildable!==false||!u.templateReplacement)return b;if(t.icon===b.id)t.icon=u.templateReplacement;return {...b,id:u.templateReplacement};});}));
$('queueFactory').addEventListener('change',()=>{if(current()){current()._producer=$('queueFactory').value;current()._producerManual=true;renderTotals();}});
$('queueAssist').addEventListener('change',()=>{const n=Number($('queueAssist').value);if(!Number.isFinite(n)||n<0||n>100000){toast('Assist build power must be between 0 and 100,000.',true);renderTotals();return;}if(current()){current()._assist=n;renderTotals();}});
function download(name,text){const b=new Blob([text],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function copyTextField(input, status, message) {
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = message;
  } catch {
    input.focus();
    input.select();
    status.textContent = 'Press Ctrl+C or Command+C to copy the selected text.';
  }
}

$('prefsLocation').addEventListener('click', () => {
  const body = $('prefsLocationContent').content.cloneNode(true);
  const folder = body.querySelector('#prefsFolder');
  const status = body.querySelector('[role="status"]');
  modal('Find Game.prefs', body, [{
    label: 'Copy folder path',
    primary: true,
    action: () => copyTextField(folder, status, 'Folder path copied.')
  }]);
});
$('openPrefs').addEventListener('click', () => $('prefsInput').click());
$('prefsInput').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  $('openPrefs').disabled = true;
  try {
    const doc = Core.readPrefs(await readPrefsFile(file));
    if (state.prefsName && hasUnexportedChanges()) {
      const confirmed = await confirmAction('Open another prefs file?', 'Export a copy to keep your current changes before switching files.');
      if (!confirmed) return;
    }
    connectFile(doc, file.name);
    toast(`Opened ${file.name}.`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    $('openPrefs').disabled = false;
  }
});

function exportPrefs() {
  if (!state.prefsName) {
    toast('Open Game.prefs to export a prefs copy. You can export a template as Lua from this workspace.');
    return;
  }
  try {
    const patches = Core.buildPatches(state.doc, state.units);
    const text = patches.length ? Core.applyPatches(state.doc.text, patches) : state.doc.text;
    download('Game.prefs', text);
    state.exportedSignature = workspaceSignature();
    renderTools();
    toast('Prefs copy exported. Use Find Game.prefs for the folder path and replacement steps.');
  } catch (error) {
    toast(error.message, true);
  }
}
$('exportPrefs').addEventListener('click', exportPrefs);
$('profileSelect').addEventListener('change',()=>{state.profile=Number($('profileSelect').value);state.selected=visibleTemplates()[0]?.i??-1;state.selectedBuilding=-1;fit();render();});
$('buildingTab').addEventListener('click',()=>setMode('building'));$('queueTab').addEventListener('click',()=>setMode('factory'));
$('newTemplate').addEventListener('click',()=>edit(()=>{list().push(makeTemplate());state.selected=list().length-1;state.selectedBuilding=-1;fit();}));
$('duplicateTemplate').addEventListener('click',()=>edit(()=>{const t=structuredClone(current());t.name=Core.displayName(t.name)+' (copy)';delete t.raw;delete t.originalSignature;list().splice(state.selected+1,0,t);state.selected++;}));
$('removeTemplate').addEventListener('click',async()=>{if(await confirmAction('Delete template?',`Remove "${Core.displayName(current()?.name)}" from this workspace? You can undo this.`))edit(()=>{list().splice(state.selected,1);const visible=visibleTemplates();state.selected=(visible.find(v=>v.i>=state.selected)||visible.at(-1))?.i??-1;state.selectedBuilding=-1;});});
$('templateName').addEventListener('change',()=>{const name=$('templateName').value;if(current()&&name!==Core.displayName(current().name))edit(()=>current().name=name);});
for(const b of $$('.toolbar [data-tool]'))b.addEventListener('click',()=>{state.tool=b.dataset.tool;renderTools();drawGrid();});
$('center').addEventListener('click',()=>edit(()=>{const off=Core.centerTemplate(current(),state.units);state.viewX-=off.x;state.viewZ-=off.z;}));
function transformLayout(operation){try{const result=Layout.transformBuildings(current().buildings,operation,state.units,state.keepOriginal);if(state.keepOriginal&&!result.added){toast('No new copies: matching buildings are already present.');return;}edit(()=>{current().buildings=result.buildings;state.selectedBuilding=-1;fit();});if(state.keepOriginal)toast(`Added ${result.added} copies`+(result.skipped?`; ${result.skipped} matching positions skipped.`:'.'));}catch(e){toast(e.message,true);}}
$('rotate').addEventListener('click',()=>transformLayout('rotate'));$('mirror').addEventListener('click',()=>transformLayout(state.mirrorAxis==='x'?'mirrorX':'mirrorZ'));
$('keepOriginal').addEventListener('change',()=>{state.keepOriginal=$('keepOriginal').checked;renderTools();});
$('mirrorAxis').addEventListener('change',()=>{state.mirrorAxis=$('mirrorAxis').value;renderTools();});
$('placementSymmetry').addEventListener('change',()=>{state.placementSymmetry=$('placementSymmetry').value;renderTools();drawGrid();});
$('zoomIn').addEventListener('click',()=>zoom(1/1.2));$('zoomOut').addEventListener('click',()=>zoom(1.2));$('snap').addEventListener('change',()=>state.snap=Number($('snap').value));$('fitView').addEventListener('click',()=>{fit();drawGrid();});
for(const id of ['showShields','showStats','showAdjacency'])$(id).addEventListener('change',()=>{state[id]=$(id).checked;drawGrid();});
$('shieldPreview').addEventListener('change',()=>{const t=current(),b=t?.buildings[state.selectedBuilding];if(!b)return;if(!shieldPreviews.has(t))shieldPreviews.set(t,new Map());shieldPreviews.get(t).set(b.entity+':'+b.id,$('shieldPreview').value);fit();render();});
function undo(){if(!state.history.length)return;state.redo.push(snapshot());restore(state.history.pop());render();}function redo(){if(!state.redo.length)return;state.history.push(snapshot());restore(state.redo.pop());render();}
$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
for(const id of ['positionX','positionZ'])$(id).addEventListener('change',()=>edit(()=>{const b=current().buildings[state.selectedBuilding],value=Number($(id).value);if(!Number.isFinite(value)||Math.abs(value)>100000)throw new Error('Enter a valid position');const copy={...b,[id==='positionX'?'x':'z']:value};if(current().buildings.some((e,i)=>i!==state.selectedBuilding&&Core.overlaps(copy,e,state.units)))throw new Error('That position overlaps another footprint');Object.assign(b,copy);}));
for(const [id,delta] of [['earlier',-1],['later',1]])$(id).addEventListener('click',()=>edit(()=>{const a=current().buildings,i=state.selectedBuilding;if(i+delta<0||i+delta>=a.length)return;[a[i],a[i+delta]]=[a[i+delta],a[i]];state.selectedBuilding+=delta;}));
function deleteSelected(){if(state.selectedBuilding>=0)edit(()=>{current().buildings.splice(state.selectedBuilding,1);state.selectedBuilding=-1;});}
$('deleteBuilding').addEventListener('click',deleteSelected);
for(const b of $$('#factionButtons button'))b.addEventListener('click',()=>{state.faction=b.dataset.faction;state.selectedUnit=null;if(state.mode==='factory'){state.queueFaction=state.faction;state.selected=visibleTemplates()[0]?.i??-1;state.selectedBuilding=-1;render();}else{renderUnits();drawGrid();}});
$('convertFaction').addEventListener('click',()=>edit(()=>{Core.convertFaction(current(),state.faction,state.units);toast('Converted layout to '+state.faction+'. Check its footprint before using it.');}));
$('unitSearch').addEventListener('input',()=>{renderUnits();drawGrid();});for(const id of ['techFilter','roleFilter'])$(id).addEventListener('change',()=>{renderUnits();drawGrid();});
function addTemplates(items) {
  edit(() => {
    const p = profile();
    const first = items[0];
    const firstIndex = (first.kind === 'building' ? p.buildings : p.queues).length;
    for (const item of items) {
      const target = item.kind === 'building' ? p.buildings : p.queues;
      target.push(structuredClone(item));
    }
    state.layoutFactions = [...Core.factions];
    state.factionSpecific = false;
    if (first.kind === 'factory') {
      state.queueFaction = Core.templateCompatibility(first, state.units).factions[0] || state.queueFaction;
    }
    setMode(first.kind);
    state.selected = firstIndex;
    state.selectedBuilding = -1;
    fit();
  });
}

function showTransfer(mode) {
  $('transferMenu').open = false;
  openTransfer({mode,profile:profile(),current:current(),units:state.units,modal,download,notify:toast,onImport:addTemplates});
}
$('importLua').addEventListener('click',()=>showTransfer('import'));
$('exportLua').addEventListener('click',()=>showTransfer('export'));
$('shareTemplate').addEventListener('click', async () => {
  $('transferMenu').open = false;
  try {
    const url = await createTemplateLink(current(), state.units, location.href);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
    const body = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = local ? 'This localhost link opens on this computer.' : 'Anyone with this link can open this version of the template.';
    const input = document.createElement('input');
    input.className = 'copy-field';
    input.value = url;
    input.readOnly = true;
    input.setAttribute('aria-label', 'Template link');
    const status = document.createElement('p');
    status.className = 'muted';
    status.setAttribute('role', 'status');
    label.append(input);
    body.append(label, status);
    modal('Share template link', body, [{
      label: 'Copy link', primary: true, action: () => copyTextField(input, status, 'Link copied.')
    }]);
    input.select();
  } catch (error) {
    toast(error.message, true);
  }
});

async function loadSharedTemplate() {
  if (!state.doc) return;
  const fragment = location.hash;
  const value = new URLSearchParams(fragment.slice(1)).get('template');
  if (value === null) return;
  try {
    const template = await readTemplateLink(value);
    if (fragment !== location.hash) return;
    addTemplates([template]);
    toast(`Opened shared template “${Core.displayName(template.name)}”.`);
  } catch {
    if (fragment === location.hash) toast('Could not open this template link. Check that the full link was copied.', true);
  }
}
window.addEventListener('hashchange', loadSharedTemplate);
document.addEventListener('click',event=>{if(!$('transferMenu').contains(event.target))$('transferMenu').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('transferMenu').open=false;});
$('helpButton').addEventListener('click',()=>{const d=document.createElement('div');d.className='help-columns';for(const [title,text] of [
  ['Build a layout','Choose a faction, tech level and structure in the catalog. Click the grid to place it. Footprints use actual FAF placement sizes, not the visual model dimensions.'],
  ['Copies and symmetry','Keep original makes Rotate and Mirror add copies around the orange placement cursor. Choose X for left/right mirroring or Z for top/bottom. Exact duplicates are skipped; overlapping copies cancel the whole action. Symmetry affects new placements only, with a preview and axis guides. Each group of copies is one Undo step. These tools transform building positions, not blueprint model headings.'],
  ['Move the cursor','The orange + is the in-game placement anchor. Center puts it in the middle of the layout. Set anchor lets you choose a specific point, including an empty spot for an existing extractor.'],
  ['Factory queues','Switch to Factory queues and click units in the catalog to append them. Quantities and row order are saved. The faction icons select that faction’s queues. The economy panel estimates time-weighted drain for the chosen factory and optional assist build power.'],
  ['Share templates','Open Import / Export to share the selected template as a link or export layouts and queues as Lua. For a .lua file or pasted Lua, preview your choices and add selected templates. Undo reverses the import.'],
  ['Use templates in FAF','Find Game.prefs shows the default Windows folder. Open your file, edit the layouts or queues, then export a copy. Close the game and keep a backup of the original before placing the copy in the game folder.'],
  ['Factions','FAF’s All faction templates option converts matching structure IDs at game time. Convert layout changes the stored blueprint IDs; matching layouts can still work for other factions. The four icons above the template list filter compatibility and do not restrict saved layouts. Exclusive structures are flagged when no matching ID exists. Factory queues are faction-specific.'],
  ['Shields and upgrades','Shield circles show the ground footprint (solid) and widest sphere radius (dashed) on level ground. Select a Cybran shield to preview its later upgrades. ED2, ED3 and ED5 are preview-only; saved layouts use directly buildable ED1 or ED4.'],
  ['Live economy and artillery','Grid M/E values are per second with storage bonuses and generator upkeep discounts. Colored edges mark valid full-edge adjacency. Adjacency bonuses only toggles those highlights, not the calculations; select a building to focus its links. Select a building for base values and percentages. Artillery shows its nominal shot interval at full power; aiming and energy stalls can delay shots. Factory production bonuses are outside these estimates.'],
  ['Useful controls','Use Move to select and drag a building. Right-click to remove one. Ctrl+Z and Ctrl+Y undo and redo changes. Ctrl+S exports a prefs copy. Use the mouse wheel to zoom at the cursor. Middle-drag or hold Space and drag to pan.']]){const section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=title;p.textContent=text;section.append(h,p);d.append(section);}modal('Workshop help',d,[{label:'Got it',primary:true,action:()=>$('modal').close()}]);});
window.addEventListener('keydown',event=>{if(!state.doc||$('modal').open)return;const input=['INPUT','TEXTAREA','SELECT','SUMMARY'].includes(document.activeElement.tagName);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();exportPrefs();return;}if(input)return;if(event.code==='Space'&&state.mode==='building'){event.preventDefault();state.spaceDown=true;if(!state.pan)$('grid').style.cursor='grab';return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}if(event.key==='Delete')deleteSelected();});
window.addEventListener('keyup',event=>{if(event.code==='Space'){state.spaceDown=false;if(!state.pan)$('grid').style.cursor='';}});
window.addEventListener('blur',()=>{state.spaceDown=false;if(state.pan)finishDrag();$('grid').style.cursor='';});
window.addEventListener('beforeunload',event=>{if(state.doc&&hasUnexportedChanges()){event.preventDefault();event.returnValue='';}});
new ResizeObserver(drawGrid).observe($('canvasWrap'));
window.addEventListener('resize',()=>{resizeCanvas();drawGrid();});
$('economyDetails').addEventListener('toggle',()=>{state.economyExpanded[state.mode]=$('economyDetails').open;});
function decorateControls(){
  const paths={
    '[data-tool="place"]':['M3 3h12v12H3z','M9 6v6M6 9h6'],
    '[data-tool="select"]':['M9 1v16M1 9h16','m6 4 3-3 3 3M6 14l3 3 3-3M4 6 1 9l3 3M14 6l3 3-3 3'],
    '[data-tool="erase"]':['m3 10 7-7 5 5-7 7H6z','m7 6 5 5M9 15h7'],
    '[data-tool="anchor"]':['M9 1v4M9 13v4M1 9h4M13 9h4','M6 6h6v6H6z'],
    '#center':['M9 1v5M9 12v5M1 9h5M12 9h5','M7 7h4v4H7z'],
    '#rotate':['M14 6a6 6 0 1 0 1 7','M14 2v5h-5'],
    '#mirror':['M9 1v16','M6 4H2v10h4M12 4h4v10h-4'],
    '#fitView':['M6 2H2v4M12 2h4v4M2 12v4h4M16 12v4h-4'],
    '#undo':['M6 4 2 8l4 4','M2 8h8a5 5 0 0 1 5 5'],
    '#redo':['m12 4 4 4-4 4','M16 8H8a5 5 0 0 0-5 5']
  };
  for(const [selector,lines] of Object.entries(paths))for(const button of document.querySelectorAll(selector)){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 18 18');svg.setAttribute('aria-hidden','true');svg.classList.add('control-icon');
    for(const d of lines){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
    if(['undo','redo'].includes(button.id))button.replaceChildren(svg);else button.prepend(svg);
  }
}
async function fetchJSON(path) {
  const response = await fetch(path, {cache: 'no-cache'});
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

async function init() {
  decorateControls();
  try {
    const [catalog, rules] = await Promise.all([fetchJSON('catalog.json'), fetchJSON('adjacency.json')]);
    if (String(catalog.version) !== String(rules.version) || catalog.sourceCommit !== rules.sourceCommit) {
      throw new Error('The unit catalog and adjacency data are from different FAF builds. Reload the page.');
    }
    const prepared = Core.prepareCatalog(catalog);
    state.catalog = prepared.catalog;
    state.rules = rules;
    state.units = prepared.units;
    for (const button of $$('#factionButtons button')) {
      const faction = button.dataset.faction;
      const label = document.createElement('span');
      label.textContent = faction === 'Seraphim' ? 'Sera' : faction;
      button.replaceChildren(factionImage(faction), label);
    }
    connectFile(Core.readPrefs(EMPTY_PREFS));
    document.querySelector('main').inert = false;
    $('openPrefs').disabled = false;
    await loadSharedTemplate();
  } catch (error) {
    $('filePath').textContent = 'The editor could not start.';
    toast(error.message, true);
  }
}
// Exposed only for local diagnostics and the shipped integration tests.
window.workshop={state,Core,Sim,Factory,View,Layout,render,selectTemplate,setMode,exportPrefs,geometry,simulation,buildingDescription,visibleTemplates,zoom,resizeCanvas};
init();
