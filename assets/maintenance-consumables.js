// Movimientos privados y auxiliares; no constituyen constancias de mantenimiento ni un sistema de despacho.
// Las existencias surgen de movimientos, nunca de un contador editable que borre el historial.
const CONSUMABLE_CATS={fuel:'Combustible',oil:'Aceite',filter:'Filtros',spark:'Bujías',part:'Repuestos',other:'Otros'};
const CONSUMABLE_UNITS={L:'litros',u:'unidades',kg:'kg'};
const STOCK_KINDS={in:'Ingreso / reposición',out:'Salida / uso'};
const parsedQuantity=(id,allowZero=false,max=1000000)=>{
 const raw=String(v(id)||'').trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,3})?$/.test(raw))return null;
 const x=Number(raw);
 return Number.isFinite(x)&&x<=max&&(allowZero?x>=0:x>0)?x:null;
};
const blankQuantity=(id,max=1000000)=>{
 if(!String(v(id)||'').trim())return 0;
 return parsedQuantity(id,true,max);
};
const dateIsValid=date=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const [y,m,d]=date.split('-').map(Number);
 const x=new Date(Date.UTC(y,m-1,d));
 return Number.isFinite(x.getTime())&&x.toISOString().slice(0,10)===date&&date<=today();
};
const balanceOf=item=>Math.round((S.mv||[]).filter(m=>m.item===item.id&&m.ac===item.ac&&!m.voided)
 .reduce((sum,m)=>sum+(m.kind==='in'?Number(m.qty):-Number(m.qty)),0)*1000)/1000;
