/* Google Maps URLs open individual coordinates; My Maps imports KML collections. */
export function isValidPlace(place){
 if(!place || place.lat==null || place.lng==null || String(place.lat).trim()==='' || String(place.lng).trim()==='')return false;
 const lat=Number(place.lat),lng=Number(place.lng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;
}
export function googleMapsPlaceUrl(place){
 if(!isValidPlace(place))throw new RangeError('Invalid place coordinates');
 const coordinates=Number(place.lat)+','+Number(place.lng);
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(coordinates);
}
function xml(value){
 return String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'')
  .replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}
export function placesToKml(places,mapName='My Places'){
 const valid=places.filter(isValidPlace),metadata=['map','group','rating','size','visibility'];
 const points=valid.map(place=>{
  const info=metadata.map(field=>'<Data name="'+field+'"><value>'+xml(place[field])+'</value></Data>').join('');
  return '  <Placemark>\n'
   +'    <name>'+xml(place.title||'Untitled place')+'</name>\n'
   +'    <description>'+xml(place.description||'')+'</description>\n'
   +'    <ExtendedData>'+info+'</ExtendedData>\n'
   +'    <Point><coordinates>'+Number(place.lng)+','+Number(place.lat)+',0</coordinates></Point>\n'
   +'  </Placemark>';
 }).join('\n');
 return '<?xml version="1.0" encoding="UTF-8"?>\n'
  +'<kml xmlns="http://www.opengis.net/kml/2.2">\n'
  +'<Document>\n<name>'+xml(mapName)+'</name>\n'
  +(points?points+'\n':'')+'</Document>\n</kml>\n';
}
