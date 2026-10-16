const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../utilidades/meteorologia-aeronautica.html'),'utf8');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/robert-flight-brief/index.ts'),'utf8');

test('essential AI report has six agreed sections and strict evidence rules',()=>{
 for(const title of ['1. PLAN DEL VUELO','2. METEOROLOGÍA','3. RIESGOS METEOROLÓGICOS',
  '4. NAVEGACIÓN Y COMBUSTIBLE','5. INFORMACIÓN PENDIENTE','6. PRECAUCIONES Y CONCLUSIÓN']){
  assert.ok(edge.includes(title),`Missing report section: ${title}`);
 }
 assert.match(edge,/200 a 300 palabras/);
 assert.match(edge,/NO SE CALCULÓ/);
 assert.ok(edge.includes('vuelo autorizado/seguro'));
 assert.match(edge,/JAMÁS como certificación de autenticidad o seguridad/);
 assert.match(edge,/NAVEGACIÓN Y COMBUSTIBLE ESTIMADOS POR LA INTERFAZ/);
 assert.match(edge,/const navigationSummary=mode==="essential"\?asString\(input\?\.navigation_summary_text,2400\)/);
 assert.match(edge,/pronarea_valid_from_date_utc/);
 assert.match(edge,/if\(input\?\.confirm_ai_cost!==true\)/);
 assert.match(edge,/wind_legs/);
});

test('departure window date and deterministic navigation/fuel summary are sent without AI calculations',()=>{
 const start=html.indexOf(' function pronareaStartDateUtc(){');
 const end=html.indexOf(' function preparePayload(',start);
 assert.ok(start>0&&end>start);
 const nodes={
  'flight-pronarea':{value:'PRONAREA FIR EZE VALIDEZ 2206'},
  'flight-nav-tas':{value:'100'},
  'flight-fuel-details':{textContent:'Partida prevista: 2026-10-16 02:00 UTC\nETA destino: 2026-10-16 03:30 UTC\nRemanente para alternativo (sin calcular consumo): 16.8 L'}
 };
 let called=false;
 const fn=vm.runInNewContext(html.slice(start,end)+'\n({pronareaStartDateUtc,essentialNavigationSummary});',{
  $:id=>nodes[id],iso:()=> '2026-10-16T02:00:00.000Z',
  window:{GDV_PRONAREA_WIND:{resolveWindow:(digits,departure)=>{
    called=digits==='2206'&&departure.toISOString()==='2026-10-16T02:00:00.000Z';
    return {start:Date.parse('2026-10-15T22:00:00.000Z')};
  }},GDV_FLIGHT_NAV:{snapshot:()=>[{
    name:'SAEZ → SAAR',distance_nm:158,gs_kt:102,wind_true_from_deg:270,wind_speed_kt:12
  }]}}
 });
 assert.equal(fn.pronareaStartDateUtc(),'2026-10-15');
 assert.equal(called,true);
 const report=fn.essentialNavigationSummary();
 assert.match(report,/TAS declarada: 100 kt/);
 assert.match(report,/GS 102 kt/);
 assert.match(report,/tiempo 92\.9 min/);
 assert.match(report,/Remanente para alternativo \(sin calcular consumo\)/);
 assert.match(html,/navigation_summary_text:essentialNavigationSummary\(\)/);
 assert.match(html,/pronarea_valid_from_date_utc:pronareaStartDateUtc\(\)/);
 assert.match(html,/flight-ai-severity/);
});
