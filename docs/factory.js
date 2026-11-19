/* Nominal build drain. Travel, roll-off, stalls and adjacency are excluded. */
export function categoryMatch(spec,unit){
  const cats=new Set([...(unit?.categories||[]),unit?.id?.toUpperCase()]);
  // The bundled factory blueprints use intersections, with a list of alternatives.
  return !!unit&&spec.trim().split(/\s+/).every(c=>cats.has(c.toUpperCase()));
}
export function factoryCanBuild(factory,unit){return !!factory?.buildableCategories?.some(spec=>categoryMatch(spec,unit));}
export function factoryChoices(units,faction){
  const domains=['Land','Air','Naval'];
  return [...units.values()].filter(u=>u.structure&&u.factory&&u.faction===faction&&u.tech>=1&&u.tech<=3&&domains.includes(u.domain)&&u.categories?.includes(u.domain.toUpperCase())&&u.buildRate>0&&u.buildableCategories?.length)
    .sort((a,b)=>domains.indexOf(a.domain)-domains.indexOf(b.domain)||a.tech-b.tech||Number(a.categories.includes('SUPPORTFACTORY'))-Number(b.categories.includes('SUPPORTFACTORY'))||a.id.localeCompare(b.id));
}
export function estimateQueue(entries,units,factoryId,assist=0){
  let factory=units.get(factoryId),mass=0,energy=0,time=0;
  const rows=[],errors=[];
  if(!factory?.buildRate||!factory.factory||!factory.structure)errors.push('Choose a producing factory.');
  if(!Number.isFinite(assist)||assist<0||assist>100000)errors.push('Assist build power must be between 0 and 100,000.');
  if(errors.length)return {valid:false,errors,rows};
  for(let index=0;index<entries.length;index++){
    const entry=entries[index],u=units.get(entry.id);
    if(!u){errors.push(`Entry ${index+1}: ${entry.id} has no bundled build-time data.`);break;}
    if(!Number.isInteger(entry.count)||entry.count<1||entry.count>9999){errors.push(`Entry ${index+1}: invalid quantity.`);break;}
    if(!(u.buildTime>0)){errors.push(`Entry ${index+1}: ${u.name} has no valid build time.`);break;}
    for(let copy=0;copy<entry.count;copy++){
      if(!factoryCanBuild(factory,u)){errors.push(`Entry ${index+1}: ${factory.name} (${factory.id}) cannot build ${u.name} (${u.id}).`);break;}
      const upgrade=!!u.structure&&u.factory&&u.upgradeFrom&&u.upgradeFrom!=='none';
      const differential=upgrade&&u.differentialUpgradeCost;
      const m=differential?Math.max(0,u.mass-factory.mass):u.mass,e=differential?Math.max(0,u.energy-factory.energy):u.energy;
      const seconds=u.buildTime/(factory.buildRate+assist);
      rows.push({index,id:u.id,factory:factory.id,mass:m,energy:e,time:seconds,upgrade});
      mass+=m;energy+=e;time+=seconds;
      if(upgrade)factory=u;
    }
    if(errors.length)break;
  }
  return {valid:errors.length===0,errors,rows,mass,energy,time,massPerSecond:time?mass/time:0,energyPerSecond:time?energy/time:0,finalFactory:factory.id};
}
export function defaultFactory(entries,units,faction){
  const choices=factoryChoices(units,faction);
  return choices.find(f=>estimateQueue(entries,units,f.id).valid)?.id||choices.find(f=>f.domain===units.get(entries[0]?.id)?.domain)?.id||choices[0]?.id||'';
}
export function formatDuration(seconds){
  if(!Number.isFinite(seconds))return '—';
  const rounded=Math.round(seconds*10)/10;
  if(rounded<60)return rounded.toLocaleString('en-US',{maximumFractionDigits:1})+' s';
  const minutes=Math.floor(rounded/60),remaining=Math.round((rounded-minutes*60)*10)/10;
  return minutes+'m '+remaining.toLocaleString('en-US',{maximumFractionDigits:1})+'s';
}
