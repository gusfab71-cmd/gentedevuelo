'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const root=$('gdvIncompleteRegistration');
 if(!root)return;
 const status=$('gdvIncompleteStatus'), list=$('gdvIncompleteList'), refresh=$('gdvIncompleteRefresh');
 const auth=()=>window.GDV_AUTH?.client;
 const endpoint=window.GDV_CONFIG.url+'/functions/v1/gdv-admin-registration';
 let working=false;
 function node(tag,cls,content){
   const el=document.createElement(tag);
   if(cls)el.className=cls;
   if(content!==undefined)el.textContent=content;
   return el;
 }
 function randomPassword(){
   const pools=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghjkmnpqrstuvwxyz','23456789','!@#$%&*-_'];
   const rand=max=>{const limit=Math.floor(256/max)*max,bytes=new Uint8Array(1);do{crypto.getRandomValues(bytes)}while(bytes[0]>=limit);return bytes[0]%max};
   const chars=pools.map(p=>p[rand(p.length)]),all=pools.join('');
   while(chars.length<16)chars.push(all[rand(all.length)]);
   for(let i=chars.length-1;i>0;i--){const j=rand(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
   return chars.join('');
 }
 async function call(action,details={}){
   const db=auth();
   if(!db)throw Error('La sesión no está disponible.');
   const {data:{session},error}=await db.auth.getSession();
   if(error||!session?.access_token)throw Error('La sesión venció. Volvé a ingresar.');
   const res=await fetch(endpoint,{method:'POST',cache:'no-store',
     headers:{apikey:window.GDV_CONFIG.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
     body:JSON.stringify({action,...details})});
   const payload=await res.json().catch(()=>({}));
   if(!res.ok||!payload.ok)throw Error(payload.error||'No se pudo completar la operación.');
   return payload;
 }
 function instructions(item){
   const start='Hola. Tu cuenta de Gente de Vuelo ya existe, pero tiene un paso pendiente. No vuelvas a registrarte con el mismo correo.\n\n';
   const url='https://gentedevuelo.com/comunidad.html';
   if(!item.email_confirmed){
     return start+'Tenés que confirmar el correo primero. Entrá a '+url+'#registro, buscá “Reenviar confirmación”, escribí el correo con el que te registraste y revisá tu bandeja de entrada y spam. Después ingresá a Gente de Vuelo para completar los pasos pendientes.';
   }
   if(item.initial_password_pending){
     return start+'Ingresá con tu correo y la contraseña temporal que te compartió la administración de forma privada en '+url+'#ingresar. El sistema te pedirá cambiar la contraseña antes de completar tu perfil. Nunca compartas tu nueva contraseña.';
   }
   if(item.google){
     return start+'Entrá a '+url+'#ingresar y elegí “Ingresar con Google” con la misma cuenta que utilizaste al principio. Cuando aparezca “Completá tu perfil”, elegí tu nombre de usuario, actividad aeronáutica, subí una foto y aceptá la normativa. Guardá y ya podrás ingresar.';
   }
   return start+'Entrá a '+url+'#ingresar e iniciá sesión con tu correo o usuario. Si no recordás tu contraseña, usá “Recuperar contraseña”. Luego completá los campos pendientes del perfil y aceptá la normativa.';
 }
 async function copy(value, output, success){
   try{await navigator.clipboard.writeText(value);output.textContent=success;}
   catch{output.textContent='No se pudo copiar. Revisá los permisos del navegador e intentá de nuevo.';}
 }
 function row(item){
   const card=node('article','panel gdv-incomplete-card');
   card.style.cssText='margin:12px 0;padding:16px;background:rgba(255,255,255,.025);border-color:rgba(255,255,255,.14)';
   card.append(node('h3','',item.full_name||item.username||'Registro sin nombre'));
   const identity=node('p','intro',item.email+' · '+(item.google?'Google':'Correo y contraseña'));
   identity.style.cssText='margin:6px 0 8px;overflow-wrap:anywhere';
   card.append(identity);
   const small=node('p','',item.email_confirmed?'Correo confirmado':'Correo pendiente de confirmación');
   small.style.margin='5px 0';
   card.append(small);
   const missing=node('p','',item.missing.length?'Pendiente: '+item.missing.join(' · '):'Sin pasos pendientes detectados');
   missing.style.margin='5px 0 12px';
   card.append(missing);
   if(item.initial_password_pending){
     const pending=node('p','estado','Ya tiene una contraseña temporal asignada y debe cambiarla al ingresar.');
     card.append(pending);
   }
   const actions=node('div','acciones');
   actions.style.cssText='margin-top:8px;flex-wrap:wrap';
   const instructionsButton=node('button','secundario','Copiar instrucciones');
   instructionsButton.type='button';
   const actionState=node('p','estado');
   actionState.setAttribute('role','status');
   instructionsButton.onclick=()=>copy(instructions(item),actionState,'Instrucciones copiadas. Podés enviarlas al integrante por privado.');
   actions.append(instructionsButton);
   if(item.email_confirmed&&!item.profile_completed){
     const open=node('button','secundario','Asignar clave temporal');
     open.type='button';actions.append(open);
     const recover=node('div','');
     recover.hidden=true;recover.style.cssText='padding:12px 0;max-width:610px';
     recover.append(node('p','intro','Solo después de verificar personalmente la identidad, la titularidad del correo y el consentimiento. No modifica ni completa el perfil.'));
     const secretLabel=node('label','', 'Contraseña temporal nueva');
     const secret=node('input','');secret.type='password';secret.minLength=9;secret.maxLength=128;secret.autocomplete='new-password';secret.value=randomPassword();secretLabel.append(secret);
     recover.append(secretLabel);
     const tools=node('div','acciones');tools.style.cssText='margin:8px 0;flex-wrap:wrap';
     const regen=node('button','secundario','Generar otra'), reveal=node('button','secundario','Mostrar / ocultar'),copyPwd=node('button','secundario','Copiar clave');
     for(const b of [regen,reveal,copyPwd]){b.type='button';tools.append(b);}
     regen.onclick=()=>{secret.value=randomPassword();actionState.textContent='Nueva contraseña generada.'};
     reveal.onclick=()=>{secret.type=secret.type==='password'?'text':'password'};
     copyPwd.onclick=()=>copy(secret.value,actionState,'Clave temporal copiada. Compartila únicamente por un canal privado y seguro.');
     recover.append(tools);
     const verifyLabel=node('label','');
     verifyLabel.style.cssText='display:flex;gap:10px;align-items:flex-start;font-weight:400';
     const check=node('input','');check.type='checkbox';check.style.cssText='width:auto;min-height:18px;min-width:18px';
     verifyLabel.append(check,document.createTextNode('Confirmé identidad, titularidad del correo y autorización expresa para restablecer el acceso.'));
     recover.append(verifyLabel);
     const submit=node('button','','Confirmar y asignar clave temporal');submit.type='button';
     submit.style.marginTop='10px';recover.append(submit);
     open.onclick=()=>{recover.hidden=!recover.hidden;open.textContent=recover.hidden?'Asignar clave temporal':'Cerrar recuperación'};
     submit.onclick=async()=>{
       if(!check.checked){actionState.textContent='Antes debés comprobar la identidad y su autorización.';return}
       if(!/^(?=.{9,128}$)(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!-/:-@[-\x60{-~]).+$/.test(secret.value)){
         actionState.textContent='La clave requiere al menos 9 caracteres, mayúscula, minúscula, número y símbolo.';return;
       }
       if(!confirm('¿Confirmás que verificaste al titular y que autorizó asignar una contraseña temporal a esta cuenta?'))return;
       submit.disabled=true;actionState.textContent='Actualizando acceso…';
       try{
         await call('recover_existing',{user_id:item.id,password:secret.value,identity_verified_by_admin:true});
         actionState.textContent='Contraseña temporal asignada. Copiala ahora y enviala por un canal privado. Al ingresar deberá cambiarla y completar el perfil.';
         submit.disabled=true;check.checked=false;
         item.initial_password_pending=true;
       }catch(e){actionState.textContent='No se pudo recuperar: '+(e.message||'Error desconocido');submit.disabled=false;}
     };
     card.append(actions,recover,actionState);
   }else card.append(actions,actionState);
   return card;
 }
 async function load(){
   if(typeof administrador==='undefined'||!administrador||root.hidden||working)return;
   working=true;refresh.disabled=true;
   status.textContent='Consultando registros pendientes en Supabase…';list.replaceChildren();
   try{
     const result=await call('list_incomplete');
     const entries=Array.isArray(result.entries)?result.entries:[];
     const incomplete=entries.filter(item=>!item.profile_completed).length;
     const unconfirmed=entries.filter(item=>!item.email_confirmed).length;
     status.textContent='Cuentas en Auth: '+result.total+' · Perfiles incompletos: '+incomplete+' · Correos por confirmar: '+unconfirmed+'.';
     if(!entries.length){list.append(node('p','','No hay registros pendientes.'));return;}
     const fragment=document.createDocumentFragment();
     entries.forEach(item=>fragment.append(row(item)));
     list.append(fragment);
   }catch(e){status.textContent='No se pudo consultar: '+(e.message||'Error desconocido');}
   finally{working=false;refresh.disabled=false}
 }
 refresh.addEventListener('click',load);
 window.GDV_INCOMPLETE={load};
 if(location.hash==="#registros-incompletos")window.addEventListener("load",()=>{if(!root.hidden)load();});
})();