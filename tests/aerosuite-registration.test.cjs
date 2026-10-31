"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../assets/aerosuite-registration.js"),"utf8");
const listeners=new Map();
const window={};
const document={addEventListener(type,fn){listeners.set(type,fn);}};
vm.runInNewContext(source,{window,document,String,Object,RegExp},{filename:"aerosuite-registration.js"});
const {normalize,isValid,formatField}=window.AeroSuiteRegistration;
const examples=[
 ["lvert","LV-ERT",true],
 ["lv ert","LV-ERT",true],
 ["Lv–ErT","LV-ERT",true],
 ["LV-ERT","LV-ERT",true],
 ["LQ123","LQ-123",true],
 ["lq 123","LQ-123",true],
 ["cc-abcd","CC-ABCD",true],
 ["N12345","N12345",true], // External registration remains intact.
 ["G-ABCD","G-ABCD",true],
 ["lv","LV-",false],
 ["LV-E","LV-E",false],
 ["LV-","LV-",false],
 ["LV--ERT","LV--ERT",false],
 ["", "",false]
];
for(const [input,formatted,valid] of examples){
 assert.equal(normalize(input),formatted,"Conversion de "+input);
 assert.equal(isValid(input),valid,"Validacion de "+input);
 assert.equal(normalize(formatted),formatted,"Idempotencia de "+input);
}
function field(value,cursor=value.length){
 const input={value,type:"text",selectionStart:cursor,
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},
  matches(selector){return selector.includes("data-aerosuite-registration");}};
 return input;
}
const first=field("lv");
listeners.get("input")({target:first});
assert.equal(first.value,"LV-");
assert.equal(first.selectionStart,3,"Guion inmediatamente después del prefijo LV");
const second=field("lvert");
listeners.get("input")({target:second});
assert.equal(second.value,"LV-ERT");
assert.equal(second.selectionStart,6);
const foreign=field("n12345");
formatField(foreign);
assert.equal(foreign.value,"N12345");
const demo=fs.readFileSync(path.join(__dirname,"../utilidades/gestor-reservas/index.html"),"utf8");
const ops=fs.readFileSync(path.join(__dirname,"../utilidades/gestion-aeronautica/operaciones-institucionales.html"),"utf8");
const fleet=fs.readFileSync(path.join(__dirname,"../utilidades/gestion-aeronautica/flota-institucional.html"),"utf8");
const maintenance=fs.readFileSync(path.join(__dirname,"../utilidades/gestion-aeronautica/mantenimiento-institucional.html"),"utf8");
const portal=fs.readFileSync(path.join(__dirname,"../utilidades/gestion-aeronautica/portal.html"),"utf8");
for(const [name,html] of Object.entries({ops,fleet,maintenance,portal,demo}))
 assert.match(html,/aerosuite-registration\.js/,name+" debe cargar helper compartido");
assert.match(ops,/AeroSuiteRegistration\.normalize\(logbook\.aircraft_registration\)/);
assert.match(ops,/AeroSuiteRegistration\.isValid/);
assert.match(fleet,/p_registration:registration/);
assert.match(maintenance,/function reconcileFleet/);
console.log("OK: 14 casos de matrícula, mayúsculas, guion, validación y conexiones de portales.");
