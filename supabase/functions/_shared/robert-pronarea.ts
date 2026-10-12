// PRONAREA: prototipo para interpretar texto aportado por un usuario autorizado.
// No descarga pronósticos ni verifica por sí solo la vigencia operacional.
export type WindLevel = { nivel: string; direccion_grados: number; velocidad_nudos: number; temperatura_c: number | null };
export type WindArea = { zona: string; niveles: WindLevel[] };
export function analizarPronarea(texto: string) {
  if (typeof texto !== "string" || texto.length < 40 || texto.length > 20000) throw new Error("Texto PRONAREA inválido o demasiado largo.");
  const limpio=texto.replace(/\r/g,"").replace(/[ \t]+/g," ").trim();
  if(!/\bPRONAREA\b/i.test(limpio)|| !/\bWIND\/T\s*:/i.test(limpio)) throw new Error("No parece un PRONAREA completo con sección WIND/T.");
  const segmento=(start:RegExp,end:RegExp)=> {
    const desde=limpio.search(start);
    if(desde<0) return null;
    const trozo=limpio.slice(desde).replace(start,"").trim();
    const hasta=trozo.search(end);
    return (hasta<0?trozo:trozo.slice(0,hasta)).trim();
  };
  const sigfenom=segmento(/\bSIGFENOM\s*:/i,/\bWIND\/T\s*:|\bFCST\s*:/i);
  const viento=segmento(/\bWIND\/T\s*:/i,/\bFCST\s*:/i) || "";
  const fcst=segmento(/\bFCST\s*:/i,/$^/i);
  // Cada zona consiste en un identificador seguido por grupos FL; el boletín puede venir en una sola línea.
  const zonas:WindArea[]=[];
  const bloques=[...viento.matchAll(/\b([A-Z]{2,}(?:-[A-Z]{2,})*)\s+((?:FL\d{3}\/\d{3}\d{2,3}[PM]\d{2}\s*)+)/gi)];
  for (const bloque of bloques) {
    const niveles:WindLevel[]=[];
    for(const m of bloque[2].matchAll(/FL(\d{3})\/(\d{3})(\d{2,3})(M|P)(\d{2})/gi)) {
      const dir=Number(m[2]),kt=Number(m[3]);
      if(dir>360||kt>250) throw new Error("Grupo WIND/T fuera de rango; revisar texto original.");
      niveles.push({nivel:"FL"+m[1],direccion_grados:dir,velocidad_nudos:kt,temperatura_c:Number(m[5])*(m[4].toUpperCase()==="M"?-1:1)});
    }
    zonas.push({zona:bloque[1],niveles});
  }
  const gruposInterpretados=zonas.reduce((a,z)=>a+z.niveles.length,0);
  if(!gruposInterpretados) throw new Error("No se identificaron niveles WIND/T; revisar formato original.");
  const encabezado=limpio.slice(0,Math.max(0,limpio.search(/\bSIGFENOM\s*:|\bWIND\/T\s*:/i))).trim();
  const fechaEmision=encabezado.match(/\b\w{4}\d{2}\s+\w{4}\s+(\d{6})\b/)?.[1]||null;
  const validez=encabezado.match(/VALIDEZ\s+([^\n.]+)/i)?.[1]?.trim()||null;
  return { encabezado,fechaEmisionCodigo:fechaEmision,validezTexto:validez,sigfenom,zonas,fcst,gruposInterpretados,fuente:"Texto proporcionado para prueba",vigenciaVerificada:false,advertencia:"PROTOTIPO: no verifica fuente ni vigencia; no utilizar como briefing operacional." };
}
