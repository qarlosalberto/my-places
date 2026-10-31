import {firebaseConfig} from './firebase-config-v2.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,onSnapshot,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const $=id=>document.getElementById(id), hide=(id,v)=>$(id).classList.toggle('hidden',v), val=id=>$(id).value.trim();
const key=p=>Number(p.lat).toFixed(6)+','+Number(p.lng).toFixed(6);
let auth,db,user,places=[],unsubscribe=()=>{},selected=null,pending=[],photoData=null,photoUrls=new Map(),map,markers,userPosition=null,locationMarker=null,locatedOnce=false;
let precisionWatch=null,precisionTimeout=null,precisionStarted=0,bestFix=null,manualAdjusted=false,precisionMap=null,precisionMarker=null,accuracyMeters=null;
let trackingWatch=null,latestTrackingFix=null;let titleManuallyEdited=false,addressSequence=0,lastAddressCall=0,lastResolvedAddress='',lastResolvedKey='',autoTitle='';const addressCache=new Map();
const toast=s=>{let t=$('toast');t.textContent=s;t.style.display='block';setTimeout(()=>t.style.display='none',4500)};
const err=e=>{console.error(e);toast(e.message||String(e))};
const configured=Boolean(firebaseConfig.apiKey&&!firebaseConfig.apiKey.includes('PON_AQUI')&&firebaseConfig.projectId&&!firebaseConfig.projectId.includes('PON_AQUI'));
if(!configured){hide('setup',false);$('login').disabled=true}else{
 const fb=initializeApp(firebaseConfig);auth=getAuth(fb);db=getFirestore(fb);
 $('login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(err);
 $('logout').onclick=()=>signOut(auth).catch(err);
 onAuthStateChanged(auth,async u=>{
  unsubscribe();unsubscribe=()=>{};if(!u)stopTracking();user=null;places=[];photoUrls.clear();
  hide('login',!!u);hide('logout',!u);$('identity').textContent=u?.email||'';hide('dashboard',true);hide('denied',true);
  if(!u)return;
  try{
   const invite=await getDoc(doc(db,'invites',u.email.toLowerCase()));
   if(!invite.exists()||invite.data().active!==true){hide('denied',false);return}
   user=u;hide('dashboard',false);initMap();
   unsubscribe=onSnapshot(collection(db,'users',u.uid,'places'),s=>{places=s.docs.map(d=>({id:d.id,...d.data(),map:d.data().map||d.data().category||'Default'}));render();migrateLegacyMaps(s.docs).catch(err)},err);
  }catch(e){hide('denied',false);err(e)}
 });
}

let migrationBusy=false,pendingMapSelection='';
async function migrateLegacyMaps(docs){
 if(migrationBusy||!user)return;
 const legacy=docs.filter(d=>!d.data().map);
 if(!legacy.length)return;
 migrationBusy=true;
 try{
  for(let i=0;i<legacy.length;i+=350){
   const batch=writeBatch(db);
   for(const d of legacy.slice(i,i+350)){
    // Only update the old category field. No document IDs, locations, groups, photos, or dates change.
    batch.update(d.ref,{map:d.data().category||'Default'});
   }
   await batch.commit();
  }
  toast('Existing categories have been mapped to Maps.');
 }finally{migrationBusy=false}
}

function initMap(){if(map){setTimeout(()=>map.invalidateSize(),80);return}map=L.map('map').setView([40.42,-3.7],5);locateUser(true);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);markers=L.layerGroup().addTo(map)}
function categories(){return [...new Set(places.map(p=>p.map||p.category||'Default'))].sort()}
function groups(cat){return [...new Set(places.filter(p=>!cat||(p.map||p.category||'Default')===cat).map(p=>p.group).filter(Boolean))].sort()}
function refill(sel,options,label){const before=sel.value;sel.replaceChildren(new Option(label,''));options.forEach(s=>sel.add(new Option(s,s)));sel.value=options.includes(before)?before:''}
function refreshGroupFilter(){refill($('filterGroup'),groups(val('activeMap')),'All groups');render()}
$('activeMap').onchange=refreshGroupFilter;
function relevant(){const q=val('search').toLowerCase();return places.filter(p=>(!q||[p.title,p.description,p.map,p.group].some(s=>String(s||'').toLowerCase().includes(q)))&&
 (p.map===val('activeMap'))&&(!val('filterGroup')||p.group===val('filterGroup'))&&
 (!val('filterRating')||p.rating===val('filterRating'))&&(!val('filterSize')||(p.size||"Doesn't matter")===val('filterSize'))&&(!val('filterVisibility')||(p.visibility||'Not sure')===val('filterVisibility')))}
