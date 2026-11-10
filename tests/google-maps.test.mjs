import test from 'node:test';
import assert from 'node:assert/strict';
import {isValidPlace,googleMapsPlaceUrl,placesToKml} from '../site/google-maps.mjs';
const sample={title:'Café & "Plaza" <Norte>',description:'A < B & C',lat:41.6123456,lng:-0.9123456,map:'City',group:"Children's places",rating:'Good',size:'Small',visibility:'Perfect'};
test('Google Maps uses coordinates and an API URL',()=>{
 const url=new URL(googleMapsPlaceUrl(sample));
 assert.equal(url.origin,'https://www.google.com');
 assert.equal(url.pathname,'/maps/search/');
 assert.equal(url.searchParams.get('api'),'1');
 assert.equal(url.searchParams.get('query'),'41.6123456,-0.9123456');
});
test('coordinate validation accepts zero and rejects invalid values',()=>{
 assert.equal(isValidPlace({lat:0,lng:0}),true);
 assert.equal(isValidPlace({lat:'0',lng:'-180'}),true);
 for(const place of [{lat:'',lng:0},{lat:null,lng:0},{lat:91,lng:0},{lat:0,lng:181},{lat:'NaN',lng:0}]){
  assert.equal(isValidPlace(place),false);
 }
 assert.throws(()=>googleMapsPlaceUrl({lat:100,lng:0}),RangeError);
});
test('KML exports coordinates in longitude-latitude order with escaped XML text',()=>{
 const kml=placesToKml([sample,{title:'Invalid',lat:92,lng:0}],'Map & <Friends>');
 assert.match(kml,/<kml xmlns="http:\/\/www.opengis.net\/kml\/2.2">/);
 assert.match(kml,/<name>Map &amp; &lt;Friends&gt;<\/name>/);
 assert.match(kml,/<name>Café &amp; &quot;Plaza&quot; &lt;Norte&gt;<\/name>/);
 assert.match(kml,/<description>A &lt; B &amp; C<\/description>/);
 assert.match(kml,/<Data name="group"><value>Children&apos;s places<\/value><\/Data>/);
 assert.match(kml,/<coordinates>-0.9123456,41.6123456,0<\/coordinates>/);
 assert.equal((kml.match(/<Placemark>/g)||[]).length,1);
 assert.doesNotMatch(kml,/Invalid/);
});
test('empty KML is valid and strips disallowed control characters',()=>{
 const kml=placesToKml([{...sample,title:'A\u0001B'}]);
 assert.match(kml,/<name>AB<\/name>/);
 assert.equal(placesToKml([]).includes('<Placemark>'),false);
 assert.match(placesToKml([]),/<\/Document>\n<\/kml>/);
});
