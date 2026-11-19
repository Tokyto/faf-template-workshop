import {bounds,placementRect,displayName,catalogIconSource} from './core.js';

const NS='http://www.w3.org/2000/svg';
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function svgElement(tag,attrs={}){const e=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,String(value));return e;}
function unitIcon(id,units){const image=element('img'),src=catalogIconSource(id,units);if(src)image.src=src;image.alt='';image.addEventListener('error',()=>image.style.visibility='hidden');return image;}

// This view uses the imported object directly; it never installs a template in
// the workspace or changes its selection, coordinates, entities or build order.
export function renderTemplatePreview(panel,template,units){
  panel.replaceChildren();panel.className='transfer-visual-preview';
  if(!template){panel.append(element('p','muted','Choose Preview beside a template to inspect it.'));return;}
  panel.append(element('span','eyebrow',template.kind==='building'?'LAYOUT PREVIEW':'QUEUE PREVIEW'),element('strong','preview-template-name',displayName(template.name)));
  if(template.kind==='factory'){
    const list=element('ol','preview-queue');list.setAttribute('aria-label','Factory queue preview');
    for(const entry of template.queue){const row=element('li'),label=element('span','',units.get(entry.id)?.name||entry.id);label.title=entry.id;row.append(unitIcon(entry.id,units),label,element('b','',`×${entry.count}`));list.append(row);}
    panel.append(list,element('p','preview-caption','Production order · quantities shown at right'));return;
  }
  const buildings=template.buildings,b=bounds(buildings,units),xmin=Math.min(b.xmin,0)-1,xmax=Math.max(b.xmax,0)+1,zmin=Math.min(b.zmin,0)-1,zmax=Math.max(b.zmax,0)+1;
  const width=280,height=200,scale=Math.min((width-30)/Math.max(xmax-xmin,4),(height-30)/Math.max(zmax-zmin,4));
  const px=x=>width/2+(x-(xmin+xmax)/2)*scale,pz=z=>height/2+(z-(zmin+zmax)/2)*scale;
  const svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`Layout preview: ${displayName(template.name)}, ${buildings.length} buildings`});
  svg.classList.add('preview-layout');
  const step=Math.max(1,Math.ceil(Math.max(xmax-xmin,zmax-zmin)/15));
  for(let x=Math.ceil(xmin/step)*step;x<=xmax;x+=step)svg.append(svgElement('line',{x1:px(x),x2:px(x),y1:10,y2:height-10,stroke:'#243e4c','stroke-width':.5}));
  for(let z=Math.ceil(zmin/step)*step;z<=zmax;z+=step)svg.append(svgElement('line',{x1:10,x2:width-10,y1:pz(z),y2:pz(z),stroke:'#243e4c','stroke-width':.5}));
  for(let index=0;index<buildings.length;index++){
    const building=buildings[index],unit=units.get(building.id),r=placementRect(building,unit),x=px(r.x0),y=pz(r.z0),w=r.w*scale,h=r.h*scale;
    const group=svgElement('g'),title=svgElement('title');title.textContent=`${index+1}. ${unit?.name||building.id} (${building.id}) · X ${building.x}, Z ${building.z}`;
    group.append(title,svgElement('rect',{x,y,width:w,height:h,fill:'#31556aaa',stroke:'#7aa7be','stroke-width':.7}));
    if(unit&&Math.min(w,h)>13){const side=Math.min(w-4,h-4,32),image=svgElement('image',{href:catalogIconSource(building.id,units),x:x+(w-side)/2,y:y+(h-side)/2,width:side,height:side});image.addEventListener('error',()=>image.remove());group.append(image);}
    if(Math.min(w,h)>=16){const number=svgElement('text',{x:x+2,y:y+9,fill:'#f1f6fa','font-size':8,'font-family':'Segoe UI, sans-serif'});number.textContent=index+1;group.append(number);}
    svg.append(group);
  }
  const cursor=svgElement('path',{d:`M${px(0)-7} ${pz(0)}h14 M${px(0)} ${pz(0)-7}v14`,stroke:'#ed9973','stroke-width':2,fill:'none'}),title=svgElement('title');title.textContent='Placement cursor (0, 0)';cursor.append(title);svg.append(cursor);
  panel.append(svg,element('p','preview-caption',`${b.width} × ${b.height} cells · + placement cursor · numbers = build order`));
  if(buildings.some(e=>!units.has(e.id)))panel.append(element('p','transfer-warning','Unknown unit footprints are estimated.'));
}
