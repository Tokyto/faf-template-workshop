import {overlaps} from './core.js';

const same=(a,b)=>a.id===b.id&&Math.abs(a.x-b.x)<1e-6&&Math.abs(a.z-b.z)<1e-6;
const negate=value=>value===0?0:-value;
const operations={rotate:b=>({...b,x:negate(b.z),z:b.x}),mirrorX:b=>({...b,x:negate(b.x)}),mirrorZ:b=>({...b,z:negate(b.z)})};

// Templates store positions rather than model headings. Every operation uses
// the placement cursor (0,0) and leaves blueprint footprints unchanged.
export function symmetricBuildings(building,mode='none'){
  let candidates=[{...building}];
  if(mode==='x'||mode==='both')candidates.push(operations.mirrorX(building));
  if(mode==='z'||mode==='both')candidates.push(operations.mirrorZ(building));
  if(mode==='both')candidates.push({...building,x:negate(building.x),z:negate(building.z)});
  if(!['none','x','z','both'].includes(mode))throw new Error('Unknown placement symmetry');
  return candidates.filter((b,i)=>candidates.findIndex(other=>same(b,other))===i);
}
export function planAdditions(buildings,candidates,units){
  const unique=candidates.filter((b,i)=>candidates.findIndex(other=>same(b,other))===i);
  const rows=unique.map(building=>({building,duplicate:buildings.some(other=>same(building,other)),blocked:false}));
  for(const row of rows){
    if(row.duplicate)continue;
    const b=row.building;
    row.blocked=![b.x,b.z].every(Number.isFinite)||Math.abs(b.x)>100000||Math.abs(b.z)>100000||units.get(b.id)?.directBuildable===false||buildings.some(other=>overlaps(b,other,units));
  }
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(!rows[i].duplicate&&!rows[j].duplicate&&overlaps(rows[i].building,rows[j].building,units))rows[i].blocked=rows[j].blocked=true;
  return {rows,blocked:rows.some(r=>r.blocked),skipped:rows.filter(r=>r.duplicate).length};
}
export function appendBuildings(buildings,candidates,units){
  const plan=planAdditions(buildings,candidates,units);
  if(plan.blocked)throw new Error('The copies would overlap a building or use an invalid position. Move the cursor, change the anchor, or turn symmetry off.');
  let entity=buildings.reduce((n,b)=>Math.max(n,Number(b.entity)||0),0);
  const additions=plan.rows.filter(r=>!r.duplicate).map(({building})=>{
    if(!Number.isSafeInteger(++entity))throw new Error('Cannot allocate another building identifier');
    return {...building,entity};
  });
  return {buildings:[...buildings,...additions],added:additions.length,skipped:plan.skipped};
}
export function transformBuildings(buildings,operation,units,keepOriginal=false){
  const transform=operations[operation];if(!transform)throw new Error('Unknown layout transformation');
  const transformed=buildings.map(transform);
  if(keepOriginal)return appendBuildings(buildings,transformed,units);
  for(let i=0;i<transformed.length;i++){
    const b=transformed[i];
    if(![b.x,b.z].every(Number.isFinite)||Math.abs(b.x)>100000||Math.abs(b.z)>100000)throw new Error('The transformed layout is outside the supported coordinate range.');
    if(transformed.some((other,j)=>j<i&&overlaps(b,other,units)))throw new Error('This transformation would overlap building footprints.');
  }
  return {buildings:transformed,added:0,skipped:0};
}
