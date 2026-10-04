const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(file){const html=fs.readFileSync(require('node:path').join(__dirname,'../utilidades/',file),'utf8');const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',classList:{toggle(){}},setAttribute(){}});return nodes.get(id)};for(const m of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g))node(m[1]).value=m[2];const context=vm.createContext({document:{documentElement:{classList:{add(){}}},getElementById:node},localStorage:{getItem:()=>null,setItem(){}},console,window:{addEventListener(){}}});for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);return{node,run:code=>vm.runInContext(code,context)}}
const nav=load('flightprep-nav.html');
assert.equal(nav.run('Math.round(comp(20,180,180).head)'),20);
assert.equal(nav.run('Math.round(comp(20,270,180).cross)'),20);
nav.run("S={org:'A',dst:'B',tas:100,gph:10,taxi:0,cont:0,res:0,alt:0,fuel:20,etd:'23:30',legs:[{to:'B',tc:0,d:100,wd:0,ws:0,v:0,dv:0}]};buildLegs();calcNav()");
assert.equal(nav.node('g0').innerHTML,'100');assert.equal(nav.node('e0').innerHTML,'1h 00m');assert.equal(nav.node('a0').innerHTML,'00:30');assert.equal(nav.node('f0').innerHTML,'10.0');
nav.run('S.legs[0].ws=120;calcNav()');assert.match(nav.node('nstatus').textContent,/Revisá/);
nav.run('S.legs[0].ws=0;S.legs[0].d=-1;calcNav()');assert.match(nav.node('nstatus').textContent,/positivos/);
nav.run("S.legs[0].to='<img src=x onerror=alert(1)>';buildLegs()");assert.ok(!nav.node('legs').innerHTML.includes('<img'));
const wb=load('peso-balance.html');assert.match(wb.node('tot').innerHTML,/2106.0 lb/);assert.match(wb.node('tot').innerHTML,/40.57 in/);
wb.run('S.maxW=2000;calcWB()');assert.match(wb.node('wbstatus').innerHTML,/PESO EXCEDIDO/);
wb.run('S.items[0].w=-1;calcWB()');assert.match(wb.node('wbstatus').textContent,/Datos inválidos/);
wb.run('S.items[0].w=340;S.cgMin=50;S.cgMax=40;calcWB()');assert.match(wb.node('wbstatus').textContent,/Datos inválidos/);
console.log('PASS: wind, navigation, midnight ETA, impossible legs, invalid input, escaping, weight and balance');