const productAmount=(quantity,unit)=>Number(quantity).toLocaleString('es-AR',{maximumFractionDigits:3})+' '+unit;
const consumableMoney=(quantity,price,currency)=>{
 const x=Number(price);
 return x>0?Number(quantity*x).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(currency==='USD'?'USD':'ARS'):'—';
};
function openConsumables(form){
 consumableForm=consumableForm===form?'':form;
 R();
}
function addConsumableItem(){
 if(!A())return;
 const name=recordValue('u_name',140),category=v('u_cat'),unit=v('u_unit'),minimum=parsedQuantity('u_min',true);
 if(!name||!CONSUMABLE_CATS[category]||!CONSUMABLE_UNITS[unit]||minimum===null)
  return alert('Completá producto, categoría, unidad y stock mínimo válido.');
 if(category==='fuel'&&unit!=='L')return alert('El combustible destinado a vincularse con una carga debe expresarse en litros.');
 if(S.inv.some(i=>i.ac===S.sel&&i.name.toLowerCase()===name.toLowerCase()&&i.unit===unit))
  return alert('Ya existe un producto con el mismo nombre y unidad para esta aeronave.');
 S.inv.push({id:uid(),ac:S.sel,name,category,unit,minimum,added:today()});
 consumableForm='';save();R();
}
function addConsumableMovement(){
 if(!A())return;
 const item=S.inv.find(i=>i.id===v('u_item')&&i.ac===S.sel);
 const kind=v('u_kind'),date=v('u_date'),qty=parsedQuantity('u_qty'),unitCost=blankQuantity('u_price',1000000000),currency=v('u_currency');
 if(!item||!STOCK_KINDS[kind]||!dateIsValid(date)||qty===null||unitCost===null||!['ARS','USD'].includes(currency))
  return alert('Completá producto, movimiento, fecha y cantidad con valores válidos.');
 if(item.unit==='u'&&!Number.isInteger(qty))return alert('Los elementos contados en unidades requieren cantidades enteras.');
 if(kind==='out'&&qty>balanceOf(item)+0.00001)return alert('Stock insuficiente. Registrá primero el ingreso o corregí el movimiento.');
 const reason=recordValue('u_reason',250);
 if(kind==='out'&&!reason)return alert('Indicá el destino o motivo de la salida del producto.');
 S.mv.push({id:uid(),ac:S.sel,item:item.id,kind,date,qty,unitCost, currency,
  supplier:recordValue('u_supplier',150),reference:recordValue('u_ref',200),
  reason,created:new Date().toISOString(),source:'manual'});
 consumableForm='';save();R();
}
function addFuelRecord(){
 if(!A())return;
 const date=v('fu_date'),loaded=blankQuantity('fu_loaded'),used=blankQuantity('fu_used'),
  price=blankQuantity('fu_price',1000000000),currency=v('fu_currency'),flightId=v('fu_flight'),stockId=v('fu_stock');
 if(!dateIsValid(date)||loaded===null||used===null||!Number.isFinite(price)||price===null||
    (loaded+used<=0)||!['ARS','USD'].includes(currency))
  return alert('Indicá una fecha válida y los litros cargados y/o consumidos con valores numéricos.');
 if(price>0&&!loaded)return alert('El precio por litro requiere una cantidad cargada mayor que cero.');
 if(flightId&&!S.lg.some(l=>l.id===flightId&&l.ac===S.sel&&l.kind==='f'))
  return alert('El vuelo seleccionado ya no pertenece a esta aeronave.');
 let item=null;
 if(stockId){
  item=S.inv.find(i=>i.id===stockId&&i.ac===S.sel&&i.category==='fuel'&&i.unit==='L');
  if(!item||!loaded)return alert('Para retirar combustible del stock seleccioná un producto en litros e indicá la carga.');
  if(loaded>balanceOf(item)+0.00001)return alert('No hay combustible suficiente en stock para esta carga.');
 }
 const fuel={id:uid(),ac:S.sel,date,flightId,loaded,used,price,currency,stockId,
  supplier:recordValue('fu_supplier',150),reference:recordValue('fu_ref',200),
  note:recordValue('fu_note',350),created:new Date().toISOString()};
 S.fuel.push(fuel);
 if(item)S.mv.push({id:uid(),ac:S.sel,item:item.id,kind:'out',date,qty:loaded,unitCost:0,currency,
  supplier:'',reference:fuel.reference,reason:'Carga de combustible registrada en Consumibles',
  source:'fuel',fuelId:fuel.id,created:new Date().toISOString()});
 consumableForm='';save();R();
}
function annulFuelRecord(id){
 const item=S.fuel.find(x=>x.id===id&&x.ac===S.sel&&!x.voided);
 if(!item)return;
 const reason=prompt('Motivo de la anulación (el historial se conserva):');
 if(reason===null)return;
 if(!reason.trim())return alert('Ingresá el motivo de la corrección.');
 if(!confirm('¿Anular este registro? Se conservará como anulado y se revertirá la salida de stock asociada.'))return;
 item.voided=true;item.voidReason=reason.trim().slice(0,250);item.voidedAt=new Date().toISOString();
 for(const m of S.mv)if(m.source==='fuel'&&m.fuelId===id)m.voided=true;
 save();R();
}
function annulStockMovement(id){
 const m=S.mv.find(x=>x.id===id&&x.ac===S.sel&&!x.voided);
 if(!m)return;
 if(m.source==='fuel')return alert('Anulá la carga vinculada desde el historial de combustible.');
 const item=S.inv.find(x=>x.id===m.item&&x.ac===S.sel);
 if(!item)return;
 if(m.kind==='in'&&balanceOf(item)-m.qty < -0.00001)
  return alert('No se puede anular el ingreso: ya se utilizó parte de ese stock. Regularizá primero con movimientos auditables.');
 const reason=prompt('Motivo de la anulación del movimiento (obligatorio):');
 if(reason===null)return;
 if(!reason.trim())return alert('Indicá un motivo de corrección.');
 if(!confirm('¿Anular este movimiento conservando su registro en el historial?'))return;
 m.voided=true;m.voidReason=reason.trim().slice(0,250);m.voidedAt=new Date().toISOString();
 save();R();
}
function tabU(){
 const a=A(),items=(S.inv||[]).filter(i=>i.ac===a.id);
 const movements=(S.mv||[]).filter(m=>m.ac===a.id).slice().sort((x,y)=>String(y.date).localeCompare(String(x.date))||String(y.created).localeCompare(String(x.created)));
 const fuels=(S.fuel||[]).filter(f=>f.ac===a.id).slice().sort((x,y)=>String(y.date).localeCompare(String(x.date)));
 const activeFuels=fuels.filter(f=>!f.voided),loaded=activeFuels.reduce((t,f)=>t+f.loaded,0),burned=activeFuels.reduce((t,f)=>t+f.used,0);
 const low=items.filter(i=>i.minimum>0&&balanceOf(i)<i.minimum);
 const categoryOptions=Object.entries(CONSUMABLE_CATS).map(([k,label])=>'<option value="'+k+'">'+label+'</option>').join('');
 const unitOptions=Object.entries(CONSUMABLE_UNITS).map(([k,label])=>'<option value="'+k+'">'+label+'</option>').join('');
 const currencyOptions='<option value="ARS">ARS</option><option value="USD">USD</option>';
 const itemOptions=items.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' · '+esc(i.unit)+' · '+productAmount(balanceOf(i),i.unit)+'</option>').join('');
 const flights=S.lg.filter(l=>l.ac===a.id&&l.kind==='f').slice().sort((x,y)=>String(y.date).localeCompare(String(x.date))).slice(0,500);
 const flightOptions='<option value="">Sin vuelo vinculado</option>'+flights.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.date)+' · '+esc(l.from||'')+' → '+esc(l.to||'')+' · '+Number(l.h).toFixed(1)+' h</option>').join('');
 const fuelStock='<option value="">Carga externa / no descontar stock</option>'+items.filter(i=>i.category==='fuel'&&i.unit==='L').map(i=>'<option value="'+esc(i.id)+'">'+esc(i.name)+' · disponibles '+productAmount(balanceOf(i),'L')+'</option>').join('');
 let form='';
 if(consumableForm==='item')form=`<section class="card p-4 space-y-3"><h2 class="font-bold text-amber-300">Crear producto</h2>
 <div class="maint-record-grid">${F('u_name','Producto / identificación','text','','maxlength="140"')}${SEL('u_cat','Categoría',categoryOptions)}${SEL('u_unit','Unidad',unitOptions)}${F('u_min','Stock mínimo (0 = sin alerta)','number',0)}</div>
 <p class="maint-note">La ficha comienza con saldo cero. Ingresá existencias mediante movimientos documentados. El catálogo pertenece a esta aeronave.</p>
 <button class="btn bg-amber-600" onclick="addConsumableItem()">Guardar producto</button></section>`;
 if(consumableForm==='move')form=`<section class="card p-4 space-y-3"><h2 class="font-bold text-amber-300">Registrar ingreso o salida</h2>
 ${items.length?`<div class="maint-record-grid">${SEL('u_item','Producto',itemOptions)}${SEL('u_kind','Movimiento','<option value="in">Ingreso / reposición</option><option value="out">Salida / uso</option>')}${F('u_date','Fecha','date',today())}${F('u_qty','Cantidad','number','')}${F('u_price','Costo unitario (opcional)','number','')}${SEL('u_currency','Moneda',currencyOptions)}${F('u_supplier','Proveedor (si corresponde)','text','','maxlength="150"')}${F('u_ref','Comprobante / referencia','text','','maxlength="200"')}<div class="wide">${F('u_reason','Destino / motivo de salida','text','','maxlength="250"')}</div></div><p class="maint-note">La cantidad se agrega o descuenta del saldo; no se permite stock negativo. Los movimientos permanecen auditables.</p><button class="btn bg-amber-600" onclick="addConsumableMovement()">Guardar movimiento</button>`:'<p class="maint-note">Primero creá un producto de inventario.</p>'}</section>`;
 if(consumableForm==='fuel')form=`<section class="card p-4 space-y-3"><h2 class="font-bold text-amber-300">Carga y consumo de combustible</h2>
 <div class="maint-record-grid">${F('fu_date','Fecha','date',today())}${SEL('fu_flight','Vuelo de bitácora (opcional)',flightOptions)}${F('fu_loaded','Combustible cargado (litros)','number','')}${F('fu_used','Combustible consumido informado (litros)','number','')}${SEL('fu_stock','Origen de la carga',fuelStock)}${F('fu_price','Costo por litro cargado (opcional)','number','')}${SEL('fu_currency','Moneda',currencyOptions)}${F('fu_supplier','Proveedor (opcional)','text','','maxlength="150"')}${F('fu_ref','Factura / ticket / referencia','text','','maxlength="200"')}<div class="wide">${F('fu_note','Observación / método de medición','text','','maxlength="350"')}</div></div>
 <p class="maint-note">Litros <b>cargados</b> no equivalen a litros <b>consumidos</b>. Se registran por separado; el consumo no se infiere del vuelo. Si elegís un tanque en inventario, la carga descuenta stock una sola vez.</p><button class="btn bg-amber-600" onclick="addFuelRecord()">Guardar registro de combustible</button></section>`;
 return `<div class="space-y-4">
 <section class="maint-regime"><strong>Consumibles y repuestos · ${esc(a.reg)}</strong><p>Gestión privada de insumos por aeronave, con movimientos trazables y vinculación opcional a vuelos. Los registros de consumos no acreditan trabajos de mantenimiento ni sustituyen las libretas técnicas.</p></section>
 <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
 <div class="card p-3"><b>${items.length}</b><p class="text-xs text-slate-400">Productos de inventario</p></div>
 <div class="card p-3"><b>${low.length}</b><p class="text-xs text-slate-400">Bajo mínimo declarado</p></div>
 <div class="card p-3"><b>${productAmount(loaded,'L')}</b><p class="text-xs text-slate-400">Cargados registrados</p></div>
 <div class="card p-3"><b>${productAmount(burned,'L')}</b><p class="text-xs text-slate-400">Consumidos informados</p></div>
 </div>
 <section class="card p-4"><div class="flex flex-wrap gap-2 items-center justify-between"><h2 class="font-bold">Planillas de consumibles</h2><div class="flex flex-wrap gap-2">
 <button class="btn bg-sky-700" onclick="openConsumables('item')" aria-expanded="${consumableForm==='item'}">Producto</button>
 <button class="btn bg-sky-700" onclick="openConsumables('move')" aria-expanded="${consumableForm==='move'}">Ingreso / salida</button>
 <button class="btn bg-sky-700" onclick="openConsumables('fuel')" aria-expanded="${consumableForm==='fuel'}">Combustible</button></div></div>
 <p class="text-xs text-slate-400 mt-2">Los formularios permanecen ocultos hasta que selecciones una acción. Volvé a tocar el botón para cerrarlo.</p></section>
 ${form}
 <section class="card p-4"><h2 class="font-bold text-amber-300 mb-2">Stock por aeronave</h2>
 <div class="overflow-x-auto"><table class="w-full"><thead><tr><th>Producto</th><th>Categoría</th><th>Disponible</th><th>Mínimo</th><th>Estado</th></tr></thead><tbody>
 ${items.map(i=>{const qty=balanceOf(i),under=i.minimum>0&&qty<i.minimum;return `<tr><td>${esc(i.name)}</td><td>${esc(CONSUMABLE_CATS[i.category]||'—')}</td><td>${productAmount(qty,esc(i.unit))}</td><td>${productAmount(i.minimum,esc(i.unit))}</td><td><span class="maint-pill ${under?'warn':''}">${under?'REPOSICIÓN':'REGISTRADO'}</span></td></tr>`}).join('')||'<tr><td colspan="5" class="text-slate-400">No se cargaron productos todavía.</td></tr>'}
 </tbody></table></div><p class="text-xs text-slate-400 mt-2">Los mínimos son configurados por el usuario; no son límites de aeronavegabilidad.</p></section>
 <section class="card p-4"><h2 class="font-bold text-amber-300 mb-2">Movimientos de inventario</h2>
 <div class="overflow-x-auto"><table class="w-full"><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Costo ingreso</th><th>Proveedor / referencia / motivo</th><th>Corrección</th></tr></thead><tbody>
 ${movements.slice(0,250).map(m=>{const i=items.find(x=>x.id===m.item);return `<tr><td>${esc(m.date)}</td><td>${esc(i?.name||'Producto no disponible')}</td><td>${m.voided?'ANULADO':esc(STOCK_KINDS[m.kind]||'—')}</td><td>${productAmount(m.qty,esc(i?.unit||''))}</td><td>${m.kind==='in'?consumableMoney(m.qty,m.unitCost,m.currency):'—'}</td><td>${esc([m.supplier,m.reference,m.reason,m.voidReason].filter(Boolean).join(' · '))}</td><td>${m.voided?'Anulado':m.source==='fuel'?'Ver carga de combustible':`<button class="text-rose-300 underline text-xs" onclick="annulStockMovement('${m.id}')">Anular</button>`}</td></tr>`}).join('')||'<tr><td colspan="7" class="text-slate-400">Sin movimientos.</td></tr>'}
 </tbody></table></div><p class="text-xs text-slate-400 mt-2">Se muestran los últimos 250 movimientos; el respaldo conserva el registro completo. Las anulaciones conservan motivo y rastro.</p></section>
 <section class="card p-4"><h2 class="font-bold text-amber-300 mb-2">Combustible por vuelo y por carga</h2>
 <div class="overflow-x-auto"><table class="w-full"><thead><tr><th>Fecha / vuelo</th><th>Cargado (L)</th><th>Consumido (L)</th><th>Costo informado</th><th>Origen / proveedor</th><th>Estado</th></tr></thead><tbody>
 ${fuels.slice(0,250).map(f=>{const l=S.lg.find(x=>x.id===f.flightId&&x.ac===a.id);return `<tr><td>${esc(f.date)}${f.flightId?'<div class="text-xs text-slate-400">'+esc(l?(l.from||'')+' → '+(l.to||'')+' · '+l.h+' h':'Vuelo asociado no disponible')+'</div>':''}</td><td>${productAmount(f.loaded,'L')}</td><td>${productAmount(f.used,'L')}</td><td>${consumableMoney(f.loaded,f.price,f.currency)}</td><td>${esc([f.stockId?'Stock propio':'Carga externa',f.supplier,f.reference,f.note].filter(Boolean).join(' · '))}</td><td>${f.voided?'<span class="maint-pill warn">ANULADO</span><div class="text-xs">'+esc(f.voidReason||'')+'</div>':`<button class="text-rose-300 underline text-xs" onclick="annulFuelRecord('${f.id}')">Anular</button>`}</td></tr>`}).join('')||'<tr><td colspan="6" class="text-slate-400">Aún no se registraron cargas ni consumos.</td></tr>'}
 </tbody></table></div><p class="text-xs text-slate-400 mt-2">Se muestran los últimos 250 registros; el respaldo incluye todos. No se calculan consumos de combustible por presunción.</p></section>
 </div>`;
}
