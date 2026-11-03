const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const audit=require('../simulador-ppa/auditoria.js');
const html=fs.readFileSync(path.join(__dirname,'../simulador-ppa/index.html'),'utf8');
const mod=html.match(/<script type="module">([\s\S]*?)<\/script>/);
assert.ok(mod,'La interfaz debe incluir módulo principal');
new vm.Script(mod[1],{filename:'simulador-ppa/index.html'});

// Orden numérico, sin orden aleatorio ni límite a diez elementos.
const make=(n,extras={})=>({id:'ANAC-PPA-'+String(n).padStart(3,'0'),materia:'General',
 pregunta:'Pregunta '+n,opciones:['Primera','Segunda','Tercera'],correcta:1,
 fuente:'ANAC histórica',estado:'pendiente_revision',fundamento:'',...extras});
const questions=[make(10),make(1),make(3),make(2),make(5,{correcta:null}),make(7,{opciones:[]})];
const ordered=audit.sortByNumber(questions);
assert.deepEqual(ordered.map(audit.numericId),[1,2,3,5,7,10]);
assert.equal(ordered.length,questions.length);
const summary=audit.auditBank(questions);
assert.equal(summary.total,6);
assert.deepEqual(summary.missing,[4,6,8,9]);
assert.equal(summary.noKey,2);
assert.equal(summary.incomplete,1);
assert.equal(summary.noReason,6);
assert.equal(summary.unverified,6);
assert.equal(audit.hasKey(make(1)),true);
assert.equal(audit.hasKey(make(1,{correcta:4})),false);
assert.equal(audit.hasKey(make(1,{correcta:null})),false);
assert.equal(audit.hasKey(make(1,{opciones:[null,''] })),false);

// Número y respuestas históricas no significan verificación documental.
assert.equal(audit.auditBank([make(1),make(2,{estado:'verificada'})]).verified,1);
const csv=audit.exportCsv(questions,{
 'ANAC-PPA-001':{selected:1,attempted:true,graded:true,correct:true},
 'ANAC-PPA-003':{selected:0,attempted:true,graded:true,correct:false},
 'ANAC-PPA-005':{selected:1,attempted:true,graded:false,correct:false}
},{'ANAC-PPA-002':'Fundamento no coincide con la fuente','ANAC-PPA-010':'=SUM(1+1)'});
assert.match(csv,/Clave histórica registrada/);
assert.match(csv,/Correcto según clave/);
assert.match(csv,/Incorrecto según clave/);
assert.match(csv,/Sin calificar/);
assert.match(csv,/Fundamento no coincide/);
assert.ok(!csv.includes(';"=SUM(1+1)"'),'El CSV no ejecuta fórmulas desde observaciones');
assert.match(csv,/'=SUM\(1\+1\)/);

// Academia institucional: permiso de alumno comprobado en servidor y sesión aislada.
const guard=fs.readFileSync(path.join(__dirname,'../assets/auth-guard.js'),'utf8');
const sessionSource=fs.readFileSync(path.join(__dirname,'../simulador-ppa/sesion-institucional.js'),'utf8');
new vm.Script(sessionSource,{filename:'simulador-ppa/sesion-institucional.js'});
function sessionFor(query){
 let selected;
 const client={auth:{getUser:()=>Promise.resolve({data:{user:{id:'test'}},error:null})}};
 const context={
  location:{search:query},
  URLSearchParams,
  GDV_CONFIG:{url:'https://example.supabase.co',key:'public'},
  supabase:{createClient:(_url,_key,options)=>{selected=options?.auth?.storageKey||'community';return client}},
  window:{}
 };
 vm.runInNewContext(sessionSource,context);
 assert.equal(context.window.GDV_AUTH.client,client);
 return selected;
}
const testInstitution='dbbe4bc4-2016-404a-a0a8-241ba7d15e4e';
assert.equal(sessionFor('?institucion='+testInstitution+'&rol=alumno&prueba=1'),'aerosuite-laboratorio-alumno-v1-auth');
assert.equal(sessionFor('?institucion='+testInstitution+'&rol=alumno'),'aerosuite-institucional-v2-auth');
assert.equal(sessionFor('?institucion='+testInstitution+'&rol=piloto&prueba=1'),'community');
assert.equal(sessionFor('?institucion=malformada&rol=alumno&prueba=1'),'community');
const operations=fs.readFileSync(path.join(__dirname,'../utilidades/gestion-aeronautica/operaciones-institucionales.html'),'utf8');
assert.match(guard,/onInstitutionalPpa/);
assert.match(html,/sesion-institucional\.js\?v=ppa-session-isolated-20261103/);
assert.match(operations,/ppaUrl\.searchParams\.set\("v","ppa-session-isolated-20261103"\)/);
assert.match(html,/stage='validar el rol Alumno en la institución'/);
assert.match(guard,/aerosuite-institucional-v2-auth/);
assert.match(guard,/aerosuite-laboratorio-/);
assert.match(operations,/id="ppaSimulatorCard" hidden/);
assert.match(operations,/if\(role==="alumno"\)/);
assert.match(operations,/ppaUrl\.searchParams\.set\("institucion",inst\)/);
assert.match(operations,/ppaUrl\.searchParams\.set\("rol","alumno"\)/);
assert.match(html,/ppaStudentMode/);
assert.match(html,/aerosuite_my_institution_access_v2/);
assert.match(html,/x\.my_role==='alumno'&&x\.can_access===true/);
assert.match(html,/filtered\.length<desired/);
assert.match(html,/gradedCount===exam\.length&&exam\.length>0/);
assert.match(html,/No equivale a un examen oficial|no equivale a un examen oficial/);

// Diseño inspirado en Flight Operations, sin cambiar la lógica de examen.
const uiCss=fs.readFileSync(path.join(__dirname,'../simulador-ppa/estilo-flight-operations.css'),'utf8');
assert.match(html,/<title>Simulador Examen PPA<\/title>/);
assert.match(html,/<h1>Simulador Examen PPA<\/h1>/);
assert.match(html,/estilo-flight-operations\.css/);
assert.match(html,/id="ppaProgressTrack"/);
assert.match(html,/function updateProgressVisual\(\)/);
assert.match(html,/class="ppa-config-grid"/);
assert.match(uiCss,/\.ppa-config-grid/);
assert.match(uiCss,/\.ppa-hero/);
assert.match(uiCss,/@media\(max-width:540px\)/);
for(const id of ['practice','subject','mode','count','start','exam','question','options','submit','feedback','next','results']){
 assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,'Elemento único: '+id);
}

// La interfaz debe incluir las dos rutas sin afectar la práctica aleatoria.
assert.match(html,/<option value="sequential">/);
assert.match(html,/<option value="practice">/);
assert.match(html,/<option>10<\/option>/);
assert.match(html,/exam=AUDIT\.sortByNumber\(reviewBank\)/);
assert.match(html,/const activeBank=reviewMode\?reviewBank:practiceMode\?historicalBank:bank/);
assert.match(html,/if\(sequentialMode\)saveSequential\(\)/);
assert.match(html,/function resumeSequential\(\)/);
assert.match(html,/function exportAuditCsv\(\)/);
assert.match(html,/class="panel hidden" id="audit-summary"/);
assert.match(html,/currentAdminId=user\.id/);
assert.match(html,/site_admins/);

console.log('PASS PPA: orden correlativo, cobertura, claves, puntaje, reporte CSV y acceso admin');
