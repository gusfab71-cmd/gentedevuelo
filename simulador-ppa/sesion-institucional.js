'use strict';
/*
 * Sesión exclusiva del Simulador PPA.
 * FlyPro y Gente de Vuelo comparten Supabase Auth, pero NO el storageKey.
 * El acceso final se valida siempre por RPC/RLS; esta elección evita cargar
 * inadvertidamente las credenciales de la Comunidad cuando entra un alumno.
 */
(()=>{
  const params=new URLSearchParams(location.search);
  const institution=params.get('institucion')||'';
  const validInstitution=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institution);
  const student=validInstitution&&params.get('rol')==='alumno';
  const lab=student&&params.get('prueba')==='1';
  const client=student
    ?supabase.createClient(GDV_CONFIG.url,GDV_CONFIG.key,{
       auth:{
         storageKey:lab?'aerosuite-laboratorio-alumno-v1-auth':'aerosuite-institucional-v2-auth',
         persistSession:true,
         autoRefreshToken:true,
         detectSessionInUrl:true
       }
     })
    :supabase.createClient(GDV_CONFIG.url,GDV_CONFIG.key);
  // Mantener compatible la interfaz GDV_AUTH usada por el simulador.
  const ready=client.auth.getUser().then(({data,error})=>{
    if(error||!data?.user)throw Error('No existe una sesión autenticada para este acceso.');
    return data.user;
  });
  window.GDV_AUTH=Object.freeze({client,ready});
})();
