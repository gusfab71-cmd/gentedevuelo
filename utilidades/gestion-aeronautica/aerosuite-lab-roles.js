/**
 * Verificación estricta de cobertura del laboratorio SQL gratuito.
 * Consta de seis roles, más otro alumno y una institución ajena.
 * Evalúa los resultados de RLS: NO convierte estas simulaciones en E2E productivos.
 */
export const REQUIRED_RLS_CASES=Object.freeze([
 'RLS reservas: Director',
 'RLS reservas: Secretaría',
 'RLS reservas: Instructor',
 'RLS reservas: Alumno A',
 'RLS reservas: Alumno B',
 'RLS reservas: Piloto PPA',
 'RLS reservas: Piloto PCA',
 'RLS reservas: Usuario de otra institución',
 'RLS ficha propia: Director',
 'RLS ficha propia: Secretaría',
 'RLS ficha propia: Instructor',
 'RLS ficha propia: Alumno A',
 'RLS ficha propia: Alumno B',
 'RLS ficha propia: Piloto PPA',
 'RLS ficha propia: Piloto PCA',
 'RLS ficha propia: Usuario de otra institución',
 'API: alumno/instructor sin permiso INSERT en reservas',
 'API: alumno/instructor sin permiso UPDATE en reservas',
 'API: alumno/instructor sin permiso DELETE en reservas',
 'API anónima: esquema privado no accesible',
 'API: prohibida ejecución del motor de auditoría',
 'API: prohibida ejecución del lector de identidades simuladas'
]);
export function verifyRlsCases(result){
 if(!result || result.status!=='PASS_SIMULATION' || result.stale ||
    result.failed!==0 || result.checked<35 || result.passed!==result.checked ||
    !Array.isArray(result.cases) || result.cases.length!==result.checked)
   throw Error('El laboratorio SQL está incompleto, desactualizado o registra fallos.');
 const found=new Map();
 for(const item of result.cases){
   if(!item || typeof item.name!=='string' || typeof item.pass!=='boolean')
     throw Error('Resultado de prueba RLS inválido.');
   found.set(item.name,(found.get(item.name)||[]).concat([item]));
 }
 for(const name of REQUIRED_RLS_CASES){
   const cases=found.get(name)||[];
   if(cases.length!==1 || cases[0].pass!==true)
     throw Error('Control de RLS ausente, duplicado o fallido: '+name);
 }
 return {verified:REQUIRED_RLS_CASES.length,
  checked:result.checked,profileCount:6,
  scope:'RLS real sobre datos ficticios; no son pruebas autenticadas de los portales'};
}