for(const id of ['search','filterGroup','filterRating','filterSize','filterVisibility'])$(id).addEventListener('input',render);
function placeFacts(p){const wrap=document.createElement('div');wrap.className='placeFacts';for(const [icon,label,value] of [['★','Rating',p.rating||'Good'],['↔','Size',p.size||"Doesn't matter"],['👁','Visibility',p.visibility||'Not sure']]){const item=document.createElement('span');item.className='placeFact';item.title=label;const symbol=document.createElement('span');symbol.className='factIcon';symbol.textContent=icon;symbol.setAttribute('aria-hidden','true');item.append(symbol,document.createTextNode(label+': '+value));wrap.append(item)}return wrap}
function render(){
 const previous=pendingMapSelection||$('activeMap').value;const available=categories();refill($('activeMap'),available,'Select a map');$('activeMap').value=available.includes(previous)?previous:(available[0]||'');if(available.includes(pendingMapSelection))pendingMapSelection='';
 const gg=$('filterGroup').value;refill($('filterGroup'),groups(val('activeMap')),'All groups');$('filterGroup').value=gg&&groups(val('activeMap')).includes(gg)?gg:'';
 const items=relevant();$('count').textContent=items.length+' places';
 $('cards').replaceChildren();if(!items.length)$('cards').append(Object.assign(document.createElement('p'),{textContent:'No places match your filters.'}));
 for(const p of items){let card=document.createElement('article');card.className='card';
 const info=document.createElement('div');info.className='meta';info.textContent=(p.map||'Default map')+' / '+(p.group||'No group');
 const h=document.createElement('h3');h.textContent=p.title;const desc=document.createElement('p');desc.textContent=p.description||'No description';
 const facts=placeFacts(p);
 const meta=document.createElement('p');meta.className='meta';meta.textContent=Number(p.lat).toFixed(5)+', '+Number(p.lng).toFixed(5);
 const edit=document.createElement('button');edit.textContent='View / Edit';edit.onclick=()=>openEditor(p);
 card.append(info,h,facts,desc,meta);if(p.photoExists){const img=document.createElement('img');img.alt='Place photo';card.insertBefore(img,card.firstChild);getPhoto(p).then(src=>{if(src)img.src=src}).catch(()=>{})}card.append(edit);$('cards').append(card)}
 if(!map)return;markers.clearLayers();let coords=[];
 items.forEach(p=>{if(!Number.isFinite(Number(p.lat))||!Number.isFinite(Number(p.lng)))return;let point=[Number(p.lat),Number(p.lng)];coords.push(point);let dot=L.circleMarker(point,{radius:9,color:p.rating==='Perfect'?'#149667':p.rating==='Bad'?'#ce4961':'#286bca',fillOpacity:.85});
 const preview=document.createElement('div');preview.className='placeHover';
 const heading=document.createElement('strong');heading.textContent=p.title||'Untitled place';preview.append(heading);
 const detail=document.createElement('div');detail.className='placeHoverMeta';detail.textContent=p.group||'No group';preview.append(detail,placeFacts(p));
 if(p.description){const description=document.createElement('p');description.textContent=p.description;preview.append(description)}
 if(p.photoExists){const img=document.createElement('img');img.alt='Photo of '+(p.title||'place');img.loading='lazy';preview.append(img);
 getPhoto(p).then(src=>{if(src)img.src=src}).catch(()=>{img.remove()})}
 dot.bindTooltip(preview,{direction:'top',offset:[0,-10],opacity:1,className:'placeHoverTooltip',interactive:false});
 dot.on('click',()=>{if(window.matchMedia('(hover: none)').matches){dot.openTooltip()}else{openEditor(p)}});
 dot.addTo(markers)});
 if(userPosition&&!locatedOnce){map.setView(userPosition,15);locatedOnce=true;return}
 if(userPosition)return;
 if(coords.length&&!(val('search')||val('filterGroup')||val('filterRating')||val('filterSize')||val('filterVisibility'))){map.fitBounds(coords,{padding:[35,35],maxZoom:13})}
 else if(coords.length)map.fitBounds(coords,{padding:[35,35],maxZoom:14})
}
$('mapTab').onclick=()=>{hide('mapPanel',false);hide('listPanel',true);$('mapTab').classList.add('active');$('listTab').classList.remove('active');setTimeout(()=>map?.invalidateSize(),70)};
$('listTab').onclick=()=>{hide('mapPanel',true);hide('listPanel',false);$('listTab').classList.add('active');$('mapTab').classList.remove('active')};
function makeSelect(id,options,placeholder,choice=''){let sel=$(id);sel.replaceChildren(new Option(placeholder,''));options.forEach(s=>sel.add(new Option(s,s)));sel.value=choice||''}
function chooseGroups(choice=''){makeSelect('group',groups(val('newCategory')||val('category')),'No group',choice)}
$('category').onchange=()=>chooseGroups();
$('newCategory').oninput=()=>chooseGroups();
function openEditor(p=null){stopPrecision(false);addressSequence++;lastResolvedAddress='';lastResolvedKey='';autoTitle='';titleManuallyEdited=Boolean(p?.title);selected=p;photoData=null;manualAdjusted=Boolean(p?.locationManual);accuracyMeters=typeof p?.accuracyMeters==='number'?p.accuracyMeters:null;$('placeForm').reset();$('dialogTitle').textContent=p?'Edit place':'New place';
 for(const id of ['title','description','lat','lng'])$(id).value=p?.[id]??'';
 $('rating').value=p?.rating||'Good';$('size').value=p?.size||"Doesn't matter";$('visibility').value=p?.visibility||'Not sure';
 makeSelect('category',categories(),'Select a map',p?.map||val('activeMap')||'');chooseGroups(p?.group||'');$('photoPreview').replaceChildren();$('removePhoto').checked=false;hide('removePhotoRow',!p?.photoExists);hide('delete',!p);$('gpsStatus').textContent='';$('addressStatus').textContent='';$('editor').showModal();initPrecisionMap();if(!p&&recentTrackingFix())useTrackingFix();
 if(p?.photoExists)getPhoto(p).then(src=>{if(src&&selected?.id===p.id){const img=new Image();img.src=src;$('photoPreview').append(img)}}).catch(err)
}
$('new').onclick=()=>openEditor();$('close').onclick=()=>{$('editor').close();stopPrecision(false)};
$('editor').addEventListener('close',()=>stopPrecision(false));
function updatePrecisionPosition(lat,lng,moveView=true){
 $('lat').value=Number(lat).toFixed(7);$('lng').value=Number(lng).toFixed(7);
 if(!precisionMap)return;
 const point=[Number(lat),Number(lng)];
 if(precisionMarker)precisionMarker.setLatLng(point);
 else {
  precisionMarker=L.marker(point,{draggable:true}).addTo(precisionMap);
  precisionMarker.on('dragstart',()=>{manualAdjusted=true;stopPrecision(true)});
  precisionMarker.on('dragend',()=>{const ll=precisionMarker.getLatLng();manualAdjusted=true;accuracyMeters=null;updatePrecisionPosition(ll.lat,ll.lng,false);$('gpsStatus').textContent='Marker adjusted manually; GPS accuracy no longer applies.';lookupAddress(ll.lat,ll.lng)});
 }
 if(moveView)precisionMap.setView(point,Math.max(precisionMap.getZoom(),16));
}
function initPrecisionMap(){
 if(!precisionMap){
  precisionMap=L.map('precisionMap',{zoomControl:true}).setView([40.42,-3.7],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(precisionMap);
 }
 setTimeout(()=>{
  precisionMap.invalidateSize();
  const lat=Number(val('lat')),lng=Number(val('lng'));
  if(val('lat')!==''&&val('lng')!==''&&Number.isFinite(lat)&&Number.isFinite(lng))updatePrecisionPosition(lat,lng);
  else if(userPosition)precisionMap.setView(userPosition,14);
 },100);
}
for(const id of ['lat','lng'])$(id).addEventListener('change',()=>{
 if(val('lat')===''||val('lng')==='')return;
 const lat=Number(val('lat')),lng=Number(val('lng'));
 if(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180){
  manualAdjusted=true;accuracyMeters=null;stopPrecision(false);updatePrecisionPosition(lat,lng);
  $('gpsStatus').textContent='Coordinates changed manually.';lookupAddress(lat,lng);
 }
});
function useTrackingFix(){
 const fix=recentTrackingFix();
 if(!fix){$('gpsStatus').textContent='Waiting for a fresh tracking position…';return false}
 bestFix=fix;manualAdjusted=false;accuracyMeters=fix.coords.accuracy;
 updatePrecisionPosition(fix.coords.latitude,fix.coords.longitude);
 $('gpsStatus').textContent='Tracking GPS fix: ±'+Math.round(accuracyMeters)+' m · Ready to save.';
 lookupAddress(fix.coords.latitude,fix.coords.longitude);
 return true;
}
function stopPrecision(show=true){
 if(precisionWatch!==null){navigator.geolocation?.clearWatch(precisionWatch);precisionWatch=null}
 if(precisionTimeout!==null){clearTimeout(precisionTimeout);precisionTimeout=null}
 $('gps').disabled=false;$('gps').textContent='⌖ Capture precise location';hide('stopGps',true);
 if(show&&bestFix){$('gpsStatus').textContent='Best GPS estimate: ±'+Math.round(bestFix.coords.accuracy)+' m. Drag marker to refine.';lookupAddress(bestFix.coords.latitude,bestFix.coords.longitude)};
}
$('stopGps').onclick=()=>stopPrecision(true);
$('gps').onclick=()=>{
 if(!window.isSecureContext||!navigator.geolocation){$('gpsStatus').textContent='Location unavailable. Enable location services and use HTTPS.';return}
 if(trackingWatch!==null){if(useTrackingFix())return;$('gpsStatus').textContent='Tracking is on; waiting for a recent GPS fix.';return}
 stopPrecision(false);bestFix=null;manualAdjusted=false;accuracyMeters=null;precisionStarted=Date.now();
 $('gps').disabled=true;$('gps').textContent='⌖ Measuring…';hide('stopGps',false);
 $('gpsStatus').textContent='Looking for an accurate GPS fix (up to 30 seconds)…';
 precisionTimeout=setTimeout(()=>stopPrecision(true),30000);
 precisionWatch=navigator.geolocation.watchPosition(pos=>{
  if(!Number.isFinite(pos.coords.latitude)||!Number.isFinite(pos.coords.longitude)||!Number.isFinite(pos.coords.accuracy))return;
  if(!bestFix||pos.coords.accuracy<bestFix.coords.accuracy){
   bestFix=pos;accuracyMeters=pos.coords.accuracy;updatePrecisionPosition(pos.coords.latitude,pos.coords.longitude);
   // Populate Title as soon as the first valid position is available.
   // Keep manual titles intact; address lookup handles failures gracefully.
   lookupAddress(pos.coords.latitude,pos.coords.longitude);
  }
  const accuracy=Math.round(bestFix.coords.accuracy);
  const grade=accuracy<=5?'Excellent':accuracy<=15?'Good':'Low';
  $('gpsStatus').textContent='Best accuracy: ±'+accuracy+' m ('+grade+'). Measuring… '+Math.min(30,Math.round((Date.now()-precisionStarted)/1000))+'/30 s';
  if(accuracy<=5)stopPrecision(true);
 },e=>{
  $('gpsStatus').textContent=e.code===1?'Location permission denied. Enable site location permission.':e.code===3?'GPS timed out. Try again outdoors.':e.message;
  stopPrecision(false);
 },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
};

$('title').addEventListener('input',()=>{titleManuallyEdited=Boolean(val('title'));autoTitle='';addressSequence++});
$('clearTitle').onclick=()=>{$('title').value='';autoTitle='';titleManuallyEdited=false;addressSequence++;$('addressStatus').textContent='Enter your own title or capture a new position.';$('title').focus()};
async function lookupAddress(lat,lng){
 if(titleManuallyEdited||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return;
 const key=Number(lat).toFixed(5)+','+Number(lng).toFixed(5);
 const seq=++addressSequence;
 lastResolvedAddress='';lastResolvedKey='';
 const apply=name=>{if(seq!==addressSequence||!$('editor').open)return;lastResolvedAddress=name.slice(0,160);lastResolvedKey=key;if(!titleManuallyEdited){$('title').value=lastResolvedAddress;autoTitle=lastResolvedAddress;$('addressStatus').textContent='Suggested address · © OpenStreetMap contributors. You can edit it.'}};
 if(addressCache.has(key)){const name=addressCache.get(key);if(name)apply(name);return}
 $('addressStatus').textContent='Looking up address…';
 try{
  const delay=Math.max(0,1100-(Date.now()-lastAddressCall));
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(seq!==addressSequence||titleManuallyEdited)return;
  lastAddressCall=Date.now();
  const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng)+'&zoom=18&addressdetails=1';
  const res=await fetch(url,{headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('Address lookup unavailable');
  const data=await res.json();
  const a=data.address||{};
  const street=[a.road||a.pedestrian||a.footway||a.street||'',a.house_number||''].filter(Boolean).join(' ');
  const town=a.city||a.town||a.village||a.municipality||a.county||'';
  const name=[street||data.name||'',town].filter(Boolean).join(', ')||data.display_name||'';
  addressCache.set(key,name||null);
  if(name)apply(name);else if(seq===addressSequence)$('addressStatus').textContent='Address not found. Enter a custom title.';
 }catch(e){if(seq===addressSequence)$('addressStatus').textContent='Address lookup unavailable. Enter a custom title.'}
}
// Decode pixels and re-encode in a new canvas. EXIF/GPS/camera metadata from the source is never copied.
async function compress(f){
 const img=await createImageBitmap(f,{imageOrientation:'from-image'});
 try{
  const scale=Math.min(1,800/img.width,800/img.height);
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  const ctx=c.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Image processing unavailable');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(img,0,0,c.width,c.height);
  for(const quality of [.7,.5,.35,.2]){
   const data=c.toDataURL('image/jpeg',quality);
   if(data.length<210000)return data;
  }
  throw Error('Image too large after compression. Choose another image.');
 }finally{img.close()}
}
async function selectedPhoto(e){const file=e.target.files?.[0];if(!file)return;try{photoData=await compress(file);$('photoPreview').replaceChildren();const img=new Image();img.src=photoData;img.alt='Selected place photo';$('photoPreview').append(img);$('removePhoto').checked=false;toast('Photo ready to save')}catch(x){err(x)}finally{e.target.value=''}}
$('takePhoto').onclick=()=>$('cameraPhoto').click();
$('choosePhoto').onclick=()=>$('photo').click();
$('cameraPhoto').onchange=selectedPhoto;
$('photo').onchange=selectedPhoto;
async function getPhoto(p){if(photoUrls.has(p.id))return photoUrls.get(p.id);const snap=await getDoc(doc(db,'users',user.uid,'places',p.id,'photos','main'));const src=snap.exists()?snap.data().image:null;photoUrls.set(p.id,src);return src}
$('placeForm').onsubmit=async e=>{e.preventDefault();if(!user)return;const lat=Number(val('lat')),lng=Number(val('lng'));if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return toast('Invalid coordinates');
 const cat=val('newCategory')||val('category'),group=val('newGroup')||val('group');if(!cat)return toast('Select or create a map');
 const titleKey=lat.toFixed(5)+','+lng.toFixed(5);if(!titleManuallyEdited&&!addressCache.has(titleKey)&&lastResolvedKey!==titleKey)await lookupAddress(lat,lng);
 const fallbackTitle=addressCache.get(titleKey)||(lastResolvedKey===titleKey?lastResolvedAddress:'')||lat.toFixed(7)+', '+lng.toFixed(7);const finalTitle=(titleManuallyEdited&&val('title'))?val('title'):fallbackTitle;$('title').value=finalTitle;
 const save=$('placeForm').querySelector('button[type=submit]');save.disabled=true;
 try{const p=selected,ref=p?doc(db,'users',user.uid,'places',p.id):doc(collection(db,'users',user.uid,'places'));const batch=writeBatch(db);
 const fields={title:finalTitle,description:val('description'),lat,lng,map:cat,group,rating:val('rating'),size:val('size'),visibility:val('visibility'),accuracyMeters:manualAdjusted?null:accuracyMeters,locationManual:manualAdjusted,updatedAt:serverTimestamp(),photoExists:photoData?true:($('removePhoto').checked?false:Boolean(p?.photoExists))};
 if(p)batch.update(ref,fields);else batch.set(ref,{...fields,createdAt:serverTimestamp()});
 if(photoData)batch.set(doc(db,'users',user.uid,'places',ref.id,'photos','main'),{image:photoData,updatedAt:serverTimestamp()});
 else if(p&&$('removePhoto').checked)batch.delete(doc(db,'users',user.uid,'places',ref.id,'photos','main'));
 pendingMapSelection=cat;await batch.commit();photoUrls.delete(ref.id);stopPrecision(false);$('editor').close();toast('Place saved')}catch(x){err(x)}finally{save.disabled=false}};
$('delete').onclick=async()=>{if(!selected||!confirm('Permanently delete this place?'))return;try{const b=writeBatch(db);let ref=doc(db,'users',user.uid,'places',selected.id);b.delete(ref);if(selected.photoExists)b.delete(doc(db,'users',user.uid,'places',selected.id,'photos','main'));await b.commit();stopPrecision(false);$('editor').close();toast('Place deleted')}catch(x){err(x)}};
function csvEscape(s){const x=String(s??'');return /[",\r\n]/.test(x)?'"'+x.replaceAll('"','""')+'"':x}
const columns=['lat','lng','title','description','rating','map','group','size','visibility'];
$('export').onclick=()=>{const lines=[columns.join(','),...places.map(p=>columns.map(c=>csvEscape(p[c])).join(','))];let blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='my-places-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
function parseCSV(text){text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quote=false;for(let i=0;i<text.length;i++){let c=text[i];if(quote){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quote=false;else cell+=c}else if(c==='"')quote=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}else cell+=c}if(quote)throw Error('Unclosed quoted field');if(row.length||cell){row.push(cell);rows.push(row)}return rows}
$('csvFile').onchange=async e=>{pending=[];try{const f=e.target.files[0];if(!f)return;const rows=parseCSV(await f.text());if(rows.length<2)throw Error('CSV has no records');const headers=rows.shift().map(s=>s.trim().toLowerCase());for(const required of ['lat','lng','title'])if(!headers.includes(required))throw Error('Missing required column: '+required);
 let seen=new Set(),repeats=0;for(const row of rows){if(row.length===1&&!row[0])continue;const p=Object.fromEntries(headers.map((h,i)=>[h,row[i]??'']));p.map=p.map||p.category||'Default';p.lat=Number(p.lat);p.lng=Number(p.lng);if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!p.title?.trim())throw Error('Invalid row '+(rows.indexOf(row)+2));if(p.title.length>160||String(p.description||'').length>1500||String(p.map||p.category||'').length>60||String(p.group||'').length>60)throw Error('Text too long');let k=key(p);if(seen.has(k)){repeats++;continue}seen.add(k);pending.push({lat:p.lat,lng:p.lng,title:p.title,description:p.description||'',rating:['Perfect','Good','Bad'].includes(p.rating)?p.rating:'Good',map:p.map||p.category||'Default',group:p.group||'',size:['Large','Medium','Small',"Doesn't matter"].includes(p.size)?p.size:"Doesn't matter",visibility:['Perfect','Good','Bad','Not sure'].includes(p.visibility)?p.visibility:'Not sure'})}
 let match=new Set(places.map(key));let duplicates=pending.filter(p=>match.has(key(p))).length;hide('importPanel',false);$('importSummary').textContent=pending.length+' valid rows · '+duplicates+' matching existing coordinates · '+(pending.length-duplicates)+' new · '+repeats+' repeated CSV rows ignored.'}catch(x){err(x);hide('importPanel',true)}};
$('cancelImport').onclick=()=>{pending=[];$('csvFile').value='';hide('importPanel',true)};
$('import').onclick=async()=>{if(!user||!pending.length)return;const overwrite=$('overwrite').checked;const existing=new Map(places.map(p=>[key(p),p]));const changes=pending.filter(p=>overwrite||!existing.has(key(p)));if(!confirm('Import '+changes.length+' places? '+(overwrite?'Matching existing entries will be overwritten (photos retained).':'Existing entries will stay unchanged.')))return;let count=0;
 try{for(let i=0;i<changes.length;i+=400){let b=writeBatch(db);for(const p of changes.slice(i,i+400)){const old=existing.get(key(p)),ref=old?doc(db,'users',user.uid,'places',old.id):doc(collection(db,'users',user.uid,'places'));if(old)b.update(ref,{...p,updatedAt:serverTimestamp()});else b.set(ref,{...p,photoExists:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})}await b.commit();count+=Math.min(400,changes.length-i)}
 toast('Imported '+count+' places');pending=[];$('csvFile').value='';hide('importPanel',true)
 }catch(x){err(x);$('importSummary').textContent='Imported '+count+' rows before error. Recheck before retrying.'}};


function stopTracking(){
 if(trackingWatch!==null){navigator.geolocation?.clearWatch(trackingWatch);trackingWatch=null}
 latestTrackingFix=null;
 const button=$('tracking');button.setAttribute('aria-pressed','false');button.title='Start GPS tracking';button.textContent='◎';button.classList.remove('trackingActive');
}
function startTracking(){
 if(!navigator.geolocation||!window.isSecureContext){$('locationStatus').textContent='GPS tracking requires HTTPS and location permission.';return}
 const button=$('tracking');
 button.title='Stop GPS tracking';button.textContent='●';button.setAttribute('aria-pressed','true');button.classList.add('trackingActive');
 $('locationStatus').textContent='Tracking GPS… Waiting for position.';
 trackingWatch=navigator.geolocation.watchPosition(pos=>{
  latestTrackingFix=pos;
  userPosition=[pos.coords.latitude,pos.coords.longitude];
  if(map){
   if(locationMarker)locationMarker.setLatLng(userPosition);
   else locationMarker=L.circleMarker(userPosition,{radius:9,color:'#fff',weight:3,fillColor:'#236bd5',fillOpacity:1}).addTo(map).bindTooltip('You are here');
  }
  $('locationStatus').textContent='Tracking ON · GPS ±'+Math.round(pos.coords.accuracy)+' m';
 },e=>{$('locationStatus').textContent='Tracking stopped: '+(e.code===1?'Location permission denied.':e.message);stopTracking()},
 {enableHighAccuracy:true,maximumAge:0,timeout:25000});
}
$('tracking').onclick=()=>{if(trackingWatch!==null)stopTracking();else startTracking()};
function recentTrackingFix(){return latestTrackingFix&&Date.now()-latestTrackingFix.timestamp<12000?latestTrackingFix:null}
function locateUser(initial=false){
 const button=$('locate');
 const setStatus=(message,isError=false)=>{
   $('locationStatus').textContent=message;
   $('locationStatus').classList.toggle('locationError',isError);
 };
 if(!window.isSecureContext || !navigator.geolocation){
   setStatus('Location is unavailable. Open My Places over HTTPS in a browser with location access.',true);
   return;
 }
 if(!initial)button.disabled=true;
 button.textContent='⌖';button.title='Locating…';
 setStatus('Finding your position…');
 navigator.geolocation.getCurrentPosition(pos=>{
   userPosition=[pos.coords.latitude,pos.coords.longitude];
   if(map){
     if(locationMarker)locationMarker.setLatLng(userPosition);
     else locationMarker=L.circleMarker(userPosition,{radius:9,color:'#fff',weight:3,fillColor:'#236bd5',fillOpacity:1}).addTo(map).bindTooltip('You are here');
     map.invalidateSize();
     map.setView(userPosition,16,{animate:true});
   }
   locatedOnce=true;
   setStatus('Location found (±'+Math.round(pos.coords.accuracy)+' m).');
   button.disabled=false;button.textContent='⌖';button.title='My location';
 },error=>{
   let reason=error.code===1?'Location permission denied. Enable location permission for this site in browser settings.':
     error.code===2?'Your phone could not determine its location. Check device location services.':
     error.code===3?'Location request timed out. Tap My location to retry.':
     'Unable to obtain location: '+error.message;
   setStatus(reason,true);
   button.disabled=false;button.textContent='⌖';button.title='Retry location';
 },{enableHighAccuracy:true,timeout:20000,maximumAge:15000});
}
$('locate').onclick=()=>locateUser(false);
$('toggleFilters').onclick=()=>{const expanding=$('filters').classList.contains('hidden');hide('filters',!expanding);$('toggleFilters').setAttribute('aria-expanded',String(expanding));$('toggleFilters').innerHTML='⚙ <span class="compactLabel">Filters</span> <span id="filterCount"></span>';updateFilterBadge()};
function updateFilterBadge(){const count=['search','filterGroup','filterRating','filterSize','filterVisibility'].filter(id=>val(id)).length;const badge=$('filterCount');if(badge)badge.textContent=count?'('+count+')':''}
for(const id of ['search','filterGroup','filterRating','filterSize','filterVisibility'])$(id).addEventListener('input',updateFilterBadge);

/* PDF report of the currently selected map and filters */
function loadReportScript(src,globalName){
 if(window[globalName])return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const el=document.createElement('script');el.src=src;el.onload=()=>window[globalName]?resolve():reject(Error('PDF library unavailable'));el.onerror=()=>reject(Error('Could not load PDF library'));document.head.append(el);
 });
}
async function exportFilteredPdf(){
 const button=$('exportPdf'),items=relevant();
 if(!items.length){toast('No places match the current filters.');return}
 const valid=items.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lng))<=180);
 if(!valid.length){toast('No valid coordinates to map.');return}
 button.disabled=true;button.textContent='Preparing PDF…';
 let canvasMap=null,previewMap=null;
 try{
  await Promise.all([
   loadReportScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js','jspdf'),
   loadReportScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','html2canvas')
  ]);
  const container=document.createElement('div');
  canvasMap=container;
  Object.assign(container.style,{position:'fixed',left:'0',top:'-1200px',width:'900px',height:'510px',zIndex:'-1',background:'#e6edf4'});
  document.body.append(container);
  previewMap=L.map(container,{zoomControl:false,attributionControl:false,fadeAnimation:false,zoomAnimation:false});
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,crossOrigin:true});
  tiles.addTo(previewMap);
  const bounds=L.latLngBounds(valid.map(p=>[Number(p.lat),Number(p.lng)]));
  if(valid.length===1)previewMap.setView(bounds.getCenter(),14);
  else previewMap.fitBounds(bounds,{padding:[55,55],maxZoom:14,animate:false});
  valid.forEach((p,index)=>{
   const point=[Number(p.lat),Number(p.lng)];
   L.circleMarker(point,{radius:11,color:'#ffffff',weight:3,fillColor:'#236bd5',fillOpacity:1}).addTo(previewMap);
   L.marker(point,{icon:L.divIcon({className:'pdfPlaceNumber',html:'<span>'+String(index+1)+'</span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(previewMap);
  });
  previewMap.invalidateSize();
  await Promise.race([new Promise(resolve=>tiles.once('load',resolve)),new Promise(resolve=>setTimeout(resolve,5500))]);
  await new Promise(resolve=>setTimeout(resolve,300));
  const image=await window.html2canvas(container,{useCORS:true,allowTaint:false,backgroundColor:'#e6edf4',scale:1,logging:false});
  const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const W=210,M=14,usable=W-2*M;
  const currentMap=val('activeMap')||'My Places';
  let y=18;
  pdf.setFont('helvetica','bold');pdf.setFontSize(21);pdf.setTextColor(25,53,93);pdf.text('My Places',M,y);
  y+=9;pdf.setFontSize(12);pdf.text(currentMap,M,y);y+=8;
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.setTextColor(95,113,138);
  const filterInfo=[['Group','filterGroup'],['Rating','filterRating'],['Size','filterSize'],['Visibility','filterVisibility'],['Search','search']]
    .filter(([,id])=>val(id)).map(([name,id])=>name+': '+val(id)).join('  |  ');
  if(filterInfo){for(const line of pdf.splitTextToSize(filterInfo,usable)){pdf.text(line,M,y);y+=5}}
  pdf.text(valid.length+' places  •  '+new Date().toLocaleDateString('en-GB'),M,y);y+=6;
  const mapHeight=usable*510/900;
  pdf.addImage(image.toDataURL('image/jpeg',0.87),'JPEG',M,y,usable,mapHeight);y+=mapHeight+9;
  pdf.setFont('helvetica','bold');pdf.setTextColor(25,53,93);pdf.setFontSize(13);pdf.text('Places',M,y);y+=8;
  for(let i=0;i<valid.length;i++){
   const p=valid[i];
   const heading=(i+1)+'. '+(p.title||'Untitled place');
   const line=[p.group||'No group','Rating: '+(p.rating||'Good'),'Size: '+(p.size||"Doesn't matter"),'Visibility: '+(p.visibility||'Not sure')].join('  |  ');
   const coords=Number(p.lat).toFixed(7)+', '+Number(p.lng).toFixed(7);
   const titleLines=pdf.splitTextToSize(heading,usable);
   const detailLines=pdf.splitTextToSize(line,usable);
   const descLines=p.description?pdf.splitTextToSize(String(p.description),usable):[];
   const needed=titleLines.length*5.2+detailLines.length*4.4+descLines.length*4.4+10;
   if(y+Math.min(needed,24)>280){pdf.addPage();y=20}
   pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.setTextColor(28,65,117);
   for(const t of titleLines){if(y>283){pdf.addPage();y=20}pdf.text(t,M,y);y+=5.2}
   pdf.setFont('helvetica','normal');pdf.setFontSize(8.4);pdf.setTextColor(75,90,112);
   for(const t of detailLines.concat([coords]).concat(descLines)){if(y>283){pdf.addPage();y=20}pdf.text(t,M,y);y+=4.4}
   y+=5;
  }
  const cleanName=currentMap.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'places';
  pdf.save('My-Places-'+cleanName+'.pdf');
  toast('PDF downloaded with '+valid.length+' places.');
 }catch(e){err(e)}
 finally{if(previewMap)previewMap.remove();if(canvasMap)canvasMap.remove();button.disabled=false;button.textContent='⬇ Export PDF'}
}
$('exportPdf').onclick=exportFilteredPdf;
