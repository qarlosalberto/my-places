/* Independent Zaragoza city-services map. No Firebase data or personal place markers. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const BUS_API='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/transporte-urbano/poste-autobus';
const BIZI_GBFS='https://zaragoza.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json';
const BIZI_MUNICIPAL='https://www.zaragoza.es/sede/servicio/urbanismo-infraestructuras/estacion-bicicleta';
const CENTER=[41.6517,-0.8891];
let map,busLayer,biziLayer,serviceMapReady=false,firstFit=false,busStops=[],biziStations=[],busLoaded=false,biziLoaded=false;
let busError='',biziError='',busFetchActive=false,biziFetchActive=false,refreshTimer=null,stopTimer=null,busDetails=new Map(),busRun=0;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
const formatName=v=>Array.isArray(v)?v.find(x=>x.language==='es')?.text||v[0]?.text||v[0]?.name||'Station':String(v||'Station');
const coordinates=o=>{
 const g=o.geometry?.coordinates||o.properties?.geometry?.coordinates;
 let lat=num(o.lat??o.latitude??o.properties?.lat),lng=num(o.lon??o.lng??o.longitude??o.properties?.lon);
 if(Array.isArray(g)&&g.length>=2){lng=num(g[0]);lat=num(g[1]);}
 return lat!==null&&lng!==null&&lat>40&&lat<43&&lng>-3&&lng<1?[lat,lng]:null;
};
const list=json=>Array.isArray(json)?json:Array.isArray(json?.result)?json.result:Array.isArray(json?.features)?json.features:Array.isArray(json?.data?.stations)?json.data.stations:Array.isArray(json?.data)?json.data:[];
const fetchJson=async url=>{
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),11000);
 try{const res=await fetch(url,{mode:'cors',signal:controller.signal,headers:{Accept:'application/json'}});if(!res.ok)throw Error('HTTP '+res.status);return await res.json()}
 finally{clearTimeout(timeout)}
};
function stateText(){
 const enabledB=$('servicesBus').checked,enabledZ=$('servicesBizi').checked;
 $('servicesSelection').textContent=enabledB&&enabledZ?'Bus + Bizi':enabledB?'Bus':enabledZ?'Bizi':'None';
 const bits=[];
 if(enabledB)bits.push(busError?'Bus unavailable: '+busError:busLoaded?busStops.length+' bus stops (arrivals checked for nearby stops)':'Loading bus stops…');
 if(enabledZ)bits.push(biziError?'Bizi unavailable: '+biziError:biziLoaded?biziStations.length+' Bizi stations':'Loading Bizi stations…');
 $('servicesStatus').textContent=bits.length?bits.join(' · '):'Select Bus or Bizi to display its stations.';
}
function pointIcon(kind,color,value){
 const mark=kind==='bizi'?'🚲':'🚌';
 return L.divIcon({className:'serviceMarkerWrap',html:'<span class="serviceMarker '+kind+'" style="--marker-color:'+color+'"><span class="serviceMarkerEmoji">'+mark+'</span>'+ (value!==null&&value!==undefined?'<b>'+escape(value)+'</b>':'')+'</span>',iconSize:[40,40],iconAnchor:[20,20]});
}
function init(){
 if(serviceMapReady)return;
 map=L.map('servicesMap',{zoomControl:true}).setView(CENTER,13);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
 busLayer=L.layerGroup().addTo(map);biziLayer=L.layerGroup().addTo(map);
 map.on('moveend',()=>{if($('servicesBus').checked&&busLoaded)scheduleBusArrivals()});
 serviceMapReady=true;
}
function updateLayerVisibility(){
 if(!serviceMapReady)return;
 if($('servicesBus').checked)busLayer.addTo(map);else map.removeLayer(busLayer);
 if($('servicesBizi').checked)biziLayer.addTo(map);else map.removeLayer(biziLayer);
 stateText();
}
function fitInitial(){
 if(firstFit||!serviceMapReady)return;
 const all=[...($('servicesBus').checked?busStops:[]),...($('servicesBizi').checked?biziStations:[])].slice(0,500).map(x=>x.point);
 if(all.length){firstFit=true;map.fitBounds(all,{padding:[25,25],maxZoom:13})}
}
function drawBizi(){
 biziLayer.clearLayers();
 for(const b of biziStations){
  const disabled=b.disabled;
  const color=b.available===null||b.active===false?'#8d95a1':b.available>2?'#168860':b.available>0?'#e8a42e':'#db4449';
  const broken=disabled!==null&&disabled>0?' <span class="serviceBroken">🔧 '+disabled+' out of service</span>':'';
  const body='<strong>'+escape(b.name)+'</strong><br>Available bikes: <b>'+(b.available===null?'Unknown':b.available)+'</b><br>Free docks: '+(b.docks===null?'Unknown':b.docks)+broken+'<br><small>'+(b.active===false?'Station not renting · ':'')+'Bizi Zaragoza</small>';
  L.marker(b.point,{icon:pointIcon('bizi',color,b.available),title:b.name}).bindPopup(body,{maxWidth:250}).addTo(biziLayer);
 }
}
function readBiziRows(stationInfo,stationStatus){
 const statuses=new Map(stationStatus.map(s=>[String(s.station_id??s.id),s]));
 return stationInfo.map(s=>{
  const p=coordinates(s);if(!p)return null;
  const d=statuses.get(String(s.station_id??s.id))||s;
  const active=d.is_renting===false||d.is_installed===false||d.estado==='CLO'?false:true;
  const available=num(d.num_vehicles_available??d.num_bikes_available??d.bicisDisponibles);
  return {point:p,name:formatName(s.name??s.title),available:active?available:0,docks:num(d.num_docks_available??d.anclajesDisponibles),disabled:num(d.num_vehicles_disabled??d.num_bikes_disabled),active};
 }).filter(Boolean);
}
async function municipalList(base){
 const rows=[];for(let start=0;start<4000;start+=500){
  const payload=await fetchJson(base+'.json?rows=500&start='+start+'&srsname=wgs84');
  const batch=list(payload);rows.push(...batch);
  if(batch.length<500)break;
 }
 return rows;
}
async function loadBizi(force=false){
 if(biziFetchActive||!$('servicesBizi').checked)return;
 if(biziLoaded&&!force){drawBizi();return}
 biziFetchActive=true;biziError='';stateText();
 try{
  let items=[];
  try{
   const discovery=await fetchJson(BIZI_GBFS);
   const feeds=Array.isArray(discovery.data?.feeds)?discovery.data.feeds:Object.values(discovery.data||{}).flatMap(d=>d.feeds||[]);
   const infoUrl=feeds.find(f=>f.name==='station_information')?.url;
   const statusUrl=feeds.find(f=>f.name==='station_status')?.url;
   if(!infoUrl||!statusUrl)throw Error('GBFS station feeds missing');
   const [info,status]=await Promise.all([fetchJson(infoUrl),fetchJson(statusUrl)]);
   items=readBiziRows(info.data?.stations||[],status.data?.stations||[]);
   if(!items.length)throw Error('No station locations in GBFS');
  }catch(gbfsError){
   const rows=await municipalList(BIZI_MUNICIPAL);
   items=readBiziRows(rows,[]);
   if(!items.length)throw Error('No usable Bizi stations; GBFS: '+gbfsError.message);
  }
  biziStations=items;biziLoaded=true;drawBizi();fitInitial();
 }catch(e){biziError=e.message||'Request failed';biziLoaded=false;biziLayer.clearLayers()}
 finally{biziFetchActive=false;stateText()}
}
function firstWaitDetail(raw){
 // Accept only explicitly named arrival fields. Unknown values must not turn a stop red.
 const found=[];
 const add=v=>{
  if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<240)found.push(v);
  if(typeof v==='string'){
   const t=v.trim();
   if(/^\d{1,3}$/.test(t))found.push(Number(t));
   else{const m=t.match(/^(\d{1,2})\s*(?:min|minutes|minutos)\b/i);if(m)found.push(Number(m[1]));}
  }
 };
 const scan=(o,depth=0)=>{
  if(!o||typeof o!=='object'||depth>6)return;
  for(const [k,v] of Object.entries(o)){
   if(/^(tiempo|tiempoEspera|tiempoLlegada|minutos|minutes|espera|arrivalTime|waitingTime|wait)$/i.test(k))add(v);
   else if(typeof v==='object')scan(v,depth+1);
  }
 };
 scan(raw);
 return found.length?Math.min(...found):null;
}
function drawBus(){
 busLayer.clearLayers();
 for(const s of busStops){
  const wait=busDetails.get(s.id)?.wait??null;
  const color=wait===null?'#8d95a1':wait>15?'#db4449':'#4e7ac9';
  const eta=wait===null?'Arrival estimate unavailable':'Next arrival: '+wait+' min'+(wait>15?' (over 15 min)':'');
  const popup='<strong>'+escape(s.name)+'</strong><br>Stop '+escape(s.id)+'<br>'+escape(eta)+'<br><small>Arrival estimates retrieved only for nearby stops.</small>';
  L.marker(s.point,{icon:pointIcon('bus',color,wait===null?null:wait+'m'),title:s.name}).bindPopup(popup,{maxWidth:250}).addTo(busLayer);
 }
}
async function loadBus(force=false){
 if(busFetchActive||!$('servicesBus').checked)return;
 if(busLoaded&&!force){drawBus();scheduleBusArrivals();return}
 busFetchActive=true;busError='';stateText();
 try{
  const rows=await municipalList(BUS_API);
  const normalized=rows.map(s=>{
   const point=coordinates(s);if(!point)return null;
   const id=String(s.id??s.properties?.id??'').split('/').pop();
   if(!id)return null;
   return {id,name:String(s.title??s.name??s.properties?.title??'Bus stop '+id),point};
  }).filter(Boolean);
  if(!normalized.length)throw Error('No usable bus-stop coordinates');
  busStops=normalized;busLoaded=true;drawBus();fitInitial();scheduleBusArrivals();
 }catch(e){busError=e.message||'Request failed';busLoaded=false;busLayer.clearLayers()}
 finally{busFetchActive=false;stateText()}
}
function scheduleBusArrivals(){
 clearTimeout(stopTimer);stopTimer=setTimeout(()=>refreshBusArrivals(false),450);
}
async function refreshBusArrivals(force=false){
 if(!serviceMapReady||!busLoaded||!$('servicesBus').checked)return;
 const run=++busRun;
 // Limit calls: only visible stops, nearest to viewport center, up to twelve per cycle.
 const bounds=map.getBounds().pad(.15),center=map.getCenter();
 const nearby=busStops.filter(s=>s.id.startsWith('tuzsa-')&&bounds.contains(s.point))
  .sort((a,b)=>center.distanceTo(a.point)-center.distanceTo(b.point)).slice(0,12);
 const now=Date.now();
 const pending=nearby.filter(s=>force||!busDetails.has(s.id)||now-busDetails.get(s.id).at>60000);
 for(let k=0;k<pending.length;k+=3){
  if(run!==busRun||!$('servicesBus').checked)return;
  await Promise.all(pending.slice(k,k+3).map(async s=>{
   try{
    const raw=await fetchJson(BUS_API+'/'+encodeURIComponent(s.id)+'.json');
    busDetails.set(s.id,{wait:firstWaitDetail(raw),at:Date.now()});
   }catch(e){busDetails.set(s.id,{wait:null,at:Date.now()})}
  }));
 }
 if(run===busRun){drawBus();stateText()}
}
function applySelection(){
 updateLayerVisibility();
 if($('servicesBus').checked)loadBus();
 if($('servicesBizi').checked)loadBizi();
 if(!$('servicesBus').checked)busRun++;
}
function open(){
 init();requestAnimationFrame(()=>{map.invalidateSize();fitInitial()});
 applySelection();
 if(!refreshTimer)refreshTimer=setInterval(()=>{
  if($('servicesPanel').classList.contains('hidden'))return;
  if($('servicesBizi').checked)loadBizi(true);
  if($('servicesBus').checked){if(!busLoaded)loadBus();else refreshBusArrivals(true)}
 },60000);
}
function close(){
 // Stop bus-detail work when other tabs are shown, but retain the map and data.
 busRun++;
 $('servicesPicker').open=false;
}
$('servicesBus').addEventListener('change',applySelection);
$('servicesBizi').addEventListener('change',applySelection);
$('servicesRefresh').addEventListener('click',()=>{
 if($('servicesBus').checked)loadBus(true);
 if($('servicesBizi').checked)loadBizi(true);
});
document.addEventListener('click',event=>{
 const picker=$('servicesPicker');
 if(picker.open&&!picker.contains(event.target))picker.open=false;
});
window.MyPlacesServices={open,close};
})();
