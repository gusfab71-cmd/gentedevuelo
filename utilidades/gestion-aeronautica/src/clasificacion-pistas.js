/* Gente de Vuelo / AeroSuite: clasificación documental y operativa.
 * Las categorías de fuente no implican habilitación vigente ni uso autorizado.
 * La identidad de un usuario o una etiqueta OSM no acreditan condición ANAC.
 */
(function(root){
 'use strict';
 const CATEGORIES=Object.freeze({
  controlled_public:Object.freeze({label:'Aeródromo público controlado',color:'#286ba8',short:'Público · TWR'}),
  uncontrolled_public:Object.freeze({label:'Aeródromo público no controlado',color:'#258a91',short:'Público · Sin TWR'}),
  private_aerodrome:Object.freeze({label:'Aeródromo privado',color:'#8367b5',short:'Privado · Autorizar acceso'}),
  lad:Object.freeze({label:'Lugar Apto Denunciado (LAD)',color:'#b58b37',short:'LAD · No es aeródromo'}),
  heliport:Object.freeze({label:'Helipuerto o helipunto',color:'#427f8d',short:'Helicópteros'}),
  unverified:Object.freeze({label:'No verificada · Solo referencia',color:'#b7433b',short:'Sin verificación'})
 });
 const OPS={vfr:'VFR declarado',ifr:'IFR documentado',both:'VFR/IFR documentado',unknown:'No verificado'};
 const ATS={twr:'Control de aeródromo (TWR)',afis:'Servicio AFIS (información, no control)',
  air_radio:'Radio/información (no equivale a TWR)',none:'Sin servicio ATS informado',unknown:'No verificado'};
 const ACCESS={public:'Uso público sujeto a condiciones',prior_permission:'Requiere autorización previa',
  restricted:'Acceso restringido',unknown:'No confirmado'};
 const LEGAL={public:'Público',private:'Privado',lad:'LAD',unknown:'No verificado'};
 const KNOWN=new Set(Object.keys(CATEGORIES));
 function classification(x){
  if(!x||typeof x!=='object')return 'unverified';
  const candidate=String(x.facility_class||x.facilityClass||'').trim();
  // El catálogo oficial embebido es editorial; una fila pública de Supabase
  // requiere además evidencias documentales del lado servidor.
  if(x.category==='lad'&&x.sourceType==='registro_lad')return 'lad';
  if(x.category==='official'&&x.sourceType==='publicacion_aip')
   return candidate==='controlled_public'||candidate==='uncontrolled_public'||
    candidate==='private_aerodrome'||candidate==='heliport'?candidate:'unverified';
  if(!KNOWN.has(candidate)||candidate==='unverified')return 'unverified';
  const url=String(x.verified_source_url||''),date=x.verified_source_date;
  return url.startsWith('https://')&&!!date?candidate:'unverified';
 }
 function warning(kind){
  switch(kind){
   case 'controlled_public':case 'uncontrolled_public':
    return 'Categoría documental orientativa. Confirmá control ATS, horarios, AIP/MADHEL, NOTAM, reglas autorizadas y condiciones actuales antes de operar.';
   case 'private_aerodrome':return 'Aeródromo privado: se requiere autorización del responsable. Verificá habilitación, NOTAM y condiciones reales.';
   case 'lad':return 'LAD: no es aeródromo habilitado. Consultá las restricciones reglamentarias y la autorización del propietario; no infieras aptitud operacional.';
   case 'heliport':return 'Solo infraestructura destinada a alas rotativas según su habilitación. Verificá accesibilidad, configuración, horarios y restricciones vigentes.';
   default:return 'PELIGRO · Ubicación no verificada. Solo referencia geográfica para análisis de contingencias; NO es un lugar de aterrizaje recomendado ni comprobado.';
  }
 }
 root.GDV_AIRFIELD_TYPES=Object.freeze({CATEGORIES,ATS,OPS,ACCESS,LEGAL,classification,warning});
})(window);
