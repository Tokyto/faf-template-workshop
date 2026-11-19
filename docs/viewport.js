/* View changes never alter template coordinates or placement anchors. */
export const MIN_SPAN=8,MAX_SPAN=400;
export function geometry(width,height,span){
  const cell=Math.max(1,Math.min(width-52,height-42))/span,cx=width/2,cz=height/2;
  return {width,height,size:Math.min(width-52,height-42),cell,cx,cz,left:28,right:width-12,top:22,bottom:height-12};
}
export function worldPoint(view,g,x,y){return {x:view.viewX+(x-g.cx)/g.cell,z:view.viewZ+(y-g.cz)/g.cell};}
export function zoomAt(view,width,height,x,y,factor){
  const old=geometry(width,height,view.gridSize),at=worldPoint(view,old,x,y);
  const gridSize=Math.min(MAX_SPAN,Math.max(MIN_SPAN,view.gridSize*factor)),next=geometry(width,height,gridSize);
  return {gridSize,viewX:at.x-(x-next.cx)/next.cell,viewZ:at.z-(y-next.cz)/next.cell};
}
