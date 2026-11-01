import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('site/index.html','utf8');
const app=fs.readFileSync('site/app.js','utf8');
const atlas=fs.readFileSync('site/atlas.js','utf8');
const style=fs.readFileSync('site/style.css','utf8');

test('public HTML only exposes markers and Google login',()=>{
  for(const id of ['dashboard','cartelesGate','login','logout','editor','map','mapTab','listTab'])
    assert.match(html,new RegExp('id="'+id+'"'));
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'duplicate HTML IDs');
  assert.doesNotMatch(html,/id="home"|id="atlas"|href="#atlas"|data-atlas-tab=/);
  assert.doesNotMatch(html,/href="#home"/);
});
test('archived electoral modules remain but are not imported by the public app',()=>{
  assert.match(atlas,/function renderMap/);
  assert.match(atlas,/function renderHistory/);
  assert.doesNotMatch(app,/from ['"]\.\/atlas\.js|initAtlas\(|showAtlas\(|updateAtlasPlaces\(/);
  assert.match(app,/function showMarkers\(\)/);
  assert.match(app,/hide\('dashboard',!user\)/);
});
test('authentication and personal data use same user scope',()=>{
  assert.match(app,/onAuthStateChanged\(auth/);
  assert.match(app,/getDoc\(doc\(db,'invites',u.email.toLowerCase\(\)\)\)/);
  assert.match(app,/collection\(db,'users',u.uid,'places'\)/);
  assert.match(atlas,/state.authorized&&el\('atlasPins'\).checked/);
});
test('style preserves original editor/map and new atlas',()=>{
  assert.match(style,/#map\{/);assert.match(style,/#atlasMap/);assert.match(style,/\.entryGrid/);
});
test('atlas does not interpolate personal data into public catalogue',()=>{
  assert.match(atlas,/fetch\('\.\/data\/catalog.json'/);
  assert.match(atlas,/state.places=authorized\?places.slice\(\):\[\]/);
  assert.doesNotMatch(atlas,/fetch\([^\n]*users\//);
});
test('atlas pure data helpers never confuse abstention and turnout',()=>{
  const prefix=atlas.slice(atlas.indexOf('const fmt='),atlas.indexOf('function drawMap('));
  const mock={getElementById:(id)=>({value:id==='atlasMetric'?'participation':id==='atlasGroup'?'PSOE':''})};
  const script=prefix.replace(/const state=\{[\s\S]*?\};/,'const state={catalog:{groups:[],elections:[]},dataCache:new Map()};');
  const context={Intl,document:mock,Number,Math,String,console};
  vm.createContext(context);
  vm.runInContext('const el=id=>document.getElementById(id);'+script+';globalThis.exposed={valueFor,votesFor,winner};',context);
  const r={electorate:1000,voters:700,valid:680,votes:{PSOE:250,PP:300}};
  assert.equal(context.exposed.valueFor(r,'participation'),70);
  assert.equal(context.exposed.valueFor(r,'abstention'),300);
  assert.equal(context.exposed.valueFor(r,'votes','PSOE'),250);
  assert.equal(context.exposed.winner(r),'PP');
  assert.ok(Math.abs(context.exposed.valueFor(r,'share','PSOE')-36.7647058824)<1e-6);
});
