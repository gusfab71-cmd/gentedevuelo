const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../utilidades/rodaje-viento.html'), 'utf8');
const nodes = new Map();
const canvas = new Proxy({}, {get: () => () => {}});
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {width:640,height:640,textContent:'',classList:{toggle(){}},setAttribute(){},click(){this.onclick?.()},getContext:()=>canvas});
  return nodes.get(id);
}
const context = vm.createContext({document:{getElementById:node,addEventListener(){}},addEventListener(){},requestAnimationFrame(){}});
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1], context);
const run = code => vm.runInContext(code, context);
for (const gear of ['T','C']) {
  run(`st.gear='${gear}';st.spd=15;st.hdg=360`);
  for (const [wind,ail,el] of [[45,1,gear==='T'?0:1],[90,1,0],[100,-1,-1],[135,-1,-1],[180,0,-1],[225,1,-1],[270,-1,0],[315,-1,gear==='T'?0:1]]) {
    const r=run(`st.wind=${wind};ui()`);
    assert.equal(Math.abs(r.ail)<1e-10?0:Math.sign(r.ail),ail);
    assert.equal(Math.abs(r.el)<1e-10?0:Math.sign(r.el),el);
    if(wind===100)assert.match(node('tips').innerHTML,/izquierda.*alejado/);
  }
}
run('st.spd=0;ui()');assert.equal(run('calc().ail'),0);assert.equal(run('calc().el'),0);
run('st.hdg=15.25;lastKey="";ui2()');assert.equal(run('st.hdg'),15.25,'Rendering must not discard fractional heading');
run("st.roll=true;st.x=123;st.y=456;$('rw').onclick()");assert.equal(run('st.roll'),false);assert.equal(run('st.hdg'),360);assert.equal(run('st.x+st.y'),0);
assert.match(html,/auth-guard\.js/);
console.log('PASS: both landing gears, wind quadrants, 100-degree regression, calm, fractional heading, reset, auth integration');
