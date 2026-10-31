import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('site/trends.js','utf8');
const trend=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const html=fs.readFileSync('site/index.html','utf8');
const atlas=fs.readFileSync('site/atlas.js','utf8');

const start={id:'50001',electorate:1000,voters:700,valid:690,votes:{PSOE:300,SUMAR:100,PP:280}};
const end={id:'50001',electorate:1100,voters:660,valid:646,votes:{PSOE:260,SUMAR:70,PP:300}};
test('ten-year window ends with latest available election, not current calendar year',()=>{
 const events=[
  {date:'2011-11-20',id:'2011',geometry:'geo'},
  {date:'2015-12-20',id:'2015',geometry:'geo'},
  {date:'2016-06-26',id:'2016',geometry:'geo'},
  {date:'2019-04-28',id:'2019',geometry:'geo'},
  {date:'2023-07-23',id:'2023',geometry:'geo'}
 ];
 assert.deepEqual(trend.recentDecade(events).map(x=>x.id),['2015','2016','2019','2023']);
});
test('filter keeps election type and geographical level separate',()=>{
 const catalog={elections:[
  {id:'g1',type:'generales',level:'municipio',date:'2019-04-28',file:'1',geometry:'geo1'},
  {id:'m1',type:'municipales',level:'municipio',date:'2019-05-26',file:'2',geometry:'geo1'},
  {id:'g2',type:'generales',level:'seccion',date:'2019-04-28',file:'3',geometry:'geo2'}
 ]};
 assert.deepEqual(trend.trendEvents(catalog,'generales','municipio').map(e=>e.id),['g1']);
});
test('compare absolute votes, shares, abstention, turnout and electorate independently',()=>{
 const c=trend.compareTerritory(start,end,trend.trendGroups.izquierda);
 assert.equal(c.votesBefore,400);
 assert.equal(c.votesAfter,330);
 assert.equal(c.votesChange,-70);
 assert.equal(c.electorateChange,100);
 assert.equal(c.abstentionChange,140); // before 300, after 440
 assert.equal(c.turnoutBefore,70);
 assert.equal(c.turnoutAfter,60);
 assert.equal(c.turnoutChange,-10);
 assert.ok(Math.abs(c.shareChange-(100*330/646-100*400/690))<1e-10);
 assert.equal(trend.trendValue(c,'votesChange'),-70);
 assert.equal(trend.trendValue(c,'shareChange'),c.shareChange);
});
test('PSOE and IU/Podemos/Sumar can be examined separately without imputed OTROS',()=>{
 assert.deepEqual(trend.trendGroups.izquierda,['PSOE','SUMAR','CHA','ARA_IU','ARA_PODEMOS','ARA_SUMAR']);
 assert.equal(trend.compareTerritory(start,end,trend.trendGroups.psoe).votesChange,-40);
 assert.equal(trend.compareTerritory(start,end,trend.trendGroups.otras_izquierdas).votesChange,-30);
});
test('do not compare percentages with different historical denominator definitions',()=>{
 const first={...start,denominator:'candidaturas'};
 const c=trend.compareTerritory(first,end,trend.trendGroups.izquierda);
 assert.equal(c.shareChange,null);
 assert.equal(c.denominatorComparable,false);
 assert.equal(c.votesChange,-70);
});
test('record missing from either election remains missing rather than interpreted as zero',()=>{
 assert.equal(trend.compareTerritory(null,end),null);
 assert.equal(trend.trendValue(null,'turnoutChange'),null);
});
test('tab keeps personal points behind existing opt-in and exposes all historical controls',()=>{
 assert.match(atlas,/createTrendTab/);
 assert.match(atlas,/trendTab\?\.refreshPins\(\)/);
 assert.match(src,/privateInfo\.authorized\|\|!privateInfo\.enabled/);
 for(const id of ['atlasTrendsScreen','atlasTrendMap','atlasTrendType','atlasTrendLevel','atlasTrendGroup','atlasTrendMetric','atlasTrendFrom','atlasTrendTo','atlasTrendInfo','atlasTrendHistory']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing element '+id);
 }
 assert.match(html,/data-atlas-tab="trends"/);
});
