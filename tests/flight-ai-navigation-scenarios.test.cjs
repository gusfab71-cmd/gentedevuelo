const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');

const parser=fs.readFileSync(path.join(__dirname,'../assets/flight-pronarea-wind.js'),'utf8');
const navigation=fs.readFileSync(path.join(__dirname,'../assets/flight-essential-navigation.js'),'utf8');
const tasCalculator=fs.readFileSync(path.join(__dirname,'../assets/flight-tas-calculator.js'),'utf8');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/robert-flight-brief/index.ts'),'utf8');
const pronarea='PRONAREA FIR EZE VALIDEZ 1022 SOBRE MAPA 0600 UTC. WIND/T: '+
 'SVO-PAR-ROS-GUA FL030/17015P09 FL065/19015P01 FL100/21015M03 '+
 'PAL-MOR-ENO-PTA-AER-EZE-FDO-CPO FL030/16015P06 FL065/18015M00 FL100/18015M05 '+
 'NIN FL030/15015P06 FL065/18015P01 FCST: SAEZ 1022 CONSULTAR TAF';
const airports={SAEZ:[-34.8222,-58.5358],SAAR:[-32.9036,-60.7844],SAAP:[-31.7947,-60.4803],
 SAAV:[-31.7108,-60.8114],SADF:[-34.4545,-58.5909],SADP:[-34.61,-58.6125],
 SADM:[-34.6792,-58.6436],SABE:[-34.5589,-58.4164],SAAG:[-33.0056,-58.6128]};

function scenarios(confirmed=true){
 const elements=new Map();
 const make=props=>({value:'',hidden:true,dataset:{},checked:false,children:[],
  addEventListener(){},append(...children){this.children.push(...children);},
  replaceChildren(...children){this.children=[...children];},setAttribute(){},...props});
 const element=(id,props)=>elements.set(id,make(props));
 element('flight-pronarea',{value:pronarea});
 element('flight-pronarea-confirm',{checked:confirmed});
 element('flight-pronarea-validity',{dataset:{}});
 element('flight-time',{value:'2026-10-16T14:00'});
 element('flight-origin',{value:'SAEZ'});
 element('flight-dest',{value:'SAAP'});
 element('flight-nav-ias',{value:'99'});
 element('flight-nav-qnh',{value:''});
 element('flight-nav-cas-correction',{value:'0'});
 element('flight-essential-result',{hidden:true});
 element('flight-essential-navigation-content',{});
 element('flight-nav-wind-legs',{});
 const legs=[['4500','333'],['5500','358']].map(([alt,track])=>{
  const altitude=make({value:alt}),course=make({value:track,dataset:{estimated:'false'}});
  return make({querySelector:selector=>selector==='.flight-true-track'?course:altitude});
 });
 element('flight-legs-list',{querySelectorAll:()=>legs});
 element('flight-waypoints',{querySelectorAll:()=>[make({value:'SAAR'})]});
 const context={window:{GDV_WMM2025:{magneticVariation:()=>-9.8},
  GDV_FLIGHT_FIR_GEODATA:{airports},GDV_FLIGHT_DISTANCE:{get:index=>index===0?155:65}},
  document:{getElementById:id=>elements.get(id)||null,createElement:()=>make({}),addEventListener(){}},
  MutationObserver:class{observe(){}},queueMicrotask:fn=>fn()};
 vm.runInNewContext(parser,context);
 vm.runInNewContext(tasCalculator,context);
 vm.runInNewContext(navigation,context);
 return Array.from(context.window.GDV_FLIGHT_NAV.navigationScenarios());
}

function serverVerifier(){
 const start=edge.indexOf('function verifiedWindTokens(');
 const end=edge.indexOf('const essentialShape=',start);
 assert.ok(start>0&&end>start);
 const code=stripTypeScriptTypes(edge.slice(start,end));
 return vm.runInNewContext(code+'\nverifiedNavigationScenarios;');
}

test('5500 ft: FL065 is the closer reference; calculate two realistic wind triangles',()=>{
 const legs=scenarios();
 assert.equal(legs.length,2);
 assert.equal(legs[0].altitude_ft,4500);
 const second=legs[1];
 assert.equal(second.name,'SAAR → SAAP');
 assert.equal(second.selected_level_ft,6500);
 assert.deepEqual(Array.from(second.levels,x=>x.level_ft),[3000,6500]);
 const lower=second.levels[0],higher=second.levels[1];
 assert.equal(lower.level_gap_ft,2500);
 assert.equal(higher.level_gap_ft,1000);
 assert.equal(lower.direction_true_deg,170);
 assert.equal(higher.direction_true_deg,190);
 assert.ok(second.tas_kt>105&&second.tas_kt<112);
 assert.ok(lower.gs_kt>120&&lower.gs_kt<126);
 assert.ok(higher.gs_kt>120&&higher.gs_kt<126);
 assert.ok(lower.wca_deg>0);
 assert.ok(higher.wca_deg<0);
 assert.ok(higher.ete_min>31&&higher.ete_min<34);
});

test('server rechecks published WIND/T and independently computes levels and ETE',()=>{
 const verify=serverVerifier();
 const route='Pierna 1: SAEZ a SAAR, 4500 ft AMSL. Pierna 2: SAAR a SAAP, 5500 ft AMSL.';
 const text=verify(scenarios(),pronarea,route);
 assert.match(text,/FL030 \(3000 ft; 2500 ft de diferencia; (PAR|ROS)/);
 assert.match(text,/FL065 \(6500 ft; 1000 ft de diferencia; (PAR|ROS)/);
 assert.match(text,/FL065[^\n]+NIVEL PUBLICADO MÁS CERCANO/);
 const secondLeg=text.split('Pierna 2 SAAR → SAAP')[1];
 assert.doesNotMatch(secondLeg,/FL030[^\n]+NIVEL PUBLICADO MÁS CERCANO/);
 assert.match(text,/GS 12\d\.\d kt; ETE referencial 3\d\.\d min/);
 const falsified=scenarios();
 falsified[1].levels[1].speed_kt=100;
 const after=verify(falsified,pronarea,route);
 const secondAfter=after.split('Pierna 2 SAAR → SAAP')[1];
 assert.doesNotMatch(secondAfter,/FL065 \(6500 ft/);
 assert.match(secondAfter,/más cercano es FL065.*no fue validado/);
});

test('no confirmation means no wind scenario from unverified PRONAREA',()=>{
 const legs=scenarios(false);
 assert.equal(legs[1].levels.length,0);
 assert.match(legs[1].selected_wind_source,/confirmá|Confirmá/i);
});
