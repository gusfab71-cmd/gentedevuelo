/* Flight Operations: cálculo local IAS → CAS → TAS.
 * Atmósfera estándar ISA, ecuación de altímetro y relación isentrópica
 * subsónica para la corrección de compresibilidad. Sin IA ni red.
 */
((root)=>{
 'use strict';
 const P0=101325,T0=288.15,L=0.0065,R=287.05287,G=9.80665,GAMMA=1.4;
 const E=G/(R*L),FT_M=0.3048,KT_MS=0.5144444444444445;
 function atmosphere(altitudeFt,qnhHpa=1013.25){
  if(!Number.isFinite(altitudeFt)||altitudeFt<0||altitudeFt>45000||
     !Number.isFinite(qnhHpa)||qnhHpa<850||qnhHpa>1100)return null;
  const h=altitudeFt*FT_M;
  const p=qnhHpa*100*Math.pow(1-L*h/T0,E);
  const pressureAltitudeM=T0/L*(1-Math.pow(p/P0,1/E));
  return {pressurePa:p,pressureAltitudeFt:pressureAltitudeM/FT_M,
   isaTemperatureC:T0-L*pressureAltitudeM-273.15};
 }
 function calculate({iasKt,altitudeFt,qnhHpa=1013.25,oatC,casCorrectionKt=0}={}){
  const atm=atmosphere(altitudeFt,qnhHpa);
  if(!atm||!Number.isFinite(iasKt)||iasKt<20||iasKt>500||
     !Number.isFinite(casCorrectionKt)||casCorrectionKt< -30||casCorrectionKt>30||
     !Number.isFinite(oatC)||oatC< -90||oatC>60)return null;
  const casKt=iasKt+casCorrectionKt,actualTempK=oatC+273.15;
  if(casKt<=0)return null;
  const a0=Math.sqrt(GAMMA*R*T0),casMs=casKt*KT_MS;
  const impactPressure=P0*(Math.pow(1+(GAMMA-1)/2*Math.pow(casMs/a0,2),GAMMA/(GAMMA-1))-1);
  const mach=Math.sqrt(2/(GAMMA-1)*(Math.pow(1+impactPressure/atm.pressurePa,(GAMMA-1)/GAMMA)-1));
  if(!Number.isFinite(mach)||mach>=1)return null;
  const tasKt=mach*Math.sqrt(GAMMA*R*actualTempK)/KT_MS;
  return {iasKt,casKt,tasKt,pressureAltitudeFt:atm.pressureAltitudeFt,
   isaTemperatureC:atm.isaTemperatureC,oatC,qnhHpa,mach};
 }
 const api=Object.freeze({atmosphere,calculate});
 root.GDV_FLIGHT_TAS=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
