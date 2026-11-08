/* Consulta puntual orientativa del relieve. Fuente: OpenTopoData/SRTM 30 m.
 * No es una consulta de elevaciones IGN; NO es servicio para despecho aeronáutico.
 * Solo se permite un dataset y coordenadas de Argentina continental.
 */
'use strict';
const SOURCE='https://api.opentopodata.org/v1/srtm30m';
const LIMIT=60;
module.exports=async function terrainElevation(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','private, max-age=300');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({error:'Método no permitido'});
 }
 const raw=req.query?.locations;
 if(typeof raw!=='string'||raw.length>3500)return res.status(400).json({error:'Coordenadas no válidas'});
 const locations=raw.split('|');
 if(!locations.length||locations.length>LIMIT)return res.status(400).json({error:'Máximo 60 puntos por consulta'});
 const cleaned=[];
 for(const location of locations){
  const match=/^(-?\d{1,2}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/.exec(location.trim());
  if(!match)return res.status(400).json({error:'Coordenadas no válidas'});
  const lat=Number(match[1]),lng=Number(match[2]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -56.5||lat> -21.5||lng< -74.5||lng> -52.5)
   return res.status(400).json({error:'Punto fuera del área habilitada para Argentina continental'});
  cleaned.push(lat.toFixed(6)+','+lng.toFixed(6));
 }
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetch(SOURCE+'?locations='+encodeURIComponent(cleaned.join('|'))+'&interpolation=bilinear',
    {signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return res.status(503).json({error:'La fuente de elevaciones no está disponible ('+response.status+'). Intentá más tarde.'});
  const data=await response.json();
  if(data?.status!=='OK'||!Array.isArray(data.results)||data.results.length!==cleaned.length)
   return res.status(503).json({error:'La fuente devolvió una respuesta incompleta'});
  const points=data.results.map((entry,index)=>({
   lat:Number(cleaned[index].split(',')[0]),
   lng:Number(cleaned[index].split(',')[1]),
   elevation_m:typeof entry?.elevation==='number'&&Number.isFinite(entry.elevation)?entry.elevation:null
  }));
  return res.status(200).json({source:'SRTM 30 m (NASA/USGS mediante OpenTopoData)',datum_note:'La referencia vertical puede diferir del MDE-Ar IGN; verificar datos oficiales.',points});
 }catch(_error){
  return res.status(503).json({error:'No fue posible consultar las elevaciones'});
 }finally{clearTimeout(timer)}
};