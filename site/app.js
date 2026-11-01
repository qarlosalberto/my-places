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
// Public deployment: only the personal markers app is active.
// Election modules and their datasets remain in the repository for later activation.
function showMarkers(){
 hide('dashboard',!user);
 hide('cartelesGate',!!user);
 if(user){initMap();render();setTimeout(()=>map?.invalidateSize(),80)}
}
showMarkers();
const configured=Boolean(firebaseConfig.apiKey&&!firebaseConfig.apiKey.includes('PON_AQUI')&&firebaseConfig.projectId&&!firebaseConfig.projectId.includes('PON_AQUI'));
if(!configured){hide('setup',false);$('login').disabled=true}else{
 const fb=initializeApp(firebaseConfig);auth=getAuth(fb);db=getFirestore(fb);
 $('login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(err);
 $('logout').onclick=()=>signOut(auth).catch(err);
 onAuthStateChanged(auth,async u=>{
  unsubscribe();unsubscribe=()=>{};if(!u)stopTracking();user=null;places=[];photoUrls.clear();
  hide('login',!!u);hide('logout',!u);$('identity').textContent=u?.email||'';hide('dashboard',true);hide('denied',true);showMarkers();
  if(!u)return;
  try{
   const invite=await getDoc(doc(db,'invites',u.email.toLowerCase()));
   if(!invite.exists()||invite.data().active!==true){hide('denied',false);return}
   user=u;showMarkers();
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
 const h=document.createElement('h3');h.textContent=p.title;const desc=document.createElement('p');desc.textContent=p.description||'';
 const facts=placeFacts(p);
 const meta=document.createElement('p');meta.className='meta';meta.textContent=Number(p.lat).toFixed(5)+', '+Number(p.lng).toFixed(5);
 const edit=document.createElement('button');edit.textContent='View / Edit';edit.onclick=()=>openEditor(p);
 card.append(info,h,facts);if(p.description)card.append(desc);card.append(meta);if(p.photoExists){const img=document.createElement('img');img.alt='Place photo';card.insertBefore(img,card.firstChild);getPhoto(p).then(src=>{if(src)img.src=src}).catch(()=>{})}card.append(edit);$('cards').append(card)}
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
const NEW_ENTRY='__myplaces_create_new__';
function makeSelect(id,options,placeholder,choice='',newOption=''){
 const sel=$(id);sel.replaceChildren(new Option(placeholder,''));
 options.forEach(name=>sel.add(new Option(name,name)));
 if(newOption)sel.add(new Option(newOption,NEW_ENTRY));
 sel.value=choice||'';
 if(sel.selectedIndex===-1)sel.value='';
}
function toggleNewGroup(){
 const newGroup=val('group')===NEW_ENTRY;
 hide('newGroupRow',!newGroup);
 if(!newGroup)$('newGroup').value='';
 hide('newMapGroupFields',val('category')!==NEW_ENTRY&&!newGroup);
}
function chooseGroups(choice=''){
 const newMap=val('category')===NEW_ENTRY;
 hide('newMapRow',!newMap);
 if(!newMap)$('newCategory').value='';
 makeSelect('group',newMap?[]:groups(val('category')),'No group',choice,'+ New group…');
 toggleNewGroup();
}
$('category').onchange=()=>{
 chooseGroups();
 if(val('category')===NEW_ENTRY)$('newCategory').focus();
};
$('group').onchange=()=>{
 toggleNewGroup();
 if(val('group')===NEW_ENTRY)$('newGroup').focus();
};
function openEditor(p=null){
 const dialog=$('editor');
 // Show the editor immediately: a GPS or selector error must never block the modal.
 if(!dialog.open)dialog.showModal();
 try{
 stopPrecision(false);addressSequence++;lastResolvedAddress='';lastResolvedKey='';autoTitle='';titleManuallyEdited=Boolean(p?.title);selected=p;photoData=null;manualAdjusted=Boolean(p?.locationManual);accuracyMeters=typeof p?.accuracyMeters==='number'?p.accuracyMeters:null;$('placeForm').reset();$('dialogTitle').textContent=p?'Edit place':'New place';
 for(const id of ['title','lat','lng'])$(id).value=p?.[id]??'';
 $('rating').value=p?.rating||'Good';$('size').value=p?.size||"Doesn't matter";$('visibility').value=p?.visibility||'Not sure';
 const mapChoices=categories();makeSelect('category',mapChoices,'Select a map',p?.map||val('activeMap')||(!mapChoices.length?NEW_ENTRY:''),'+ New map…');chooseGroups(p?.group||'');$('photoPreview').replaceChildren();$('removePhoto').checked=false;hide('removePhotoRow',!p?.photoExists);hide('delete',!p);hide('manualGpsControls',!p);hide('titleEntry',!p);hide('coordinateEntry',!p);hide('locationMapDetails',!p);$('gpsStatus').textContent='';$('addressStatus').textContent='';$('placeForm').querySelector('button[type=submit]').disabled=!p;if(p)initPrecisionMap();else{$('gpsStatus').textContent='Getting GPS position…';startPlaceGpsCapture()}
 if(p?.photoExists)getPhoto(p).then(src=>{if(src&&selected?.id===p.id){const img=new Image();img.src=src;$('photoPreview').append(img)}}).catch(err)
 }catch(error){console.error('Could not initialise place editor',error);$('gpsStatus').textContent='Could not load all place options. Close and reopen to retry.';err(error)}
}
$('new').addEventListener('click',event=>{event.preventDefault();openEditor()});$('close').onclick=()=>{$('editor').close();stopPrecision(false)};
$('editor').addEventListener('close',()=>stopPrecision(false));
function updatePrecisionPosition(lat,lng,moveView=true){
 $('lat').value=Number(lat).toFixed(7);$('lng').value=Number(lng).toFixed(7);
 if(!selected&&$('editor').open)$('placeForm').querySelector('button[type=submit]').disabled=false;
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
function startPlaceGpsCapture(){
 if(!window.isSecureContext||!navigator.geolocation){$('gpsStatus').textContent='Location unavailable. Enable location services and use HTTPS.';return}
 if(trackingWatch!==null&&useTrackingFix())return;
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
}
$('gps').onclick=startPlaceGpsCapture;

$('title').addEventListener('input',()=>{titleManuallyEdited=Boolean(val('title'));autoTitle='';addressSequence++});
$('clearTitle').onclick=()=>{$('title').value='';autoTitle='';titleManuallyEdited=false;addressSequence++;$('addressStatus').textContent='Enter your own title or capture a new position.';$('title').focus()};
async function lookupAddress(lat,lng){
 if(titleManuallyEdited||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng)))return;
 const key=Number(lat).toFixed(5)+','+Number(lng).toFixed(5);
 const seq=++addressSequence;
 lastResolvedAddress='';lastResolvedKey='';
 const apply=name=>{if(seq!==addressSequence||!$('editor').open)return;lastResolvedAddress=name.slice(0,160);lastResolvedKey=key;if(!titleManuallyEdited){$('title').value=lastResolvedAddress;autoTitle=lastResolvedAddress;$('addressStatus').textContent='Address from GPS · © OpenStreetMap contributors.'}};
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
  if(name)apply(name);else if(seq===addressSequence)$('addressStatus').textContent='Address unavailable; coordinates will be used as title.';
 }catch(e){if(seq===addressSequence)$('addressStatus').textContent='Address lookup unavailable; coordinates will be used as title.'}
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
$('placeForm').onsubmit=async e=>{e.preventDefault();if(!user)return;if(val('lat')===''||val('lng')===''){toast('Waiting for GPS position.');return}const lat=Number(val('lat')),lng=Number(val('lng'));if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return toast('Invalid coordinates');
 const mapChoice=val('category'),groupChoice=val('group');
 const cat=mapChoice===NEW_ENTRY?val('newCategory'):mapChoice;
 const group=groupChoice===NEW_ENTRY?val('newGroup'):groupChoice;
 if(!cat)return toast(mapChoice===NEW_ENTRY?'Enter a new map name.':'Select a map.');
 if(groupChoice===NEW_ENTRY&&!group)return toast('Enter a new group name.');
 const titleKey=lat.toFixed(5)+','+lng.toFixed(5);if(!titleManuallyEdited&&!addressCache.has(titleKey)&&lastResolvedKey!==titleKey)await lookupAddress(lat,lng);
 const fallbackTitle=addressCache.get(titleKey)||(lastResolvedKey===titleKey?lastResolvedAddress:'')||lat.toFixed(7)+', '+lng.toFixed(7);const finalTitle=(titleManuallyEdited&&val('title'))?val('title'):fallbackTitle;$('title').value=finalTitle;
 const save=$('placeForm').querySelector('button[type=submit]');save.disabled=true;
 try{const p=selected,ref=p?doc(db,'users',user.uid,'places',p.id):doc(collection(db,'users',user.uid,'places'));const batch=writeBatch(db);
 const fields={title:finalTitle,description:p?.description||'',lat,lng,map:cat,group,rating:val('rating'),size:val('size'),visibility:val('visibility'),accuracyMeters:manualAdjusted?null:accuracyMeters,locationManual:manualAdjusted,updatedAt:serverTimestamp(),photoExists:photoData?true:($('removePhoto').checked?false:Boolean(p?.photoExists))};
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

/* Self-contained PDF export: no third-party PDF/HTML screenshot scripts. */
const reportBytes=s=>new TextEncoder().encode(s);
function reportText(s){
 const replacements={'’':"'",'‘':"'",'“':'"','”':'"','–':'-','—':'-','•':'-','…':'...','€':'EUR','™':'TM','œ':'oe','Œ':'OE'};
 let out='';
 for(const char of String(s??'').replace(/[\r\n\t]+/g,' ')){
  const c=replacements[char]??char,code=c.charCodeAt(0);
  for(const ch of c){
   const n=ch.charCodeAt(0);
   if(ch==='('||ch===')'||ch==='\\')out+='\\'+ch;
   else if(n>=32&&n<=126)out+=ch;
   else if(n>=160&&n<=255)out+='\\'+n.toString(8).padStart(3,'0');
   else if(n>126)out+='?';
  }
 }
 return out;
}
function reportWrap(value,max=89){
 const out=[];for(const paragraph of String(value??'').split(/\r?\n/)){
  let line='';
  for(const word of paragraph.split(/\s+/)){
   if(!word)continue;
   if((line+' '+word).trim().length>max&&line){out.push(line);line=''}
   if(word.length>max){if(line){out.push(line);line=''}for(let i=0;i<word.length;i+=max)out.push(word.slice(i,i+max))}
   else line+=(line?' ':'')+word;
  }
  if(line)out.push(line);
 }
 return out.length?out:[''];
}
function makePdfDocument(pages,canvas,photos=[]){
 const width=canvas.width,height=canvas.height;
 const binary=atob(canvas.toDataURL('image/jpeg',0.84).split(',')[1]);
 const jpeg=Uint8Array.from(binary,ch=>ch.charCodeAt(0));
 const objects=[null];const add=content=>(objects.push(content),objects.length-1);
 const pagesId=add(''),regular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
 bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const imageId=add([reportBytes('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,reportBytes('\nendstream')]);
 const photoIds=photos.map(photo=>add([reportBytes('<< /Type /XObject /Subtype /Image /Width '+photo.width+' /Height '+photo.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+photo.bytes.length+' >>\nstream\n'),photo.bytes,reportBytes('\nendstream')]));
 const imageRefs='/Im0 '+imageId+' 0 R'+photos.map((photo,index)=>' /'+photo.alias+' '+photoIds[index]+' 0 R').join('');
 const pageIds=[];
 pages.forEach(commands=>{
  const content=reportBytes(commands.join('\n')+'\n');
  const streamId=add([reportBytes('<< /Length '+content.length+' >>\nstream\n'),content,reportBytes('endstream')]);
  pageIds.push(add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 '+regular+' 0 R /F2 '+bold+' 0 R >> /XObject << '+imageRefs+' >> >> /Contents '+streamId+' 0 R >>'));
 });
 objects[pagesId]='<< /Type /Pages /Kids ['+pageIds.map(id=>id+' 0 R').join(' ')+'] /Count '+pageIds.length+' >>';
 const catalog=add('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
 const sections=[reportBytes('%PDF-1.4\n%PDF map report\n')],offsets=[0];let length=sections[0].length;
 for(let i=1;i<objects.length;i++){
  offsets[i]=length;
  const segments=[reportBytes(i+' 0 obj\n'),...(Array.isArray(objects[i])?objects[i]:[reportBytes(objects[i])]),reportBytes('\nendobj\n')];
  for(const part of segments){sections.push(part);length+=part.length}
 }
 const xrefOffset=length;
 let xref='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 xref+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF\n';
 sections.push(reportBytes(xref));
 return new Blob(sections,{type:'application/pdf'});
}
function drawReportCanvas(points){
 const W=1100,H=620,padding=85;
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Map drawing not available');
 ctx.fillStyle='#e9f1f7';ctx.fillRect(0,0,W,H);
 const project=(p,z)=>{
  const lat=Math.max(-85.051128,Math.min(85.051128,Number(p.lat)))*Math.PI/180;
  const scale=256*Math.pow(2,z);
  return {x:(Number(p.lng)+180)/360*scale,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*scale};
 };
 let zoom=14,coordinates=[],lo,hi;
 if(points.length>1){
  for(let z=16;z>=0;z--){
   const projected=points.map(p=>project(p,z));
   const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
   const dx=Math.max(...xs)-Math.min(...xs),dy=Math.max(...ys)-Math.min(...ys);
   if(dx<=W-2*padding&&dy<=H-2*padding){zoom=z;break}
  }
 }
 coordinates=points.map(p=>project(p,zoom));
 const cx=(Math.min(...coordinates.map(p=>p.x))+Math.max(...coordinates.map(p=>p.x)))/2;
 const cy=(Math.min(...coordinates.map(p=>p.y))+Math.max(...coordinates.map(p=>p.y)))/2;
 const worldTiles=Math.pow(2,zoom);
 const tx0=Math.floor((cx-W/2)/256),tx1=Math.floor((cx+W/2)/256);
 const ty0=Math.max(0,Math.floor((cy-H/2)/256)),ty1=Math.min(worldTiles-1,Math.floor((cy+H/2)/256));
 return {canvas,ctx,zoom,coordinates,cx,cy,W,H,tx0,tx1,ty0,ty1,worldTiles};
}
function reportTile(url){
 return new Promise(resolve=>{
  const img=new Image();img.crossOrigin='anonymous';let settled=false;
  const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(result)};
  const timer=setTimeout(()=>finish(null),6500);
  img.onload=()=>finish(img);img.onerror=()=>finish(null);img.src=url;
 });
}
async function makeReportMap(places){
 const d=drawReportCanvas(places);
 const {ctx,W,H,coordinates,cx,cy,zoom,worldTiles}=d;
 const tiles=[];
 for(let tx=d.tx0;tx<=d.tx1;tx++)for(let ty=d.ty0;ty<=d.ty1;ty++){
  tiles.push({tx,ty,promise:reportTile('https://tile.openstreetmap.org/'+zoom+'/'+((tx%worldTiles+worldTiles)%worldTiles)+'/'+ty+'.png')});
 }
 let loaded=0;
 const images=await Promise.all(tiles.map(async t=>({...t,image:await t.promise})));
 for(const tile of images)if(tile.image){
  try{ctx.drawImage(tile.image,Math.round(tile.tx*256-cx+W/2),Math.round(tile.ty*256-cy+H/2),257,257);loaded++}catch(e){console.warn('Map tile could not be drawn',e)}
 }
 if(!loaded){
  ctx.strokeStyle='#ccd9e5';ctx.lineWidth=1;
  for(let x=0;x<W;x+=90){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=0;y<H;y+=90){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  ctx.fillStyle='#617991';ctx.font='20px sans-serif';ctx.fillText('Map tiles unavailable - point positions shown',25,35);
 }
 coordinates.forEach((p,i)=>{
  const x=p.x-cx+W/2,y=p.y-cy+H/2;
  ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fillStyle='#236bd5';ctx.fill();
  ctx.lineWidth=4;ctx.strokeStyle='#fff';ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y+1);
 });
 ctx.textAlign='left';ctx.textBaseline='alphabetic';
 ctx.fillStyle='#ffffff';ctx.fillRect(0,H-24,W,24);
 ctx.font='13px sans-serif';ctx.fillStyle='#4a6079';
 ctx.fillText('Map data © OpenStreetMap contributors',12,H-7);
 return {canvas:d.canvas,tilesLoaded:loaded};
}
async function reportPlacePhoto(p,index){
 if(!p.photoExists)return null;
 try{
  const source=await getPhoto(p);
  if(typeof source!=='string'||!source.startsWith('data:image/jpeg;base64,'))return null;
  const image=new Image();
  await new Promise((resolve,reject)=>{
   image.onload=resolve;
   image.onerror=()=>reject(new Error('Could not decode saved photograph'));
   image.src=source;
  });
  if(!image.naturalWidth||!image.naturalHeight)return null;
  const binary=atob(source.slice('data:image/jpeg;base64,'.length));
  return {alias:'Im'+(index+1),width:image.naturalWidth,height:image.naturalHeight,bytes:Uint8Array.from(binary,ch=>ch.charCodeAt(0))};
 }catch(error){console.warn('Skipping unavailable PDF photo for place',p.id,error);return null}
}
async function exportFilteredPdf(){
 const button=$('exportPdf'),items=relevant();
 if(!items.length){toast('No places match the current filters.');return}
 const valid=items.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng))&&Math.abs(Number(p.lat))<=85&&Math.abs(Number(p.lng))<=180);
 if(!valid.length){toast('No valid coordinates to map.');return}
 button.disabled=true;button.textContent='Preparing PDF…';
 try{
  const {canvas,tilesLoaded}=await makeReportMap(valid);
  const pages=[[]],pdfPhotos=[];let skippedPhotos=0;let page=pages[0],y=45;
  const text=(value,size=10,bold=false,color=[30,53,85],x=40)=>{
   const escaped=reportText(value);
   page.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+color.map(n=>(n/255).toFixed(3)).join(' ')+' rg 1 0 0 1 '+x+' '+(841.89-y).toFixed(2)+' Tm ('+escaped+') Tj ET');
  };
  const nextPage=()=>{page=[];pages.push(page);y=43};
  const lines=(value,size=9,bold=false,max=100,color=[70,87,109])=>{
   for(const line of reportWrap(value,max)){if(y>797)nextPage();text(line,size,bold,color);y+=size+4}
  };
  const chosenMap=val('activeMap')||'My Places';
  text('My Places',23,true,[27,63,109]);y+=26;
  lines(chosenMap,13,true,73,[38,91,163]);y+=3;
  const filters=[['Group','filterGroup'],['Rating','filterRating'],['Size','filterSize'],['Visibility','filterVisibility'],['Search','search']]
   .filter(([,id])=>val(id)).map(([label,id])=>label+': '+val(id)).join('  |  ');
  if(filters)lines(filters,9,false,105);
  lines(valid.length+' places  |  '+new Date().toLocaleDateString('en-GB'),9);
  y+=10;
  const mapW=515,mapH=mapW*canvas.height/canvas.width;
  if(y+mapH>695)nextPage();
  page.push('q '+mapW.toFixed(2)+' 0 0 '+mapH.toFixed(2)+' 40 '+(841.89-y-mapH).toFixed(2)+' cm /Im0 Do Q');
  y+=mapH+23;
  if(y>785)nextPage();
  text('Places',15,true,[27,63,109]);y+=22;
  for(let i=0;i<valid.length;i++){
   const p=valid[i];
   if(y>757)nextPage();
   lines((i+1)+'. '+(p.title||'Untitled place'),11,true,85,[27,63,109]);
   lines('Group: '+(p.group||'No group')+'  |  Rating: '+(p.rating||'Good')+'  |  Size: '+(p.size||"Doesn't matter")+'  |  Visibility: '+(p.visibility||'Not sure'),8.5,false,105);
   lines(Number(p.lat).toFixed(7)+', '+Number(p.lng).toFixed(7),8.5);
   if(p.description)lines(String(p.description),9,false,102);
   if(p.photoExists){
    button.textContent='Adding photos ('+(i+1)+'/'+valid.length+')…';
    const photo=await reportPlacePhoto(p,i);
    if(photo){
     pdfPhotos.push(photo);
     const pictureScale=Math.min(265/photo.width,155/photo.height,1);
     const pictureWidth=photo.width*pictureScale,pictureHeight=photo.height*pictureScale;
     if(y+pictureHeight+15>786)nextPage();
     page.push('q '+pictureWidth.toFixed(2)+' 0 0 '+pictureHeight.toFixed(2)+' 40 '+(841.89-y-pictureHeight).toFixed(2)+' cm /'+photo.alias+' Do Q');
     y+=pictureHeight+10;
    }else skippedPhotos++;
   }
   y+=10;
  }
  pages.forEach((commands,index)=>{
   commands.push('BT /F1 8 Tf 0.48 0.53 0.62 rg 1 0 0 1 40 22 Tm ('+reportText('Page '+(index+1)+' / '+pages.length)+') Tj ET');
  });
  const blob=makePdfDocument(pages,canvas,pdfPhotos);
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='My-Places-'+chosenMap.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)+'.pdf';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  toast('PDF ready: '+valid.length+' places, '+pdfPhotos.length+' photos.'+(skippedPhotos?' '+skippedPhotos+' photos unavailable.':'')+(!tilesLoaded?' Map tiles unavailable.':''));
 }catch(e){console.error('PDF export failed',e);toast('PDF export failed: '+(e.message||e))}
 finally{button.disabled=false;button.textContent='⬇ Export PDF'}
}
$('exportPdf').onclick=exportFilteredPdf;
