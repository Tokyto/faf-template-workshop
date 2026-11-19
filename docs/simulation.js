/* Steady-state layout estimates using the bundled FAF blueprint/buff snapshot. */
import { placementRect } from './core.js';

const EPS=1e-5;
export function directlyBuildable(unit){return !!unit?.structure&&unit.directBuildable!==false;}
export function constructionCost(entries,units){
  const total={mass:0,energy:0,unknownCount:0};
  for(const entry of entries){
    const u=units.get(entry.id),count=entry.count??1;
    if(!u){total.unknownCount+=count;continue;}
    total.mass+=(u.mass||0)*count;total.energy+=(u.energy||0)*count;
  }
  return total;
}
export const skirtRect=placementRect;
export function fullEdgeContact(a,b,units){
  const A=skirtRect(a,units.get(a.id)),B=skirtRect(b,units.get(b.id));
  const zOverlap=Math.min(A.z1,B.z1)-Math.max(A.z0,B.z0);
  if((Math.abs(A.x1-B.x0)<EPS||Math.abs(B.x1-A.x0)<EPS)&&zOverlap>EPS&&zOverlap>=Math.min(A.h,B.h)-EPS)return true;
  const xOverlap=Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0);
  return (Math.abs(A.z1-B.z0)<EPS||Math.abs(B.z1-A.z0)<EPS)&&xOverlap>EPS&&xOverlap>=Math.min(A.w,B.w)-EPS;
}
export function shieldCoverage(unit){
  if(!unit?.shield)return null;
  const radius=unit.shield.radius,offset=unit.shield.verticalOffset||0;
  return {radius,groundRadius:Math.sqrt(Math.max(0,radius*radius-offset*offset)),health:unit.shield.health,verticalOffset:offset};
}
export function shieldBounds(buildings,units,preview=()=>null){
  let xmin=Infinity,xmax=-Infinity,zmin=Infinity,zmax=-Infinity;
  for(const b of buildings){const s=shieldCoverage(units.get(preview(b)||b.id));if(!s)continue;xmin=Math.min(xmin,b.x-s.radius);xmax=Math.max(xmax,b.x+s.radius);zmin=Math.min(zmin,b.z-s.radius);zmax=Math.max(zmax,b.z+s.radius);}
  return Number.isFinite(xmin)?{xmin,xmax,zmin,zmax}:null;
}
export function analyzeLayout(buildings,units,rules){
  const rows=buildings.map(b=>{
    const u=units.get(b.id),ignored=!!u?.factory;
    return {id:b.id,massBase:ignored?0:u?.productionMass||0,energyBase:ignored?0:u?.productionEnergy||0,massUseBase:ignored?0:u?.consumptionMass||0,energyUseBase:ignored?0:u?.consumptionEnergy||0,minEnergyUse:u?.minConsumptionEnergy||0,intervalBase:u?.artillery?1/u.artillery.rateOfFire:0,weaponEnergyBase:u?.artillery?.energyPerShot||0,mods:{MassProduction:1,EnergyProduction:1,EnergyMaintenance:1,RateOfFire:1,EnergyWeapon:1},sources:[],ignored};
  });
  const links=[];
  for(let from=0;from<buildings.length;from++){
    const giver=units.get(buildings[from].id),family=rules?.buffs?.[giver?.adjacency];if(!family)continue;
    for(let to=0;to<buildings.length;to++){
      if(from===to||rows[to].ignored||!fullEdgeContact(buildings[from],buildings[to],units))continue;
      const receiver=units.get(buildings[to].id),index=receiver?.adjacencySize/4-1,row=rows[to];
      if(!Number.isInteger(index)||index<0)continue;
      for(const effect of Object.keys(row.mods)){
        const add=family[effect]?.[index];if(!add)continue;
        if(effect==='MassProduction'&&!row.massBase||effect==='EnergyProduction'&&!row.energyBase||effect==='EnergyMaintenance'&&!row.energyUseBase||effect==='RateOfFire'&&!row.intervalBase||effect==='EnergyWeapon'&&!row.weaponEnergyBase)continue;
        row.mods[effect]+=add;row.sources.push({from,effect,add});
        links.push({from,to,effect,add});
      }
    }
  }
  const totals={mass:0,energy:0,massUse:0,energyUse:0,massBase:0,energyBase:0,energyUseBase:0};
  for(const row of rows){
    for(const key of Object.keys(row.mods))row.mods[key]=Math.max(0,row.mods[key]);
    row.mass=row.massBase*row.mods.MassProduction;row.energy=row.energyBase*row.mods.EnergyProduction;
    row.massUse=row.massUseBase;row.energyUse=Math.max(row.minEnergyUse,row.energyUseBase*row.mods.EnergyMaintenance);
    row.interval=row.intervalBase*row.mods.RateOfFire;row.weaponEnergy=row.weaponEnergyBase*row.mods.EnergyWeapon;
    for(const key of Object.keys(totals))totals[key]+=row[key]||0;
  }
  totals.netMass=totals.mass-totals.massUse;totals.netEnergy=totals.energy-totals.energyUse;
  return {rows,totals,links};
}
export function formatNumber(value,places=3){return Number(value.toFixed(places)).toLocaleString('en-US',{maximumFractionDigits:places});}
export function gridLabels(row){
  const lines=[];
  if(row.massBase)lines.push({text:'M +'+formatNumber(row.mass,2),color:'#a9dfbc',kind:'mass'});
  if(row.energyBase)lines.push({text:'E +'+formatNumber(row.energy,1),color:'#efdb9d',kind:'energy'});
  if(row.massBase&&row.energyUseBase)lines.push({text:'E −'+formatNumber(row.energyUse,2),color:'#e6bf93',kind:'upkeep'});
  if(row.intervalBase)lines.push({text:formatNumber(row.interval,3)+'s / shot',color:'#c2d5f0',kind:'artillery'});
  return lines;
}
