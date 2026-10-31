import {createTrendTab} from './trends.js';
// Atlas electoral público: los datos personales entran exclusivamente desde la sesión ya autorizada.
// Sin datos publicados, no se muestran resultados simulados.
const el=id=>document.getElementById(id);
const show=(id,visible)=>el(id).classList.toggle('hidden',!visible);
const fmt=new Intl.NumberFormat('es-ES');
const percent=n=>Number.isFinite(n)?n.toLocaleString('es-ES',{maximumFractionDigits:1})+' %':'Sin dato';
let trendTab=null;
const state={map:null,map2:null,layer:null,layer2:null,pinLayer:null,pinLayer2:null,catalog:{groups:[],elections:[]},dataCache:new Map(),geoCache:new Map(),places:[],authorized:false,tab:'map',selected:null,renderSeq:0,initialBounds:false,syncing:false};
const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;return b};
const note=(parent,text)=>{const p=document.createElement('p');p.textContent=text;parent.append(p);return p};
const empty=parent=>parent.replaceChildren();
function setStatus(value){el('atlasStatus').textContent=value}
function options(id,items,selected=''){const sel=el(id);sel.replaceChildren();items.forEach(([value,label])=>sel.add(new Option(label,value)));if(items.some(item=>item[0]===selected))sel.value=selected}
function appendSwatch(label,color){const x=document.createElement('span'),s=document.createElement('span');s.className='swatch';s.style.background=color;x.append(s,document.createTextNode(label));el('atlasLegend').append(x)}
function groupInfo(code){return state.catalog.groups.find(g=>g.id===code)||{id:code,label:code,color:'#557cae'}}
function election(){const active=state.tab==='compare'&&el('atlasCompareMode').value==='slider'&&el('atlasSlider').value==='1'?el('atlasCompareElection').value:el('atlasElection').value;return state.catalog.elections.find(e=>e.id===active)}
function otherElection(){return state.catalog.elections.find(e=>e.id===el('atlasCompareElection').value)}
function isCompared(){return state.tab==='compare'&&el('atlasCompareMode').value!=='slider'}
function metric(){return state.tab==='turnout'?'participation':el('atlasMetric').value}
function selectedGroup(){return el('atlasGroup').value}
function votesFor(record,g){return Number(record?.votes?.[g]??0)}
function totalValid(record){return Number(record?.valid??0)}
function countFor(record,key){const n=Number(record?.[key]);return Number.isFinite(n)?n:null}
function winner(record){if(!record?.votes)return '';const pairs=Object.entries(record.votes).filter(([,v])=>Number.isFinite(Number(v)));pairs.sort((a,b)=>Number(b[1])-Number(a[1]));return pairs[0]?.[0]||''}
function valueFor(record,key=metric(),group=selectedGroup()){
 if(!record)return null;
 if(key==='winner')return winner(record);
 if(key==='participation'){const e=countFor(record,'electorate'),v=countFor(record,'voters');return e>0&&v!==null?100*v/e:null}
 if(key==='abstention'){const e=countFor(record,'electorate'),v=countFor(record,'voters');return e!==null&&v!==null?Math.max(0,e-v):null}
 if(key==='electorate')return countFor(record,'electorate');
 if(!group)return null;
 if(key==='votes')return votesFor(record,group);
 const valid=totalValid(record);return valid>0?100*votesFor(record,group)/valid:null;
}
function dataFor(e){return state.dataCache.get(e?.id)}
function recordId(r){return String(r.id??r.code??'')}
function areaName(r){return String(r?.name??r?.territory_name??r?.id??'Territorio sin nombre')}
function findRecord(e,id){return dataFor(e)?.records?.find(r=>recordId(r)===id)||null}
function fillScale(value,max){if(value===null||!Number.isFinite(value))return '#dde3eb';const frac=Math.min(1,Math.max(0,value/Math.max(max,1)));return 'hsl(210 67% '+(92-frac*57)+'%)'}
function diffScale(diff,limit){if(!Number.isFinite(diff))return '#dde3eb';const strength=Math.min(1,Math.abs(diff)/Math.max(limit,1));return diff>0?'hsl(197 60% '+(92-strength*52)+'%)':'hsl(18 66% '+(92-strength*49)+'%)'}
function partyColor(g){return groupInfo(g).color||'#557cae'}
function loadElection(e){
 if(!e?.file)return Promise.reject(new Error('El catálogo no indica fichero de resultados'));
 if(state.dataCache.has(e.id))return Promise.resolve(state.dataCache.get(e.id));
 return fetch(e.file).then(r=>{if(!r.ok)throw new Error('No se pudo abrir '+e.file);return r.json()}).then(data=>{
  if(!Array.isArray(data.records))throw new Error('Formato incorrecto en '+e.file);
  data.records=data.records.filter(r=>recordId(r)&&r.votes&&typeof r.votes==='object').map(r=>({...r,id:recordId(r)}));
  state.dataCache.set(e.id,data);return data;
 });
}
function loadGeometry(e){
 const url=e?.geometry;if(!url)return Promise.reject(new Error('Faltan límites territoriales para '+e?.label));
 if(state.geoCache.has(url))return Promise.resolve(state.geoCache.get(url));
 return fetch(url).then(r=>{if(!r.ok)throw new Error('No se pudo abrir la cartografía');return r.json()}).then(geo=>{
  if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features))throw new Error('La cartografía no es GeoJSON válido');
  state.geoCache.set(url,geo);return geo;
 });
}
function areaId(feature){const p=feature.properties||{};return String(p.id??p.code??p.territory_id??'')}
function featureStyle(record,comparison,max,diffMax){
 const key=metric(),group=selectedGroup();let color='#dde3eb';
 if(record){
  if(comparison){if(key==='winner')color=winner(record)===winner(comparison)?'#cbd5e1':'#815ec4';else{const a=valueFor(record,key,group),b=valueFor(comparison,key,group);color=a===null||b===null?'#dde3eb':diffScale(a-b,diffMax)}}
  else if(key==='winner')color=partyColor(winner(record));
  else color=fillScale(valueFor(record,key,group),max);
 }
 return {color:'#fff',weight:0.8,fillColor:color,fillOpacity:.76};
}
function drawMap(target,e,geo,compareE=null){
 if(!target)return;
 const isSecondary=target===state.map2,existing=isSecondary?state.layer2:state.layer;
 if(existing)target.removeLayer(existing);
 const records=new Map((dataFor(e)?.records||[]).map(r=>[recordId(r),r]));
 const comparison=compareE?new Map((dataFor(compareE)?.records||[]).map(r=>[recordId(r),r])):null;
 const key=metric();const metrics=[...records.values()].map(r=>valueFor(r,key)).filter(Number.isFinite);
 const diffs=comparison?[...records].map(([id,r])=>valueFor(r,key)-valueFor(comparison.get(id),key)).filter(Number.isFinite):[];
 const max=Math.max(1,...metrics),diffMax=Math.max(1,...diffs.map(Math.abs));
 const layer=L.geoJSON(geo,{style:f=>featureStyle(records.get(areaId(f)),comparison?.get(areaId(f)),max,diffMax),onEachFeature:(f,layer)=>{
  const r=records.get(areaId(f));const name=r?areaName(r):String(f.properties?.name||f.properties?.NOMBRE||areaId(f));
  layer.bindTooltip(name,{sticky:true});
  layer.on('click',()=>{state.selected=areaId(f);renderInfo();renderHistory()});
 }});
 layer.addTo(target);
 if(isSecondary)state.layer2=layer;else state.layer=layer;
 if(!isSecondary&&!state.initialBounds){const bounds=layer.getBounds();if(bounds.isValid()){target.fitBounds(bounds,{padding:[15,15]});state.initialBounds=true}}
}
function makePinPopup(p){const box=document.createElement('div');box.className='atlasPinPopup';const title=document.createElement('strong');title.textContent=p.title||'Lugar guardado';box.append(title);note(box,[p.map||p.category||'Sin mapa',p.group||'Sin grupo'].join(' · '));return box}
function refreshPins(){
 trendTab?.refreshPins();
 for(const layer of [state.pinLayer,state.pinLayer2])layer?.clearLayers();
 const enabled=state.authorized&&el('atlasPins').checked;if(!enabled)return;
 const wanted=el('atlasPlacesMap').value;
 for(const p of state.places){
  if(wanted&&String(p.map||p.category||'Default')!==wanted)continue;
  const lat=Number(p.lat),lng=Number(p.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)continue;
  for(const layer of [state.pinLayer,state.pinLayer2]){if(!layer)continue;L.circleMarker([lat,lng],{radius:6,color:'#137a56',fillColor:'#26aa79',fillOpacity:0.9,weight:2}).bindPopup(makePinPopup(p)).addTo(layer)}
 }
}
function renderLegend(diff){
 empty(el('atlasLegend'));
 if(diff){appendSwatch('Disminución','#d97b4b');appendSwatch('Sin cambio / similar','#d1d7df');appendSwatch('Aumento','#4c95b0');return}
 if(metric()==='winner'){
  const counts=new Map();
  for(const row of dataFor(election())?.records||[]){
    for(const [group,n] of Object.entries(row.votes||{}))
      counts.set(group,(counts.get(group)||0)+Number(n||0));
  }
  const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,12);
  for(const [group] of top)appendSwatch(groupInfo(group).label,partyColor(group));
  if(counts.size>top.length)appendSwatch('Otras candidaturas','#9097a4');
  appendSwatch('Sin datos','#dde3eb');
 }
 else {appendSwatch('Menor valor','#d9e9fb');appendSwatch('Mayor valor','#2674ad');appendSwatch('Sin datos','#dde3eb')}
}
function selectionLabel(e){return e?.label||'Elección sin definir'}
async function renderMap(){
 if(state.tab==='trends'){trendTab?.render();return}
 if(!state.map)return;
 const seq=++state.renderSeq;
 const e=election(),e2=otherElection(),side=isCompared()&&el('atlasCompareMode').value==='side';
 const compare=isCompared()&&el('atlasCompareMode').value==='difference';
 show('atlasCompareMap',side);
 el('atlasMap').parentElement.classList.toggle('sideBySide',side);
 if(side&&!state.map2){state.map2=L.map('atlasCompareMap',{zoomControl:true}).setView([41.6,-0.9],8);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(state.map2);state.pinLayer2=L.layerGroup().addTo(state.map2);state.map.on('moveend',()=>syncView(state.map,state.map2));state.map2.on('moveend',()=>syncView(state.map2,state.map))}
 setTimeout(()=>{state.map.invalidateSize();state.map2?.invalidateSize()},90);
 if(!e){setStatus('Todavía no hay resultados electorales cargados. El mapa base y la capa privada sí están disponibles.');clearLayers();refreshPins();renderInfo();renderHistory();return}
 if((side||compare)&&!e2){setStatus('Selecciona una segunda elección para comparar.');clearLayers();return}
 if((side||compare)&&e.level!==e2.level){setStatus('Estas convocatorias tienen niveles territoriales distintos y no pueden compararse directamente.');clearLayers();return}
 if((side||compare)&&e.geometry!==e2.geometry){setStatus('Las geometrías históricas no son equivalentes: no se dibuja una diferencia potencialmente engañosa.');clearLayers();return}
 try{
  setStatus('Cargando resultados y límites geográficos…');
  await Promise.all([loadElection(e),loadGeometry(e),...(side||compare?[loadElection(e2),loadGeometry(e2)]:[])]);
  if(seq!==state.renderSeq)return;
  const geo=state.geoCache.get(e.geometry);drawMap(state.map,e,geo,compare?e2:null);
  if(side)drawMap(state.map2,e2,geo);
  else if(state.layer2){state.map2.removeLayer(state.layer2);state.layer2=null}
  renderLegend(compare);refreshPins();
  setStatus(selectionLabel(e)+(side?' · '+selectionLabel(e2):compare?' · diferencia respecto a '+selectionLabel(e2):'')+' · '+e.level+' · fuente: '+(e.source||'consulte el catálogo'));
  renderInfo();renderHistory();
 }catch(error){if(seq!==state.renderSeq)return;setStatus('Datos pendientes o no accesibles: '+error.message);clearLayers();renderInfo();renderHistory()}
}
function clearLayers(){if(state.layer){state.map.removeLayer(state.layer);state.layer=null}if(state.layer2&&state.map2){state.map2.removeLayer(state.layer2);state.layer2=null}empty(el('atlasLegend'))}
function syncView(from,to){if(!to||state.syncing||el('atlasCompareMap').classList.contains('hidden'))return;state.syncing=true;to.setView(from.getCenter(),from.getZoom(),{animate:false});state.syncing=false}
function kv(parent,label,value){const d=document.createElement('div'),s=document.createElement('small'),v=document.createElement('strong');s.textContent=label;v.textContent=value;d.append(s,v);parent.append(d)}
function renderInfo(){
 const root=el('atlasInfo');empty(root);const title=document.createElement('h2');title.textContent='Territorio seleccionado';root.append(title);
 const e=election(),r=state.selected?findRecord(e,state.selected):null;
 if(!r){note(root,e?'Selecciona una zona del mapa para consultar sus votos y participación.':'Aquí aparecerán los resultados territoriales cuando se incorporen ficheros oficiales.');return}
 const h=document.createElement('h3');h.textContent=areaName(r);root.append(h);note(root,selectionLabel(e));
 const stats=document.createElement('div');stats.className='atlasKpis';
 kv(stats,'Censo',countFor(r,'electorate')===null?'—':fmt.format(r.electorate));
 kv(stats,'Votantes',countFor(r,'voters')===null?'—':fmt.format(r.voters));
 kv(stats,'Participación',percent(valueFor(r,'participation')));
 kv(stats,'Abstención',countFor(r,'electorate')===null||countFor(r,'voters')===null?'—':fmt.format(valueFor(r,'abstention')));
 root.append(stats);
 const denominator=r.denominator==='candidaturas'||(!r.denominator&&e?.denominator?.startsWith('votos a candidaturas'))
 ? 'Porcentajes sobre votos a candidaturas: la fuente histórica no ofrece blancos en esta unidad; no equivale al porcentaje sobre todos los votos válidos.'
 : 'Porcentajes sobre votos válidos cuando se dispone del desglose completo.';
 note(root,denominator);
 if(e?.boundary_note)note(root,'Advertencia: '+e.boundary_note);
 const total=totalValid(r);
 for(const [group,amount] of Object.entries(r.votes||{}).sort((a,b)=>Number(b[1])-Number(a[1]))){
  const holder=document.createElement('div');holder.className='atlasResult';const line=document.createElement('div');line.className='atlasResultHeader';
  const n=document.createElement('span');n.textContent=groupInfo(group).label;const v=document.createElement('span');v.textContent=fmt.format(Number(amount))+' · '+percent(total>0?100*Number(amount)/total:null);
  line.append(n,v);const bar=document.createElement('div');bar.className='atlasBar';const fill=document.createElement('span');fill.style.width=Math.max(0,Math.min(100,total>0?100*Number(amount)/total:0))+'%';fill.style.background=partyColor(group);bar.append(fill);holder.append(line,bar);root.append(holder);
 }
 root.append(button('Descargar esta ficha (CSV)',()=>exportRecord(r,e)));
}
function exportRecord(r,e){
 const csv=[['eleccion','territorio','censo','votantes','validos','grupo','votos'],...Object.entries(r.votes||{}).map(([g,v])=>[e.id,areaName(r),r.electorate??'',r.voters??'',r.valid??'',g,v])].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ficha-electoral-'+e.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function renderHistory(){
 const root=el('atlasHistory');empty(root);const h=document.createElement('h2');h.textContent='Evolución histórica';root.append(h);
 const e=election();if(!state.selected||!e){note(root,'Selecciona una zona y una convocatoria para mostrar la evolución.');return}
 const id=state.selected;const related=state.catalog.elections.filter(x=>x.type===e.type&&x.level===e.level&&x.geometry===e.geometry);
 const seq=state.renderSeq;
 const rows=await Promise.all(related.map(async x=>{try{await loadElection(x);const r=findRecord(x,id);return r?{e:x,r}:null}catch{return null}}));
 if(seq!==state.renderSeq||state.selected!==id)return;
 const ready=rows.filter(Boolean).sort((a,b)=>a.e.date.localeCompare(b.e.date));
 if(!ready.length){note(root,'No hay una serie comparable para esta unidad territorial.');return}
 note(root,'Comparación entre convocatorias del mismo tipo y delimitación territorial. Los cambios de voto agregado no identifican transferencias individuales.');
 const table=document.createElement('table');const head=document.createElement('tr');
 for(const name of ['Elección','Censo','Votantes','Participación','Grupo más votado']){const th=document.createElement('th');th.textContent=name;head.append(th)}table.append(head);
 for(const {e:x,r} of ready){const tr=document.createElement('tr');for(const t of [x.label,fmt.format(r.electorate??0),fmt.format(r.voters??0),percent(valueFor(r,'participation')),groupInfo(winner(r)).label]){const td=document.createElement('td');td.textContent=t;tr.append(td)}table.append(tr)}
 root.append(table);const plot=document.createElement('div');plot.className='atlasTrend';
 for(const {e:x,r} of ready){const item=document.createElement('div');item.className='atlasTrendItem';const val=valueFor(r,'participation');const bar=document.createElement('div');bar.className='atlasTrendBar';bar.style.height=(val===null?0:Math.max(0,Math.min(100,val)))+'%';bar.title=x.label+': '+percent(val);const l=document.createElement('small');l.textContent=x.date.slice(0,4);item.append(bar,l);plot.append(item)}root.append(plot);note(root,'Barras: participación por convocatoria.');
}
function controls(){
 const tab=state.tab,method=tab==='method',compare=tab==='compare',trends=tab==='trends';
 show('atlasControls',!method&&!trends);show('atlasPrivate',!method);show('atlasDisplay',!method&&!trends);show('atlasHistory',!method&&!trends);show('atlasMethod',method);show('atlasExtra',!method&&!trends);show('atlasTrendsScreen',trends);show('atlasSliderBox',compare&&el('atlasCompareMode').value==='slider');
 show('atlasCompareRow',compare);show('atlasCompareModeRow',compare);show('atlasGroupRow',metric()==='votes'||metric()==='share'||(compare&&el('atlasCompareMode').value==='difference'));
 el('atlasTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.atlasTab===tab));
 if(tab==='turnout')el('atlasMetric').value='participation';
 el('atlasSliderLabel').textContent=el('atlasSlider').value==='1'?'Segunda elección':'Primera elección';
}
function refreshControls(){
 const events=state.catalog.elections;
 const was=el('atlasElection').value;
 options('atlasElection',events.length?events.map(e=>[e.id,e.label]):[['','Sin datos publicados']],events.some(e=>e.id===was)?was:events[events.length-1]?.id);
 const e=election(),compatible=events.filter(x=>x.id!==e?.id&&x.type===e?.type);
 const old=el('atlasCompareElection').value;
 options('atlasCompareElection',compatible.length?compatible.map(x=>[x.id,x.label]):[['','No hay otra elección comparable']],old||compatible[0]?.id);
 const groups=state.catalog.groups||[];options('atlasGroup',groups.length?groups.map(g=>[g.id,g.label]):[['','Sin clasificación disponible']],el('atlasGroup').value||groups[0]?.id);
 controls();renderMap();
}

function searchPlace(){
 const term=el('atlasSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(!term){setStatus('Introduce un municipio o sección para buscar.');return}
 const e=election();
 const rows=dataFor(e)?.records||[];
 const r=rows.find(r=>areaName(r).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(term));
 if(!r){setStatus('No hay coincidencias en la elección cargada.');return}
 state.selected=recordId(r);renderInfo();renderHistory();
 let bounds=null;
 state.layer?.eachLayer(layer=>{if(areaId(layer.feature)===state.selected)bounds=layer.getBounds()});
 if(bounds?.isValid())state.map.fitBounds(bounds,{maxZoom:12,padding:[35,35]});
}
function downloadElection(){
 const e=election(),rows=dataFor(e)?.records;
 if(!e||!rows?.length){setStatus('No hay resultados cargados para exportar.');return}
 const groups=state.catalog.groups.map(g=>g.id);
 const cells=[['eleccion','municipio_o_seccion','codigo','censo','votantes','validos',...groups],
 ...rows.map(r=>[e.id,areaName(r),recordId(r),r.electorate,r.voters,r.valid,...groups.map(g=>r.votes[g]??0)])];
 const csv=cells.map(line=>line.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='zaragoza-'+e.id+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export async function initAtlas(){
 trendTab=createTrendTab({
  catalog:()=>state.catalog,loadElection,loadGeometry,setStatus,
  privateState:()=>({authorized:state.authorized,enabled:el('atlasPins').checked,places:state.places,mapName:el('atlasPlacesMap').value})
 });
 el('atlasTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.tab=b.dataset.atlasTab;controls();renderMap()});
 for(const name of ['atlasElection','atlasCompareElection','atlasMetric','atlasGroup','atlasCompareMode'])el(name).addEventListener('change',()=>{controls();renderMap()});
 el('atlasPins').addEventListener('change',refreshPins);el('atlasPlacesMap').addEventListener('change',refreshPins);
 el('atlasSlider').addEventListener('input',()=>{controls();renderMap()});
 el('atlasSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlace()}});
 el('atlasExport').addEventListener('click',downloadElection);
 try{
  const r=await fetch('./data/catalog.json',{cache:'no-cache'});if(!r.ok)throw new Error('Falta catálogo');const catalog=await r.json();
  if(!Array.isArray(catalog.elections)||!Array.isArray(catalog.groups))throw new Error('Catálogo incorrecto');
  state.catalog=catalog;trendTab.init();refreshControls();
 }catch(error){setStatus('No se pudo cargar el catálogo electoral: '+error.message)}
}
export function showAtlas(){
 if(!state.map){
  state.map=L.map('atlasMap').setView([41.64,-0.88],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(state.map);
  state.pinLayer=L.layerGroup().addTo(state.map);
 }
 setTimeout(()=>{state.map.invalidateSize();state.map2?.invalidateSize();refreshPins();renderMap()},90);
}
export function updateAtlasPlaces(places,authorized){
 state.authorized=Boolean(authorized);state.places=authorized?places.slice():[];
 el('atlasPins').disabled=!authorized;el('atlasPlacesMap').disabled=!authorized;
 if(!authorized)el('atlasPins').checked=false;
 const old=el('atlasPlacesMap').value;
 const maps=[...new Set(state.places.map(p=>String(p.map||p.category||'Default')))].sort();
 options('atlasPlacesMap',[['','Todos mis mapas'],...maps.map(m=>[m,m])],old);
 el('atlasPrivateInfo').textContent=authorized?state.places.length+' puntos de tu cuenta (capa privada).':'Inicia sesión para añadir tu capa privada.';
 refreshPins();
}
