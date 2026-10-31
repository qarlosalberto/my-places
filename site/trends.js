// Lectura descriptiva de resultados electorales agregados: nunca selecciona territorios para campañas.
const IDS = Object.freeze({izquierda:['PSOE','SUMAR'],psoe:['PSOE'],otras_izquierdas:['SUMAR']});
const TYPE_NAMES = {generales:'Generales',municipales:'Municipales',europeas:'Europeas',autonomicas:'Autonómicas'};
const GROUP_NAMES = {izquierda:'PSOE + IU/Podemos/Sumar (clasificación de la fuente)',psoe:'PSOE (clasificación de la fuente)',otras_izquierdas:'IU / Podemos / Sumar (clasificación de la fuente)'};
const int = v => typeof v==='number' && Number.isFinite(v) && v>=0 ? v : null;
export const trendGroups = IDS;

export function compareTerritory(before,after,groups=IDS.izquierda,firstElection=null,lastElection=null){
  if(!before||!after)return null;
  const a=int(before.electorate),b=int(after.electorate),av=int(before.voters),bv=int(after.voters);
  const validA=int(before.valid),validB=int(after.valid);
  const votes = r => groups.reduce((sum,id)=>sum+Math.max(0,Number(r?.votes?.[id]??0)),0);
  const votesA=votes(before),votesB=votes(after);
  const dA=before.denominator==='candidaturas'||firstElection?.denominator?.startsWith('votos a candidaturas')?'candidaturas':'validos';
  const dB=after.denominator==='candidaturas'||lastElection?.denominator?.startsWith('votos a candidaturas')?'candidaturas':'validos';
  return {
    votesBefore:votesA,votesAfter:votesB,
    votesChange:votesB-votesA,
    shareBefore:validA>0?100*votesA/validA:null,
    shareAfter:validB>0?100*votesB/validB:null,
    shareChange:dA===dB&&validA>0&&validB>0?100*votesB/validB-100*votesA/validA:null,
    turnoutBefore:a>0&&av!==null?100*av/a:null,
    turnoutAfter:b>0&&bv!==null?100*bv/b:null,
    turnoutChange:a>0&&b>0&&av!==null&&bv!==null?100*bv/b-100*av/a:null,
    abstentionChange:a!==null&&b!==null&&av!==null&&bv!==null?(b-bv)-(a-av):null,
    electorateChange:a!==null&&b!==null?b-a:null,
    denominatorComparable:dA===dB,
  };
}
export function trendValue(stats,metric){
  return stats?.[metric]??null;
}
export function trendEvents(catalog,type,level){
  return (catalog?.elections||[]).filter(e=>e.type===type&&e.level===level&&e.file&&e.geometry).sort((a,b)=>a.date.localeCompare(b.date));
}
export function recentDecade(events){
  if(!events?.length)return [];
  const newest=events[events.length-1];
  const year=Number(newest.date.slice(0,4))-10;
  const cutoff=newest.date.replace(/^\d{4}/,String(year).padStart(4,'0'));
  return events.filter(e=>e.date>=cutoff&&e.geometry===newest.geometry);
}
const fmt = new Intl.NumberFormat('es-ES');
const pc=n=>n===null||!Number.isFinite(n)?'Sin dato':n.toLocaleString('es-ES',{maximumFractionDigits:1})+' %';
const signed=(n,unit='',digits=0)=>n===null||!Number.isFinite(n)?'Sin dato':(n>0?'+':'')+n.toLocaleString('es-ES',{maximumFractionDigits:digits,minimumFractionDigits:digits})+unit;
const metricLabel={votesChange:'Cambio de votos (número)',shareChange:'Cambio de voto (puntos porcentuales)',turnoutChange:'Cambio en participación (puntos porcentuales)',abstentionChange:'Cambio en abstención (número)',electorateChange:'Cambio en censo (número)'};
const esc=(s)=>String(s||'');
const byId=(data)=>new Map((data?.records||[]).map(r=>[String(r.id),r]));
function legendColor(v,max){
 if(v===null||!Number.isFinite(v))return '#e0e5eb';
 if(Math.abs(v)<0.000001)return '#c9d1dc';
 const l=94-Math.min(1,Math.abs(v)/Math.max(max,0.001))*47;
 return v<0?'hsl(16 68% '+l+'%)':'hsl(198 58% '+l+'%)';
}
function svgLine(group,data,key,color){
 const series=data.map((d,i)=>{const v=d[key];return v===null||!Number.isFinite(v)?null:[15+(i/Math.max(data.length-1,1))*470,150-(Math.max(0,Math.min(100,v))/100)*130]});
 let path='',started=false;
 for(const p of series){if(!p){started=false;continue}path+=(started?' L ':'M ')+p.join(' ');started=true}
 const doc=document,ns='http://www.w3.org/2000/svg';
 const element=doc.createElementNS(ns,'path');
 element.setAttribute('d',path);element.setAttribute('fill','none');element.setAttribute('stroke',color);element.setAttribute('stroke-width','2.6');element.setAttribute('stroke-linecap','round');
 group.append(element);
 for(let i=0;i<series.length;i++){const p=series[i];if(!p)continue;const dot=doc.createElementNS(ns,'circle');dot.setAttribute('cx',p[0]);dot.setAttribute('cy',p[1]);dot.setAttribute('r','3.5');dot.setAttribute('fill',color);dot.setAttribute('aria-hidden','true');group.append(dot)}
}
export function createTrendTab({catalog,loadElection,loadGeometry,privateState,setStatus}){
 const $=id=>document.getElementById(id);
 let map=null,geoLayer=null,pinLayer=null,selectedId='',last=null,requestId=0;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const addOption=(select,value,label)=>select.add(new Option(label,value));
 function types(){
  const values=[...new Set((catalog().elections||[]).map(e=>e.type))];
  const sel=$('atlasTrendType'),old=sel.value;
  sel.replaceChildren();
  for(const type of values)addOption(sel,type,TYPE_NAMES[type]||type);
  if(values.includes(old))sel.value=old;
  else if(values.includes('generales'))sel.value='generales';
 }
 function refreshChoices(){
  const t=$('atlasTrendType').value,level=$('atlasTrendLevel');
  const levels=[...new Set((catalog().elections||[]).filter(e=>e.type===t).map(e=>e.level))];
  const before=level.value;level.replaceChildren();
  for(const l of ['municipio','seccion'].filter(l=>levels.includes(l)))addOption(level,l,l==='seccion'?'Secciones censales (aproximadas)':'Municipios');
  if(levels.includes(before))level.value=before;
  else if(levels.includes('municipio'))level.value='municipio';
  else level.value=levels[0]||'';
  refreshDates();
 }
 function refreshDates(){
  const ev=trendEvents(catalog(),$('atlasTrendType').value,$('atlasTrendLevel').value);
  const decade=recentDecade(ev),a=$('atlasTrendFrom'),b=$('atlasTrendTo');
  const priorA=a.value,priorB=b.value;
  a.replaceChildren();b.replaceChildren();
  for(const e of ev){addOption(a,e.id,e.date);addOption(b,e.id,e.date)}
  const ids=ev.map(e=>e.id);
  a.value=ids.includes(priorA)?priorA:(decade[0]?.id||ev[0]?.id||'');
  b.value=ids.includes(priorB)?priorB:(decade[decade.length-1]?.id||ev[ev.length-1]?.id||'');
  selectedId='';
  render();
 }
 function init(){
  for(const id of ['atlasTrendMetric','atlasTrendGroup','atlasTrendFrom','atlasTrendTo'])$(id).addEventListener('change',render);
  $('atlasTrendType').addEventListener('change',refreshChoices);
  $('atlasTrendLevel').addEventListener('change',refreshDates);
  types();refreshChoices();
 }
 function ensureMap(){
  if(map)return;
  map=L.map('atlasTrendMap').setView([41.65,-0.9],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  pinLayer=L.layerGroup().addTo(map);
 }
 function refreshPins(){
  if(!pinLayer)return;
  pinLayer.clearLayers();
  const privateInfo=privateState();
  if(!privateInfo.authorized||!privateInfo.enabled)return;
  for(const p of privateInfo.places){
   if(privateInfo.mapName&&String(p.map||p.category||'Default')!==privateInfo.mapName)continue;
   const lat=Number(p.lat),lon=Number(p.lng);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)continue;
   const box=node('div'),title=node('strong',null,p.title||'Lugar guardado');
   box.append(title,node('p',null,[p.map||p.category||'Sin mapa',p.group||'Sin grupo'].join(' · ')));
   L.circleMarker([lat,lon],{radius:6,color:'#137a56',weight:2,fillColor:'#26aa79',fillOpacity:.9}).bindPopup(box).addTo(pinLayer);
  }
  pinLayer.eachLayer(layer=>layer.bringToFront?.());
 }
 function selectArea(id){
  selectedId=id;
  renderDetail();
 }
 function renderDetail(){
  const info=$('atlasTrendInfo'),history=$('atlasTrendHistory');
  info.replaceChildren();history.replaceChildren();
  const h=node('h2',null,'Territorio seleccionado');info.append(h);
  const series=last?.series||[];
  if(!selectedId||!last){info.append(node('p',null,'Pulsa en un municipio o sección del mapa para ver su serie electoral.'));return}
  const first=last.maps[0].get(selectedId),end=last.maps[last.maps.length-1].get(selectedId);
  const name=end?.name||first?.name||selectedId;
  info.append(node('h3',null,name),node('p',null,last.start.date+' — '+last.end.date));
  const s=compareTerritory(first,end,IDS[$('atlasTrendGroup').value]||IDS.izquierda,last.start,last.end);
  if(!s){info.append(node('p',null,'No hay resultados comparables en los dos extremos.'));return}
  const stat=node('div','atlasKpis');
  for(const [label,value] of [
   ['Votos al inicio',fmt.format(s.votesBefore)],['Votos al final',fmt.format(s.votesAfter)],
   ['Cambio de votos',signed(s.votesChange)],['Cambio de porcentaje',signed(s.shareChange,' pp',1)],
   ['Participación inicial',pc(s.turnoutBefore)],['Participación final',pc(s.turnoutAfter)],
   ['Variación de participación',signed(s.turnoutChange,' pp',1)],['Variación de abstención',signed(s.abstentionChange)],
   ['Variación del censo',signed(s.electorateChange)]
  ]){const item=node('div');item.append(node('small',null,label),node('strong',null,value));stat.append(item)}
  info.append(stat);
  if(!s.denominatorComparable)info.append(node('p','trendCaution','Los denominadores electorales no coinciden: no se calcula el cambio porcentual.'));
  if(last.start.level==='seccion')info.append(node('p','trendCaution','Serie exploratoria por código de sección: los límites de las secciones censales pueden haber cambiado. No equivale a un barrio estable.'));
  const table=node('table','trendTable'),head=node('tr');
  for(const text of ['Elección','Votos','% voto','Participación','Censo'])head.append(node('th',null,text));
  table.append(head);
  const chartData=[];
  for(let i=0;i<series.length;i++){
    const e=series[i],rec=last.maps[i].get(selectedId);
    if(!rec)continue;
    const label=e.date,groups=IDS[$('atlasTrendGroup').value]||IDS.izquierda;
    const votes=groups.reduce((sum,g)=>sum+Number(rec.votes?.[g]||0),0);
    const valid=Number(rec.valid);
    const share=valid>0?100*votes/valid:null;
    const participation=Number(rec.electorate)>0?100*Number(rec.voters)/Number(rec.electorate):null;
    const row=node('tr');
    for(const value of [label,fmt.format(votes),pc(share),pc(participation),fmt.format(rec.electorate)])row.append(node('td',null,value));
    table.append(row);
    chartData.push({date:label,share,participation});
  }
  history.append(node('h2',null,'Evolución por convocatoria'),node('p',null,'Se muestran resultados agregados de las elecciones disponibles dentro del periodo seleccionado.'),table);
  if(chartData.length>=2){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 500 175');svg.setAttribute('role','img');svg.setAttribute('aria-label','Dos series históricas: porcentaje de voto agrupado y participación; los valores numéricos figuran en la tabla.');
   svg.classList.add('trendChart');
   svgLine(svg,chartData,'share','#b44a3d');
   svgLine(svg,chartData,'participation','#167d91');
   history.append(svg,node('p','trendChartLegend','Rojo: porcentaje de voto agrupado · Azul: participación'));
  }
 }
 async function render(){
  if($('atlasTrendsScreen').classList.contains('hidden'))return;
  ensureMap();
  const serial=++requestId;
  const events=trendEvents(catalog(),$('atlasTrendType').value,$('atlasTrendLevel').value);
  const start=events.find(e=>e.id===$('atlasTrendFrom').value),end=events.find(e=>e.id===$('atlasTrendTo').value);
  const notice=$('atlasTrendNotice');
  if(!start||!end){setStatus('No hay dos elecciones disponibles para esta selección.');return}
  if(start.date>=end.date){setStatus('Elige una elección inicial anterior a la final.');return}
  if(start.geometry!==end.geometry){setStatus('No se comparan delimitaciones geográficas incompatibles.');return}
  const all=events.filter(e=>e.date>=start.date&&e.date<=end.date&&e.geometry===start.geometry);
  if(all.length<2){setStatus('No hay suficientes convocatorias comparables.');return}
  notice.textContent=start.level==='seccion'
   ?'Secciones de referencia INE 2023: las variaciones históricas son exploratorias y pueden reflejar cambios de límites. No equivalen necesariamente a barrios.'
   :'Los límites municipales son de referencia INE 2025. Los cambios absolutos también dependen del censo, la participación y la composición territorial.';
  setStatus('Cargando elecciones y geometría para la serie seleccionada…');
  try {
    const [datasets,geometry]=await Promise.all([Promise.all(all.map(loadElection)),loadGeometry(end)]);
    if(serial!==requestId)return;
    const maps=datasets.map(byId),first=maps[0],lastMap=maps[maps.length-1],group=IDS[$('atlasTrendGroup').value]||IDS.izquierda;
    const diffs=new Map();
    const metric=$('atlasTrendMetric').value;
    for(const [id,record] of lastMap){
      const s=compareTerritory(first.get(id),record,group,start,end);
      diffs.set(id,trendValue(s,metric));
    }
    const finite=[...diffs.values()].filter(v=>Number.isFinite(v));
    const scale=Math.max(1,...finite.map(Math.abs));
    if(geoLayer)map.removeLayer(geoLayer);
    geoLayer=L.geoJSON(geometry,{
      style:f=>{
        const id=String(f.properties?.id??f.properties?.code??'');
        return {weight:0.75,color:'#fff',fillColor:legendColor(diffs.get(id)??null,scale),fillOpacity:.78};
      },
      onEachFeature:(f,layer)=>{
        const id=String(f.properties?.id??f.properties?.code??'');
        const rec=lastMap.get(id)||first.get(id);
        const name=rec?.name||f.properties?.name||id;
        const val=diffs.get(id);
        layer.bindTooltip(name+' · '+(Number.isFinite(val)?signed(val,metric.endsWith('Change')&&['shareChange','turnoutChange'].includes(metric)?' pp':'',metric==='shareChange'||metric==='turnoutChange'?1:0):'Sin dato'),{sticky:true});
        layer.on('click',()=>selectArea(id));
      }
    }).addTo(map);
    if(!last||last.start.level!==start.level||last.start.geometry!==start.geometry){
      const bounds=geoLayer.getBounds();
      if(bounds.isValid())map.fitBounds(bounds,{padding:[15,15]});
    }
    last={start,end,series:all,maps};
    const leg=$('atlasTrendLegend');leg.replaceChildren();
    for(const [color,label] of [['#d77c50','Descenso'],['#c9d1dc','Sin cambio'],['#4d98b9','Aumento'],['#e0e5eb','Sin datos']]){
      const badge=node('span'),swatch=node('span','swatch');swatch.style.background=color;
      badge.append(swatch,document.createTextNode(label));leg.append(badge);
    }
    if(selectedId&&!first.has(selectedId)&&!lastMap.has(selectedId))selectedId='';
    renderDetail();refreshPins();
    setStatus(metricLabel[metric]+' · '+start.date+' frente a '+end.date+' · '+finite.length+' de '+geometry.features.length+' zonas con ambos extremos · '+(start.level==='seccion'?'lectura histórica exploratoria':'datos territoriales agregados'));
  }catch(error){
    if(serial!==requestId)return;
    setStatus('No se han podido cargar las series: '+error.message);
    if(geoLayer)map.removeLayer(geoLayer);geoLayer=null;last=null;renderDetail();
  }finally {
    if(serial===requestId)setTimeout(()=>map?.invalidateSize(),60);
  }
 }
 return {init,render,refreshPins};
}
