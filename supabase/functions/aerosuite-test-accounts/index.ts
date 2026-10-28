import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const allowedOrigins = new Set(["https://gentedevuelo.com","https://www.gentedevuelo.com","https://gentedevuelo.vercel.app","https://aerosuite.gentedevuelo.com"]);
function respond(origin: string, status: number, body: Record<string,unknown>): Response {
  return new Response(JSON.stringify(body), {status, headers:{
    "Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin",
    "Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://gentedevuelo.com",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS"
  }});
}
Deno.serve(async req => {
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS")return respond(origin,200,{ok:true});
  if(req.method!=="POST")return respond(origin,405,{error:"Método no permitido."});
  if(origin&&!allowedOrigins.has(origin))return respond(origin,403,{error:"Origen no autorizado."});
  if(!URL||!SERVICE||!ANON)return respond(origin,503,{error:"Configuración incompleta."});
  const bearer=req.headers.get("authorization")||"";
  if(!bearer.toLowerCase().startsWith("bearer "))return respond(origin,401,{error:"Sesión requerida."});
  try{
    const token=bearer.slice(7);
    const authClient=createClient(URL,ANON,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:identity,error:identityError}=await authClient.auth.getUser(token);
    if(identityError||!identity?.user?.id)return respond(origin,401,{error:"Sesión inválida."});
    const admin=createClient(URL,SERVICE,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:superadmin,error:permissionError}=await admin.from("aerosuite_superadmins")
       .select("user_id").eq("user_id",identity.user.id).maybeSingle();
    if(permissionError||!superadmin)return respond(origin,403,{error:"Solo Superadministración puede preparar el laboratorio."});
    const body=await req.json().catch(()=>({}));
    const role=body?.role;
    const password=body?.password;
    if(role!=="instructor"&&role!=="alumno")return respond(origin,400,{error:"Rol de laboratorio inválido."});
    if(typeof password!=="string"||password.length!==9||
       !/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password)||!/[^a-zA-Z0-9]/.test(password))
      return respond(origin,400,{error:"La clave requiere 9 caracteres exactos, mayúscula, minúscula, número y símbolo."});
    const {data:lab,error:labError}=await admin.from("aerosuite_permanent_test_lab")
      .select("institution_id").eq("singleton",true).single();
    if(labError||!lab?.institution_id)return respond(origin,404,{error:"Laboratorio permanente no configurado."});
    const {data:institution,error:institutionError}=await admin.from("aerosuite_institutions")
      .select("id,is_test,status").eq("id",lab.institution_id).single();
    if(institutionError||!institution||institution.is_test!==true||institution.status!=="active")
      return respond(origin,403,{error:"El laboratorio debe estar activo y marcado como prueba."});
    const {data:existing,error:existingError}=await admin.from("aerosuite_institution_members")
      .select("user_id").eq("institution_id",lab.institution_id).eq("role",role);
    if(existingError)return respond(origin,500,{error:"No se pudo verificar el rol."});
    if((existing||[]).length)return respond(origin,409,{error:"Ya hay una cuenta de "+role+" asignada. No se modificó su contraseña."});
    const email=role==="instructor"?"gentedevuelo+instructor@gmail.com":"gentedevuelo+alumno@gmail.com";
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,password,email_confirm:true,
      app_metadata:{aerosuite_lab:true,aerosuite_lab_role:role,aerosuite_lab_institution:lab.institution_id},
      user_metadata:{display_name:role==="instructor"?"Instructor · Laboratorio AeroSuite":"Alumno · Laboratorio AeroSuite"}
    });
    if(createError||!created?.user?.id){
      const duplicate=/already|registered|exists|duplicate/i.test(String(createError?.message||""));
      return respond(origin,duplicate?409:502,{error:duplicate?
        "Esta cuenta técnica ya existe. No se modificó por seguridad.": "No se pudo crear la cuenta técnica en Auth."});
    }
    const userId=created.user.id;
    const {error:memberError}=await admin.from("aerosuite_institution_members").insert({
      institution_id:lab.institution_id,user_id:userId,role,assigned_by:identity.user.id
    });
    if(memberError){
      const cleanup=await admin.auth.admin.deleteUser(userId);
      return respond(origin,500,{error:cleanup.error?
        "No se pudo asociar el rol ni revertir la identidad técnica. Requiere revisión manual.":
        "No se pudo asociar el rol; la creación técnica fue revertida."});
    }
    return respond(origin,200,{ok:true,role,email,created:true,mail_sent:false});
  }catch{
    return respond(origin,500,{error:"No se pudo completar la preparación de la cuenta técnica."});
  }
});
