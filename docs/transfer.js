import * as Core from './core.js';
import {renderTemplatePreview} from './transfer-preview.js';

const MAX_BYTES=5*1024*1024;
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function button(text,id,action){const b=el('button','',text);if(id)b.id=id;b.type='button';b.addEventListener('click',action);return b;}

export function openTransfer({mode,profile,current,units,modal,download,notify,onImport}){
  let items=[],selected=new Set(),parsed=false,previewIndex=-1;
  const importing=mode==='import',body=el('div','lua-transfer'),intro=el('p','muted');
  intro.textContent=importing?`Import into “${profile.name}”. Files load automatically; for pasted text, click Read Lua. Use Preview beside a template to inspect it before adding.`:`Export from “${profile.name}”. Choose layouts and factory queues to share in one .lua file.`;
  body.append(intro);
  const message=el('p','transfer-message');message.id='transferMessage';message.setAttribute('role','status');
  const area=el('textarea');area.id='transferSource';area.spellcheck=false;area.setAttribute('aria-label',importing?'Lua to import':'Exported Lua');area.readOnly=!importing;
  const source=el(importing?'div':'details','transfer-source');
  let rawSource;
  if(importing){
    const controls=el('div','transfer-controls'),file=el('input');file.type='file';file.accept='.lua,text/plain';file.id='transferFile';file.setAttribute('aria-label','Choose Lua file');
    file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;try{if(f.size>MAX_BYTES)throw new Error('Choose a Lua file smaller than 5 MB');area.value=await f.text();invalidate();preview();}catch(e){invalidate();error(e.message);}});
    controls.append(file,button('Read Lua','previewImport',preview));
    area.placeholder='Paste a template, a list, or a Workshop bundle here…';
    rawSource=el('details','import-lua-source');rawSource.id='importLuaSource';rawSource.open=true;rawSource.append(el('summary','','Lua source · paste or edit'),area);
    area.addEventListener('input',invalidate);source.append(controls,rawSource);
  }else{source.append(el('summary','','Preview Lua'),area);}
  const picker=el('div','transfer-picker'),tools=el('div','transfer-controls'),filter=el('select');filter.id='transferType';filter.setAttribute('aria-label','Filter template types');
  for(const [value,label] of [['all','Layouts + queues'],['building','Layouts'],['factory','Factory queues']]){const o=el('option','',label);o.value=value;filter.append(o);}
  const rows=el('div','transfer-list');rows.id='transferList';rows.setAttribute('aria-label','Templates to '+mode);
  const visual=el('section','transfer-visual-preview');visual.id='transferVisualPreview';visual.setAttribute('aria-label','Template preview');
  const count=el('p','transfer-count');count.id='transferCount';count.setAttribute('role','status');
  tools.append(filter,button('Select shown','selectShown',()=>{items.forEach((t,i)=>{if(shown(t))selected.add(i);});draw();}),button('Clear shown','clearShown',()=>{items.forEach((t,i)=>{if(shown(t))selected.delete(i);});draw();}));
  if(!importing)tools.append(button('Current','selectCurrent',()=>{selected=new Set(items.map((t,i)=>t===current?i:-1).filter(i=>i>=0));draw();}),button('All','selectAll',()=>{selected=new Set(items.map((_,i)=>i));draw();}),button('None','selectNone',()=>{selected.clear();draw();}));
  const split=el('div','transfer-preview-split');split.append(rows,visual);
  filter.addEventListener('change',()=>{if(items[previewIndex]&&!shown(items[previewIndex]))previewIndex=items.findIndex(shown);draw();});picker.append(tools,split,count);
  const actions=el('div','modal-actions'),cancel=button('Cancel','',()=>document.getElementById('modal').close()),primary=button(importing?'Add selected':'Download .lua',importing?'confirmImport':'downloadLua',importing?insert:()=>download('FAFTemplateWorkshop_templates.lua',output()));primary.className='primary';
  const copy=button('Copy Lua','copyLua',async()=>{try{const text=output();try{await navigator.clipboard.writeText(text);}catch{source.open=true;area.focus();area.select();if(!document.execCommand('copy'))throw new Error('Select and copy the Lua from the preview.');}notify('Copied selected templates.');}catch(e){error(e.message);}});
  actions.append(cancel);if(!importing)actions.append(copy);actions.append(primary);
  if(importing)body.append(source,message,picker);else body.append(picker,message,source);
  const note=el('p','modal-info',importing?'Adds copies in source order. Clear the checkbox for any copies you want to skip. Export a prefs copy to use the imported templates in the game.':'Includes icons, build order, placement anchors and saved repeat spacing. Selections include items hidden by the type filter. Only this game profile is exported.');body.append(note,actions);
  function shown(t){return filter.value==='all'||t.kind===filter.value;}
  function error(text){message.textContent=text;message.classList.add('error');}
  function output(){return Core.exportTemplates(items.filter((_,i)=>selected.has(i)),units);}
  function invalidate(){items=[];selected.clear();parsed=false;previewIndex=-1;message.textContent='';message.classList.remove('error');draw();}
  function preview(){
    if(parsed){notify('Lua is already loaded. Use Preview beside a template to inspect it.');return;}
    try{items=Core.importTemplates(area.value);selected=new Set(items.map((_,i)=>i));previewIndex=items.findIndex(shown);parsed=true;if(rawSource)rawSource.open=false;message.textContent=`Loaded ${items.length} template${items.length===1?'':'s'}. Preview shows their contents; Add selected imports checked items.`;message.classList.remove('error');draw();}catch(e){invalidate();if(rawSource)rawSource.open=true;error(e.message);}
  }
  function draw(){
    const scroll=rows.scrollTop;rows.replaceChildren();const existing=[...profile.buildings,...profile.queues];
    items.forEach((t,i)=>{if(!shown(t))return;const row=el('div','transfer-row'+(i===previewIndex?' previewing':'')),label=el('label','transfer-row-select'),check=el('input');check.type='checkbox';check.checked=selected.has(i);check.dataset.transferIndex=i;check.setAttribute('aria-label',Core.displayName(t.name));
      check.addEventListener('change',()=>{if(check.checked)selected.add(i);else selected.delete(i);draw();});
      const im=el('img'),src=Core.catalogIconSource(t.icon,units);if(src)im.src=src;im.alt='';im.addEventListener('error',()=>im.style.visibility='hidden');
      const text=el('span','transfer-row-text'),name=el('strong','',Core.displayName(t.name)),entries=t.buildings||t.queue,total=t.kind==='building'?entries.length:entries.reduce((n,e)=>n+e.count,0);
      const info=el('small','muted',`${t.kind==='building'?'Layout':'Factory queue'} · ${total} ${t.kind==='building'?'buildings':'units'}`);text.append(name,info);
      if(importing){const duplicate=existing.some(e=>e.kind===t.kind&&(e.name===t.name||Core.signature(e)===Core.signature(t)))||items.some((e,j)=>j<i&&e.kind===t.kind&&e.name===t.name);if(duplicate)text.append(el('small','transfer-warning','Already exists / duplicate name — will add a copy'));
        const unknown = entries.some(entry => !units.has(entry.id));
        const unbuildable = t.kind === 'building' && entries.some(entry => units.get(entry.id)?.directBuildable === false);
        if (unknown || unbuildable) {
          text.append(el('small', 'transfer-warning', unbuildable ? 'Contains buildings unavailable for direct placement' : 'Contains unknown / modded unit IDs'));
        }
      }
      label.append(check,im,text);const inspect=button('Preview','',()=>{previewIndex=i;draw();rows.querySelector(`[data-preview-index="${i}"]`)?.focus({preventScroll:true});});inspect.className='preview-template-button';inspect.dataset.previewIndex=i;inspect.setAttribute('aria-label','Preview '+Core.displayName(t.name));inspect.setAttribute('aria-pressed',String(i===previewIndex));row.append(label,inspect);rows.append(row);
    });
    if(!rows.children.length)rows.append(el('p','muted',items.length?'No templates of this type.':importing?'Choose a file or paste Lua, then Read Lua.':'No templates in this profile.'));
    rows.scrollTop=scroll;visual.classList.toggle('hidden',!items.length);split.classList.toggle('has-preview',!!items.length);if(items.length)renderTemplatePreview(visual,items[previewIndex],units);
    const chosen=items.filter((_,i)=>selected.has(i)),layouts=chosen.filter(t=>t.kind==='building').length,queues=chosen.length-layouts,hidden=chosen.filter(t=>!shown(t)).length;
    count.textContent=`${chosen.length} selected · ${layouts} layout${layouts===1?'':'s'} · ${queues} queue${queues===1?'':'s'}`+(hidden?` · ${hidden} hidden by filter`:'');
    primary.disabled=!chosen.length||(importing&&!parsed);copy.disabled=primary.disabled;
    if(!importing){message.textContent='';message.classList.remove('error');area.value='';if(chosen.length){try{area.value=output();}catch(e){error(e.message);primary.disabled=true;copy.disabled=true;}}}
  }
  function insert(){try{if(!parsed||!selected.size)return;const chosen=items.filter((_,i)=>selected.has(i));onImport(chosen);document.getElementById('modal').close();notify(`Added ${chosen.length} template${chosen.length===1?'':'s'}. Undo reverses this import.`);}catch(e){error(e.message);}}
  if(!importing){items=[...profile.buildings,...profile.queues];selected=new Set(items.map((t,i)=>!current||t===current?i:-1).filter(i=>i>=0));previewIndex=items.indexOf(current);if(previewIndex<0&&items.length)previewIndex=0;}
  draw();modal(importing?'Import Lua templates':'Export Lua templates',body,[]);
  if(importing)area.focus();
}
