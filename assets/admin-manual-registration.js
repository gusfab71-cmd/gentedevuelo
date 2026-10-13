'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const form=$("gdvManualRegistrationForm");
 if(!form)return;
 function randomPassword(){
   const pools=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghjkmnpqrstuvwxyz','23456789','!@#$%&*-_'];
   const rand=max=>{const limit=Math.floor(256/max)*max, bytes=new Uint8Array(1);do{crypto.getRandomValues(bytes)}while(bytes[0]>=limit);return bytes[0]%max};
   const chars=pools.map(p=>p[rand(p.length)]);
   const all=pools.join('');
   while(chars.length<16)chars.push(all[rand(all.length)]);
   for(let i=chars.length-1;i>0;i--){const j=rand(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
   return chars.join('');
 }
 $("gdvGeneratePassword").addEventListener("click",()=>{
   $("gdvManualPassword").value=randomPassword();
   $("gdvManualStatus").textContent="Contraseña temporal generada. Copiala y compartila por un canal seguro.";
 });
 $("gdvShowPassword").addEventListener("click",()=>{
   const input=$("gdvManualPassword");
   input.type=input.type==="password"?"text":"password";
 });
 $("gdvCopyPassword").addEventListener("click",async()=>{
   const pwd=$("gdvManualPassword").value;
   if(!pwd){$("gdvManualStatus").textContent="Generá una contraseña primero.";return}
   try{await navigator.clipboard.writeText(pwd);$("gdvManualStatus").textContent="Contraseña temporal copiada."}
   catch{$("gdvManualStatus").textContent="Usá Mostrar / ocultar para copiar la contraseña manualmente."}
 });
 form.addEventListener("submit",async e=>{
   e.preventDefault();
   if(typeof administrador==="undefined"||!administrador)return;
   const button=$("gdvManualCreate"),status=$("gdvManualStatus"),password=$("gdvManualPassword").value;
   const isValid=password.length>=9&&password.length<=128&&/[a-z]/.test(password)&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/[!-/:-@[-\x60{-~]/.test(password);
   if(!isValid){status.textContent="La contraseña necesita 9 caracteres, mayúscula, minúscula, número y símbolo.";return}
   if(!$("gdvManualVerify").checked){status.textContent="Primero comprobá la titularidad del correo y su consentimiento.";return}
   button.disabled=true;status.textContent="Registrando al integrante…";
   try{
     const {data:{session},error:sessionError}=await client.auth.getSession();
     if(sessionError||!session?.access_token)throw Error("Sesión vencida. Volvé a ingresar.");
     const res=await fetch("https://lmoifzyhqmccvmgitlcp.supabase.co/functions/v1/gdv-admin-registration",{
       method:"POST",headers:{apikey:window.GDV_CONFIG.key,Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
       body:JSON.stringify({action:"create_manual",username:$("gdvManualUsername").value.trim(),email:$("gdvManualEmail").value.trim(),
         full_name:$("gdvManualFullName").value.trim(),password,email_verified_by_admin:true})
     });
     const data=await res.json().catch(()=>({}));
     if(!res.ok)throw Error(data.error||"No se pudo registrar.");
     status.textContent="Cuenta "+data.username+" creada. Copiá y compartí la contraseña temporal de forma privada. El integrante deberá cambiarla al ingresar. Recargá el panel para registrar a otra persona.";
     $("gdvManualVerify").checked=false;
   }catch(error){status.textContent="No se pudo crear: "+(error.message||"Error desconocido.");button.disabled=false}
 });
})();