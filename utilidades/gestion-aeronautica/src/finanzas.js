// Motor contable de demostración para AeroSuite.
// Sin impuestos automáticos, conciliación bancaria ni registros fiscales oficiales.
export const FINANCE_AREAS=Object.freeze({escuela:'Escuela de vuelo',aerodromo:'Aeródromo',compartido:'Gasto / ingreso compartido',institucional:'Fondos institucionales'});
export const FINANCE_ACCOUNTS=Object.freeze({caja_general:'Caja general',banco:'Banco',caja_chica:'Caja chica'});
export const FINANCE_KINDS=Object.freeze({ingreso:'Ingreso',egreso:'Egreso',transferencia:'Transferencia interna',apertura:'Saldo inicial'});
export const FINANCE_CATEGORIES=Object.freeze({
 ingreso:['Horas de vuelo e instrucción','Cuotas de alumnos','Alquiler de aeronaves','Hangaraje','Servicios de aeródromo','Otros ingresos'],
 egreso:['Agua','Electricidad','Gas','Corte de pasto y espacios verdes','Mantenimiento general','Reparaciones e instalaciones','Impuestos y tasas','Seguros','Sueldos y honorarios','Limpieza e higiene','Combustible y lubricantes','Materiales y repuestos','Alquileres','Comunicaciones e internet','Servicios profesionales','Papelería e insumos','Imprevistos y caja chica','Otros egresos']
});
export function cents(value){
 const str=String(value??'').trim().replace(',','.');
 if(!/^(?:\d{1,10})(?:\.\d{1,2})?$/.test(str))throw Error('Ingresá un importe válido en pesos, con hasta dos decimales.');
 const [whole,fraction='']=str.split('.');
 const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n<1)throw Error('El importe debe ser mayor a cero.');
 return n;
}
const own=(map,key)=>Object.prototype.hasOwnProperty.call(map,key);
const validDay=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const dt=new Date(value+'T12:00:00Z');
 return !Number.isNaN(dt.getTime())&&dt.toISOString().slice(0,10)===value;
};
export function financeBalances(entries){
 const result={caja_general:0,banco:0,caja_chica:0};
 for(const entry of entries){
  const n=entry.cents;
  if(!Number.isSafeInteger(n)||n<1||!own(result,entry.account))throw Error('Movimiento financiero de prueba inválido.');
  if(entry.kind==='ingreso'||entry.kind==='apertura')result[entry.account]+=n;
  else if(entry.kind==='egreso')result[entry.account]-=n;
  else if(entry.kind==='transferencia'){
   if(!own(result,entry.destination)||entry.destination===entry.account)throw Error('Transferencia interna inválida.');
   result[entry.account]-=n;result[entry.destination]+=n;
  }else throw Error('Tipo de movimiento desconocido.');
 }
 return result;
}
export function makeFinanceEntry(data,entries=[]){
 const kind=String(data.kind||''),account=String(data.account||''),destination=String(data.destination||'');
 const date=String(data.date||''),area=String(data.area||'');
 const category=String(data.category||'').trim(),concept=String(data.concept||'').trim();
 const reference=String(data.reference||'').trim(),notes=String(data.notes||'').trim();
 if(!own(FINANCE_KINDS,kind))throw Error('Seleccioná un tipo de movimiento válido.');
 if(!own(FINANCE_ACCOUNTS,account))throw Error('Elegí una cuenta de fondos válida.');
 if(!validDay(date))throw Error('Ingresá una fecha válida.');
 if(concept.length<3||concept.length>150)throw Error('Describí el concepto (entre 3 y 150 caracteres).');
 if(reference.length>100||notes.length>500)throw Error('Revisá la extensión del comprobante u observaciones.');
 if(kind==='ingreso'||kind==='egreso'){
  if(!own(FINANCE_AREAS,area)||area==='institucional')throw Error('Indicá si corresponde a escuela, aeródromo o compartido.');
  if(!FINANCE_CATEGORIES[kind].includes(category))throw Error('Seleccioná una categoría del movimiento.');
 }else if(kind==='transferencia'){
  if(!own(FINANCE_ACCOUNTS,destination)||destination===account)throw Error('Seleccioná una cuenta de destino diferente de la de origen.');
 }
 const amount=cents(data.amount);
 const balances=financeBalances(entries);
 if((kind==='egreso'||kind==='transferencia')&&balances[account]<amount)
  throw Error('Fondos insuficientes en '+FINANCE_ACCOUNTS[account]+'. Registrá antes el saldo inicial o un ingreso.');
 return {kind,account,destination:kind==='transferencia'?destination:'',date,area:kind==='ingreso'||kind==='egreso'?area:'institucional',category:kind==='ingreso'||kind==='egreso'?category:kind==='apertura'?'Saldo inicial':'Traspaso interno',concept,reference,notes,cents:amount};
}
export function financeReport(entries,{period='todos',area='todos'}={}){
 const periodOk=period==='todos'||/^\d{4}-\d{2}$/.test(period);
 if(!periodOk||!(area==='todos'||own(FINANCE_AREAS,area)))throw Error('Filtro financiero inválido.');
 const rows=entries.filter(row=>(period==='todos'||row.date.slice(0,7)===period)&&(area==='todos'||row.area===area));
 let income=0,expenses=0,opening=0;const byArea={escuela:{income:0,expenses:0},aerodromo:{income:0,expenses:0},compartido:{income:0,expenses:0}};
 const expenseCategories={};
 for(const row of rows){
  if(row.kind==='ingreso'){income+=row.cents;if(byArea[row.area])byArea[row.area].income+=row.cents}
  if(row.kind==='egreso'){expenses+=row.cents;if(byArea[row.area])byArea[row.area].expenses+=row.cents;expenseCategories[row.category]=(expenseCategories[row.category]||0)+row.cents}
  if(row.kind==='apertura')opening+=row.cents;
 }
 return {rows,income,expenses,net:income-expenses,opening,byArea,expenseCategories,balances:financeBalances(entries)};
}
