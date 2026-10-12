// Funciones deterministas para la primera etapa de Robert Shimoda.
// Datos introducidos por el usuario; NO es un servicio de observaciones meteorológicas en vivo.
export const COVERAGE: Record<string, string> = {
  SKC: "Cielo despejado (sin nubes observadas)",
  CLR: "Sin nubes detectadas por el sensor bajo su límite de detección",
  FEW: "Pocas nubes: 1 a 2 octavos",
  SCT: "Nubes dispersas: 3 a 4 octavos",
  BKN: "Nubosidad fragmentada: 5 a 7 octavos",
  OVC: "Cielo cubierto: 8 octavos",
  VV: "Visibilidad vertical; cielo oscurecido",
};
export function interpretarNubosidad(informe: string) {
  const texto = informe.toUpperCase().trim();
  const elementos = [...texto.matchAll(/\b(FEW|SCT|BKN|OVC)(\d{3}|\/\/\/)(CB|TCU)?\b|\b(SKC|CLR|NSC|NCD|VV\d{3})\b/g)];
  return elementos.map(m => {
    const codigo = m[1] || (m[4]?.startsWith("VV") ? "VV" : m[4]);
    const altura = m[2] && m[2] !== "///" ? Number(m[2]) * 100 : null;
    const vertical = m[4]?.startsWith("VV") ? Number(m[4].slice(2)) * 100 : null;
    return { grupo: m[0], descripcion: COVERAGE[codigo] || "Sin nubes significativas detectadas o reportadas", altura_pies_agl: altura ?? vertical, techo: ["BKN","OVC","VV"].includes(codigo), nube_convectiva: m[3] || null };
  });
}
export function calcularVientoEnPista(direccionViento: number, velocidadNudos: number, rumboPista: number) {
  if (![direccionViento,velocidadNudos,rumboPista].every(Number.isFinite) || direccionViento<0 || direccionViento>360 || rumboPista<0 || rumboPista>360 || velocidadNudos<0 || velocidadNudos>300) throw new Error("Valores de viento o pista inválidos.");
  const diferencia = ((direccionViento-rumboPista+540)%360)-180;
  const rad = diferencia*Math.PI/180;
  const longitudinal = velocidadNudos*Math.cos(rad);
  const transversal = velocidadNudos*Math.sin(rad);
  const redondear = (n: number) => Math.round(Math.abs(n)*10)/10;
  return { diferencia_grados: diferencia, viento_cruzado_nudos: redondear(transversal), lado: transversal>0.00001?"derecha":transversal< -0.00001?"izquierda":"sin componente", componente_longitudinal_nudos: redondear(longitudinal), tipo_longitudinal:longitudinal>=0?"frente":"cola", advertencia:"Usar dirección de viento y rumbo de pista referidos al mismo norte (habitualmente magnético para cálculo en pista). No sustituye documentación operacional vigente." };
}
export function explicarInforme(texto: string) {
  if (texto.length>4000) throw new Error("Informe demasiado largo.");
  const capas = interpretarNubosidad(texto);
  return { tipo:/^\s*(TAF|TAF AMD|TAF COR)\b/i.test(texto)?"TAF":"METAR/SPECI o texto meteorológico", capas, nota:"Interpretación parcial: identifica grupos de nubosidad, no valida ni interpreta todos los elementos de METAR/TAF. Confirmar en fuentes oficiales actualizadas." };
}
