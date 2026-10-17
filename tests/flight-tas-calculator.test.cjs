const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const calculator=require('../assets/flight-tas-calculator.js');
const html=fs.readFileSync(path.join(__dirname,'../utilidades/meteorologia-aeronautica.html'),'utf8');
const wizard=fs.readFileSync(path.join(__dirname,'../assets/flight-operations-wizard.js'),'utf8');

test('at sea level, ISA temperature and ISA pressure, IAS = CAS = TAS',()=>{
 const result=calculator.calculate({iasKt:100,altitudeFt:0,oatC:15});
 assert.ok(result);
 assert.ok(Math.abs(result.tasKt-100)<0.00001);
 assert.ok(Math.abs(result.pressureAltitudeFt)<0.00001);
});

test('100 KIAS at 4500 ft pressure altitude and +10 C produces approximately 108 KTAS',()=>{
 const result=calculator.calculate({iasKt:100,altitudeFt:4500,oatC:10});
 assert.ok(result.tasKt>107.5&&result.tasKt<108.1,result.tasKt);
 assert.ok(Math.abs(result.pressureAltitudeFt-4500)<0.001);
});

test('hotter air and lower pressure increase TAS; CAS calibration shifts the result',()=>{
 const base=calculator.calculate({iasKt:100,altitudeFt:4500,oatC:10});
 const hot=calculator.calculate({iasKt:100,altitudeFt:4500,oatC:25});
 const lowerPressure=calculator.calculate({iasKt:100,altitudeFt:4500,qnhHpa:990,oatC:10});
 const corrected=calculator.calculate({iasKt:100,altitudeFt:4500,oatC:10,casCorrectionKt:3});
 assert.ok(hot.tasKt>base.tasKt);
 assert.ok(lowerPressure.tasKt>base.tasKt);
 assert.ok(corrected.tasKt>base.tasKt);
 assert.equal(corrected.casKt,103);
});

test('invalid, nonphysical or supersonic values cannot silently produce TAS',()=>{
 assert.equal(calculator.calculate({iasKt:100,altitudeFt:4500,oatC:NaN}),null);
 assert.equal(calculator.calculate({iasKt:100,altitudeFt:-100,oatC:10}),null);
 assert.equal(calculator.calculate({iasKt:100,altitudeFt:4500,qnhHpa:0,oatC:10}),null);
 assert.equal(calculator.calculate({iasKt:500,altitudeFt:45000,oatC:10}),null);
});

test('stage 4 asks for IAS and separates TAS from GS in table and printout',()=>{
 assert.match(html,/id="flight-nav-ias"/);
 assert.doesNotMatch(html,/id="flight-nav-tas"/);
 assert.match(html,/flight-tas-calculator\.js\?v=20261017a/);
 assert.match(wizard,/\['TAS kt','Velocidad verdadera calculada para esta pierna'\]/);
 assert.match(wizard,/\['GS kt','Velocidad respecto del suelo'\]/);
 assert.match(wizard,/· TAS '\+fmt\(r.tas_kt\)\+' kt · GS '\+fmt\(r.gs_kt\)/);
});
