/* Data-only Lua parsing and lossless edits outside template sections. */
export class LuaParser {
  constructor(source) { this.s=source;this.i=0;this.look=null;this.depth=0;this.count=0; }
  error(message,at=this.i) { const line=this.s.slice(0,at).split('\n').length;throw new Error(`${message} (line ${line})`); }
  longOpen(at) { const m=this.s.slice(at).match(/^\[(=*)\[/);return m?{open:m[0],close:`]${m[1]}]`}:null; }
  token() {
    if(this.look){const t=this.look;this.look=null;return t;}
    while(this.i<this.s.length){
      if(/\s/.test(this.s[this.i])){this.i++;continue;}
      if(this.s.startsWith('--',this.i)){
        this.i+=2;const l=this.longOpen(this.i);
        if(l){const end=this.s.indexOf(l.close,this.i+l.open.length);if(end<0)this.error('Unterminated Lua comment');this.i=end+l.close.length;}
        else {const end=this.s.indexOf('\n',this.i);this.i=end<0?this.s.length:end;}
        continue;
      }break;
    }
    if(++this.count>1000000)this.error('Prefs file contains too many tokens');
    const start=this.i,c=this.s[this.i];
    if(start>=this.s.length)return {kind:'eof',start,end:start};
    if(c==="'"||c==='"'){
      this.i++;
      while(this.i<this.s.length){
        if(this.s[this.i]==='\\'){this.i+=2;continue;}
        if(this.s[this.i]===c){this.i++;return {kind:'string',text:this.s.slice(start,this.i),start,end:this.i};}
        if(/[\r\n]/.test(this.s[this.i]))this.error('Newline inside quoted Lua string',start);
        this.i++;
      }this.error('Unterminated Lua string',start);
    }
    const l=this.longOpen(start);
    if(l){const end=this.s.indexOf(l.close,start+l.open.length);if(end<0)this.error('Unterminated long Lua string');this.i=end+l.close.length;return {kind:'longstring',text:this.s.slice(start,this.i),start,end:this.i};}
    let m=this.s.slice(start).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if(m){this.i+=m[0].length;return {kind:'identifier',text:m[0],start,end:this.i};}
    m=this.s.slice(start).match(/^-?(?:0[xX][\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/);
    if(m){this.i+=m[0].length;return {kind:'number',text:m[0],start,end:this.i};}
    if('{}[]=,;'.includes(c)){this.i++;return {kind:c,text:c,start,end:this.i};}
    this.error('Unsupported Lua expression; only prefs data is accepted');
  }
  peek(){if(!this.look)this.look=this.token();return this.look;}
  expect(kind){const t=this.token();if(t.kind!==kind)this.error(`Expected ${kind}, found ${t.kind}`,t.start);return t;}
  value(){
    if(++this.depth>128)this.error('Prefs data is nested too deeply');
    try {
      const t=this.token(),node={kind:t.kind,start:t.start,end:t.end};
      if(t.kind==='string'||t.kind==='longstring'){node.kind='string';node.value=decodeString(t.text);return node;}
      if(t.kind==='number'){node.value=/^-0[xX]/.test(t.text)?-parseInt(t.text.slice(3),16):Number(t.text);if(!Number.isFinite(node.value))this.error('Invalid number');return node;}
      if(t.kind==='identifier'){
        if(t.text==='true'||t.text==='false'){node.kind='boolean';node.value=t.text==='true';}
        else if(t.text==='nil'){node.kind='nil';node.value=null;}
        else this.error('Executable Lua expressions are not accepted',t.start);return node;
      }
      if(t.kind!=='{')this.error('Expected Lua value',t.start);
      node.kind='table';node.fields=[];let index=1;
      while(this.peek().kind!=='}'){
        const first=this.peek();let key,numeric=false;
        if(first.kind==='['){this.token();const k=this.value();if(!['number','string'].includes(k.kind))this.error('Unsupported table key');key=k.value;numeric=k.kind==='number';this.expect(']');this.expect('=');}
        else if(first.kind==='identifier'&&!['true','false','nil'].includes(first.text)){key=this.token().text;this.expect('=');}
        else {key=index++;numeric=true;}
        const value=this.value();node.fields.push({key,numeric,value,start:first.start,end:value.end});
        const next=this.peek();if(next.kind===','||next.kind===';')this.token();else if(next.kind!=='}')this.error('Missing Lua table separator',next.start);
      }
      node.end=this.token().end;return node;
    }finally{this.depth--;}
  }
  parse(){const root={kind:'table',fields:[],start:0,end:this.s.length};while(this.peek().kind!=='eof'){const first=this.expect('identifier');this.expect('=');const value=this.value();root.fields.push({key:first.text,numeric:false,value,start:first.start,end:value.end});if(this.peek().kind===';')this.token();}return root;}
}
export function decodeString(text){
  const long=text.match(/^\[(=*)\[/);if(long){const close=long[1].length+2;return text.slice(long[0].length,-close).replace(/^\r?\n/,'');}
  let out='';const s=text.slice(1,-1),esc={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\',"'":"'",'"':'"'};
  for(let i=0;i<s.length;i++){
    if(s[i]!=='\\'){out+=s[i];continue;}
    const c=s[++i];
    if(/\d/.test(c)){const m=s.slice(i).match(/^\d{1,3}/);const n=Number(m[0]);if(n>255)throw new Error('Invalid Lua decimal escape');out+=String.fromCharCode(n);i+=m[0].length-1;}
    else if(c==='x'){const h=s.slice(i+1,i+3);if(!/^[\da-f]{2}$/i.test(h))throw new Error('Invalid Lua hexadecimal escape');out+=String.fromCharCode(parseInt(h,16));i+=2;}
    else if(c==='z'){while(i+1<s.length&&/\s/.test(s[i+1]))i++;}
    else if(c==='\n')out+='\n';
    else if(c==='\r'){out+='\n';if(s[i+1]==='\n')i++;}
    else if(Object.hasOwn(esc,c))out+=esc[c];
    else throw new Error(`Unsupported Lua escape \\${c}`);
  }return out;
}
export function get(node,key){return node?.fields?.findLast(f=>String(f.key)===String(key))?.value;}
export function array(node){if(!node||node.kind!=='table')return [];return node.fields.filter(f=>f.numeric&&Number(f.key)>=1).sort((a,b)=>a.key-b.key).map(f=>f.value);}
export function scalar(node,fallback=''){return node?.value??fallback;}
export function quote(s){return "'"+String(s).replace(/[\\'\x00-\x1f\x7f]/g,c=>c==='\\'?'\\\\':c==="'"?"\\'":`\\${c.charCodeAt(0).toString().padStart(3,'0')}`)+"'";}
export function displayName(s){return String(s||'Unnamed template').replace(/^<LOC\s+[^>]+>/,'');}
export function prepareCatalog(source) {
  const units = new Map();
  const visible = [];
  for (const blueprint of source.units) {
    const categories = blueprint.categories || [];
    if (categories.includes('CRABEGG')) {
      units.set(blueprint.id, {...blueprint, directBuildable: false, queueEligible: false, placementRestriction: 'is produced by the Megalith'});
      continue;
    }
    const headquarters = blueprint.factory && blueprint.tech >= 2 && categories.includes('RESEARCH');
    const unit = headquarters ? {...blueprint, directBuildable: false} : blueprint;
    units.set(unit.id, unit);
    visible.push(unit);
  }
  return {catalog: {...source, units: visible}, units};
}
export function catalogIconSource(id, units) {
  const key = id.toLowerCase();
  return units.has(key) ? `icons/${key}.png` : null;
}
export function signature(t){return JSON.stringify({kind:t.kind,name:t.name,icon:t.icon,buildings:t.buildings,queue:t.queue,extra:t.extra});}
function readTemplate(node,kind,text){
  if(node.kind!=='table')throw new Error('A saved template is not a Lua table');
  const data=array(get(node,'templateData'));
  const t={kind,name:String(scalar(get(node,'name'),'Unnamed template')),icon:String(scalar(get(node,'icon'),'default')),extra:node.fields.filter(f=>!['name','icon','templateData'].includes(String(f.key))).map(f=>text.slice(f.start,f.end)),raw:text.slice(node.start,node.end)};
  if(kind==='building'){
    if(data.length<3||data[0].kind!=='number'||data[1].kind!=='number')throw new Error(`Invalid building template: ${t.name}`);
    t.buildings=data.slice(2).map(n=>{const e=array(n);if(e.length<4||e[0].kind!=='string'||e.slice(1,4).some(v=>v.kind!=='number'))throw new Error(`Invalid building position in ${t.name}`);return {id:e[0].value,entity:e[1].value,x:e[2].value,z:e[3].value};});t.width=data[0].value;t.height=data[1].value;
  }else{
    t.queue=data.map(n=>{const id=get(n,'id'),count=get(n,'count');if(id?.kind!=='string'||count?.kind!=='number'||count.value<1||!Number.isInteger(count.value))throw new Error(`Invalid factory queue in ${t.name}`);return {id:id.value,count:count.value};});
  }
  t.originalSignature=signature(t);return t;
}
export function readPrefs(text){
  const root=new LuaParser(text).parse(),profile=get(root,'profile'),list=get(profile,'profiles');
  if(list?.kind!=='table')throw new Error('This file has no profile.profiles table');
  const profiles=list.fields.filter(f=>f.value.kind==='table').map(f=>{
    const node=f.value,bnode=get(node,'build_templates'),qnode=get(node,'build_templates_factory');
    if(bnode&&bnode.kind!=='table'||qnode&&qnode.kind!=='table')throw new Error('A template list is not a Lua table');
    const p={key:f.key,name:String(scalar(get(node,'Name'),`Profile ${f.key}`)),node,bnode,qnode,buildings:array(bnode).map(n=>readTemplate(n,'building',text)),queues:array(qnode).map(n=>readTemplate(n,'factory',text))};
    p.baseBuilding=JSON.stringify(p.buildings.map(signature));p.baseQueue=JSON.stringify(p.queues.map(signature));return p;
  });
  if(!profiles.length)throw new Error('No game profiles found');
  const current=scalar(get(profile,'current'),profiles[0].key);
  return {text,root,profiles,current:Math.max(0,profiles.findIndex(p=>String(p.key)===String(current))),newline:text.includes('\r\n')?'\r\n':'\n'};
}
export function footprint(unit){return [Math.max(0.5,Number(unit?.w)||2),Math.max(0.5,Number(unit?.h)||2)];}
export function placementRect(b,unit){const [w,h]=footprint(unit),x0=b.x+(unit?.skirtX0??-w/2),z0=b.z+(unit?.skirtZ0??-h/2);return {x0,z0,x1:x0+w,z1:z0+h,w,h};}
export function bounds(buildings,units){
  if(!buildings.length)return {xmin:0,xmax:0,zmin:0,zmax:0,cx:0,cz:0,width:0,height:0};
  let xmin=Infinity,xmax=-Infinity,zmin=Infinity,zmax=-Infinity;
  for(const b of buildings){const r=placementRect(b,units.get(b.id));xmin=Math.min(xmin,r.x0);xmax=Math.max(xmax,r.x1);zmin=Math.min(zmin,r.z0);zmax=Math.max(zmax,r.z1);}
  return {xmin,xmax,zmin,zmax,cx:(xmin+xmax)/2,cz:(zmin+zmax)/2,width:xmax-xmin,height:zmax-zmin};
}
export function centerTemplate(t,units){const {cx,cz}=bounds(t.buildings,units);for(const b of t.buildings){b.x-=cx;b.z-=cz;}return {x:cx,z:cz};}
export function moveAnchor(t,x,z){for(const b of t.buildings){b.x-=x;b.z-=z;}}
export function rotateTemplate(t){for(const b of t.buildings){const x=b.x;b.x=-b.z;b.z=x;}}
export function overlaps(a,b,units){const A=placementRect(a,units.get(a.id)),B=placementRect(b,units.get(b.id));return Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0)>1e-6&&Math.min(A.z1,B.z1)-Math.max(A.z0,B.z0)>1e-6;}
export const factions=['UEF','Aeon','Cybran','Seraphim'];
export const buildingPrefixes={UEF:['ueb','xeb','deb','zeb'],Aeon:['uab','xab','dab','zab'],Cybran:['urb','xrb','drb','zrb'],Seraphim:['xsb','usb','dsb','zsb']};
export function buildingEquivalent(id,target,units,crossFaction=true){
  const source=units.get(id),valid=u=>u?.structure&&u.directBuildable!==false&&u.faction===target;
  if(source?.directBuildable===false)return null;
  if(valid(source))return source;
  if(!crossFaction||!source)return null;
  // FAF checks the numeric suffix against the target faction's ordered prefixes.
  const suffix=id.match(/^[a-z]+(\d+)$/i)?.[1];
  return suffix?buildingPrefixes[target]?.map(p=>units.get(p+suffix)).find(valid)||null:null;
}
export function templateCompatibility(t,units,crossFaction=true){
  const entries=t?.buildings||t?.queue||[],blocked={};
  if(!entries.length)return {factions:[],blocked};
  const available=factions.filter(faction=>{
    blocked[faction]=entries.filter(e=>t.kind==='building'?!buildingEquivalent(e.id,faction,units,crossFaction):units.get(e.id)?.faction!==faction).map(e=>e.id);
    return blocked[faction].length===0;
  });
  return {factions:available,blocked};
}
export function moveTemplate(items,from,to){
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=items.length||to>=items.length)throw new Error('Invalid template order');
  if(from!==to)items.splice(to,0,items.splice(from,1)[0]);
  return to;
}
export function convertFaction(t,target,units){
  if(t.kind!=='building')throw new Error('Factory queues are faction-specific; create a separate queue for each faction');
  const converted=t.buildings.map(b=>{const match=buildingEquivalent(b.id,target,units);if(!match)throw new Error(`No ${target} equivalent for ${units.get(b.id)?.name||b.id} (${b.id})`);return {...b,id:match.id};});
  const convertedIcon=buildingEquivalent(t.icon,target,units);t.buildings=converted;if(convertedIcon)t.icon=convertedIcon.id;return t;
}
function serializeTemplate(t,units){
  if(t.raw&&signature(t)===t.originalSignature)return t.raw;
  if(!t.name.trim())throw new Error('Give every template a name before saving');
  if(t.kind==='building'){
    for (const building of t.buildings) {
      const unit = units.get(building.id);
      if (unit?.directBuildable === false) {
        const reason = unit.placementRestriction || 'is upgrade-only';
        const replacement = unit.templateReplacement || 'a directly buildable structure';
        throw new Error(`${unit.name} (${unit.id}) ${reason}. Replace it with ${replacement} before saving.`);
      }
    }
  }
  if(t.raw&&t.originalSignature){
    const previous=JSON.parse(t.originalSignature),now=JSON.parse(signature(t));
    delete previous.name;delete previous.icon;delete now.name;delete now.icon;
    if(JSON.stringify(previous)===JSON.stringify(now)){
      const prefix='item = ',table=get(new LuaParser(prefix+t.raw).parse(),'item'),name=get(table,'name'),icon=get(table,'icon');
      if(name&&icon){let raw=t.raw;for(const [node,value] of [[name,t.name],[icon,t.icon]].sort((a,b)=>b[0].start-a[0].start))raw=raw.slice(0,node.start-prefix.length)+quote(value)+raw.slice(node.end-prefix.length);return raw;}
    }
  }
  let entries;
  if(t.kind==='building'){
    if(!t.buildings.length)throw new Error(`Add a building to "${t.name}" before saving`);
    for(const b of t.buildings){if(!/^[\w-]+$/.test(b.id)||![b.x,b.z,b.entity].every(Number.isFinite)||Math.abs(b.x)>100000||Math.abs(b.z)>100000)throw new Error(`Invalid building data in ${t.name}`);}
    const b=bounds(t.buildings,units);entries=[String(Math.ceil(b.width)),String(Math.ceil(b.height)),...t.buildings.map(e=>`{ ${quote(e.id)}, ${e.entity}, ${e.x}, ${e.z} }`)];
  }else{
    if(!t.queue.length)throw new Error(`Add a unit to "${t.name}" before saving`);
    for(const e of t.queue){if(!/^[\w-]+$/.test(e.id)||!Number.isInteger(e.count)||e.count<1||e.count>9999)throw new Error(`Invalid queue entry in ${t.name}`);}
    entries=t.queue.map(e=>`{ id = ${quote(e.id)}, count = ${e.count} }`);
  }
  const extras=t.extra?.length?`,\n    ${t.extra.join(',\n    ')}`:'';
  return `{\n    templateData = {\n        ${entries.join(',\n        ')}\n    },\n    name = ${quote(t.name)},\n    icon = ${quote(t.icon)}${extras}\n}`;
}
export function exportTemplate(t,units){return serializeTemplate(t,units);}
function serializeList(list,units,newline,indent){
  const entries=list.map(t=>serializeTemplate(t,units).replace(/\r\n/g,'\n'));
  if(!entries.length)return '{ }';
  return ('{\n'+entries.map(s=>s.split('\n').map(line=>indent+'    '+line).join('\n')).join(',\n')+'\n'+indent+'}').replace(/\n/g,newline);
}
export function dirty(doc){return doc.profiles.some(p=>JSON.stringify(p.buildings.map(signature))!==p.baseBuilding||JSON.stringify(p.queues.map(signature))!==p.baseQueue);}
export function buildPatches(doc,units){
  const patches=[];
  for(const p of doc.profiles){
    const additions=[];
    for(const [name,node,list,base] of [['build_templates',p.bnode,p.buildings,p.baseBuilding],['build_templates_factory',p.qnode,p.queues,p.baseQueue]]){
      if(JSON.stringify(list.map(signature))===base)continue;
      const lineStart=doc.text.lastIndexOf('\n',node?.start??p.node.end-1)+1;
      const indent=doc.text.slice(lineStart,node?.start??p.node.end-1).match(/^\s*/)?.[0].replace(/[\r\n]/g,'')||'            ';
      const text=serializeList(list,units,doc.newline,indent);
      if(node)patches.push({start:node.start,end:node.end,text,kind:name});else additions.push(`${name} = ${text}`);
    }
    if(additions.length){
      const hasFields=p.node.fields.length>0;
      const tail=hasFields?doc.text.slice(p.node.fields.at(-1).end,p.node.end-1):'';
      const next=new LuaParser(tail).peek().kind;
      const separator=hasFields&&![';',','].includes(next)?',':'';
      patches.push({start:p.node.end-1,end:p.node.end-1,text:separator+doc.newline+'            '+additions.join(','+doc.newline+'            ')+','+doc.newline+'        ',kind:'insert'});
    }
  }return patches;
}
export function applyPatches(text,patches){let out=text;for(const p of [...patches].sort((a,b)=>b.start-a.start))out=out.slice(0,p.start)+p.text+out.slice(p.end);new LuaParser(out).parse();return out;}
export function bytePatches(text,patches){const enc=new TextEncoder();return patches.map(p=>({...p,start:enc.encode(text.slice(0,p.start)).length,end:enc.encode(text.slice(0,p.end)).length}));}
export function importTemplate(text,kind){
  let node;const trimmed=text.trim().replace(/,\s*$/,'');
  if(trimmed.startsWith('{'))node=get(new LuaParser('template = '+trimmed).parse(),'template');
  else node=new LuaParser('template = {'+trimmed+'}').parse().fields[0].value;
  const t=readTemplate(node,kind,'template = '+(trimmed.startsWith('{')?trimmed:'{'+trimmed+'}'));
  delete t.raw;delete t.originalSignature;return t;
}

/* Shareable bundles contain data only. Legacy single blocks and prefs sections
   are accepted too; no imported Lua is ever evaluated. */
export function exportTemplates(templates,units){
  if(!templates.length)throw new Error('Select at least one template to export');
  const layouts=templates.filter(t=>t.kind==='building'),queues=templates.filter(t=>t.kind==='factory');
  if(layouts.length+queues.length!==templates.length)throw new Error('Unknown template type');
  return '-- FAF Template Workshop: layouts and factory queues\nreturn {\n    format = \'FAFTemplateWorkshop\',\n    version = 1,\n    build_templates = '+serializeList(layouts,units,'\n','    ')+',\n    build_templates_factory = '+serializeList(queues,units,'\n','    ')+'\n}\n';
}
export function importTemplates(text){
  if(typeof text!=='string'||text.length>5*1024*1024||new TextEncoder().encode(text).length>5*1024*1024)throw new Error('Lua imports must be smaller than 5 MB');
  const input=text.replace(/^\uFEFF/,'');
  // Read through the tokenizer so comments before `return` or `{` work too.
  const probe=new LuaParser(input),first=probe.token();
  if(first.kind==='eof')throw new Error('Paste Lua or choose a .lua file first');
  let source,node;
  if(first.kind==='identifier'&&first.text==='return'){
    source='bundle = '+input.slice(first.end);node=get(new LuaParser(source).parse(),'bundle');
  }else if(first.kind==='{'){
    const trimmed=input.trim().replace(/,\s*$/,'');
    source='bundle = '+trimmed;
    try{node=get(new LuaParser(source).parse(),'bundle');}catch{
      source='bundle = {'+trimmed+'}';node=get(new LuaParser(source).parse(),'bundle');
    }
  }else{
    // Accept build_templates = {...}, or fields from one legacy template.
    source=input;
    try{node=new LuaParser(source).parse();}catch{
      source='bundle = {'+input.trim().replace(/,\s*$/,'')+'}';node=get(new LuaParser(source).parse(),'bundle');
    }
  }
  const templates=[];
  function readOne(n,kind){
    if(n?.kind!=='table'||!get(n,'templateData'))throw new Error('Expected a template with templateData, name and icon');
    const data=get(n,'templateData');if(data.kind!=='table')throw new Error('templateData must be a Lua table');
    const values=array(data),inferred=values[0]?.kind==='number'?'building':'factory';
    if(kind&&inferred!==kind)throw new Error('A template is in the wrong layout/queue section');
    const t=readTemplate(n,kind||inferred,source);
    // Preserve raw data, repeat spacing and extra fields on a later write.
    if(t.kind==='building'&&t.buildings.some(b=>!Number.isInteger(b.entity)||![b.x,b.z].every(Number.isFinite)||Math.abs(b.x)>100000||Math.abs(b.z)>100000||!/^[\w-]+$/.test(b.id)))throw new Error('Invalid imported building data');
    if(t.kind==='factory'&&t.queue.some(e=>e.count>9999||!/^[\w-]+$/.test(e.id)))throw new Error('Invalid imported queue data');
    if(!t.name.trim())throw new Error('Every imported template needs a name');
    templates.push(t);
    if(templates.length>2000)throw new Error('Import at most 2,000 templates at once');
  }
  function readList(n,kind){
    if(n?.kind!=='table')throw new Error('Template lists must be Lua tables');
    if(n.fields.some(f=>!f.numeric||!Number.isInteger(f.key)||f.key<1))throw new Error('Template lists must use positive numeric keys');
    for(const entry of array(n))readOne(entry,kind);
  }
  const format=get(node,'format'),version=get(node,'version');
  if(format&&(scalar(format)!=='FAFTemplateWorkshop'||scalar(version)!==1))throw new Error('Unsupported Template Workshop bundle format/version');
  if(get(node,'templateData'))readOne(node);
  else if(get(node,'build_templates')||get(node,'build_templates_factory')){
    if(get(node,'build_templates'))readList(get(node,'build_templates'),'building');
    if(get(node,'build_templates_factory'))readList(get(node,'build_templates_factory'),'factory');
  }else if(node?.fields?.length===1&&!node.fields[0].numeric){
    // Also allow named single tables such as template = {...}.
    const inner=node.fields[0].value;
    if(get(inner,'templateData'))readOne(inner);else readList(inner);
  }else readList(node);
  if(!templates.length)throw new Error('No layouts or factory queues found in this Lua');
  return templates;
}
