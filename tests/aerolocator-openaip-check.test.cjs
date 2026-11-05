// La comprobación de OpenAIP debe estar limitada a administradores
// y no debe insertar la API key en la página pública.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'utilidades/pistas-no-oficiales.html'),'utf8');
const server=fs.readFileSync(path.join(root,'supabase/functions/aerolocator-openaip-check/index.ts'),'utf8');

test('La interfaz para comprobar OpenAIP solo aparece dentro de sección admin',()=>{
 const a=html.indexOf('<section id="admin" hidden>');
 const b=html.indexOf('id="openaip-check-button"');
 const c=html.indexOf('id="pending"');
 assert.ok(a>=0&&a<b&&b<c);
 assert.equal(html.match(/id="openaip-check-button"/g)?.length,1);
 assert.match(html,/if\(admin\)\{\s*document\.getElementById\('admin'\)\.hidden=false/);
});
test('La petición usa la sesión de Supabase, no una clave OpenAIP en JavaScript',()=>{
 assert.match(html,/client\.auth\.getSession\(\)/);
 assert.match(html,/client\.functions\.invoke\('aerolocator-openaip-check',\{method:'GET'\}\)/);
 assert.doesNotMatch(html,/(?:x-openaip-api-key|OPENAIP_API_KEY\s*=\s*["'])/);
});
test('La función comprueba la identidad y membresía admin antes de leer la clave',()=>{
 const auth=server.indexOf('/auth/v1/user');
 const admin=server.indexOf('/rest/v1/site_admins');
 const secret=server.indexOf('Deno.env.get(ENV_NAME)');
 assert.ok(auth>=0&&admin>auth&&secret>admin);
 assert.match(server,/verifiedUserId = String\(user.id\)/);
 assert.match(server,/rows\[0\]\?\.user_id !== verifiedUserId/);
});
test('La respuesta no muestra la clave al cliente',()=>{
 assert.match(server,/OPENAIP_API_KEY/);
 assert.match(server,/x-openaip-api-key/);
 assert.doesNotMatch(server,/(?:apiKey\s*[:,]|key:\s*apiKey)/);
 assert.match(server,/returnedRecords/);
});

test('La función responde OPTIONS con CORS antes de verificar token',()=>{
 const preflight=server.indexOf('if (req.method === "OPTIONS")');
 const login=server.indexOf('const auth = req.headers.get("authorization")');
 assert.ok(preflight>0&&login>preflight);
 assert.match(server,/new Response\(null, \{ status: 204, headers: corsHeaders\(req\) \}\)/);
 assert.match(server,/"Access-Control-Allow-Methods": "GET, OPTIONS"/);
 assert.match(server,/"Access-Control-Allow-Headers": req\.headers\.get\("access-control-request-headers"\)/);
});
test('La función responde CORS solo a los dominios autorizados, incluso en errores',()=>{
 assert.match(server,/"https:\/\/gentedevuelo\.com"/);
 assert.match(server,/if \(!origin \|\| !ALLOWED_ORIGINS\.has\(origin\)\) return \{\}/);
 assert.match(server,/\.\.\.corsHeaders\(req\)/);
 assert.match(server,/const respond = \(status: number, payload: Record<string, unknown>\) => json\(status, payload, req\)/);
 assert.doesNotMatch(server,/"Access-Control-Allow-Origin": "\*"/);
});

test('AeroLocator distingue las causas del 503 sin mostrar secretos',()=>{
 for(const code of ['auth_configuration_missing','auth_unavailable',
  'authorization_unavailable','openaip_connection_unavailable','openaip_key_not_configured']){
   assert.ok(html.includes("kind==='"+code+"'"));
 }
 assert.match(html,/error\.context\?\.status/);
});
test('La función registra códigos de fallo seguros, sin credenciales',()=>{
 assert.match(server,/if \(status >= 500\)/);
 assert.match(server,/console\.warn\("aerolocator_openaip_check_failure", errorCode, status\)/);
 assert.doesNotMatch(server,/console\.warn\([^\n]*apiKey/);
});
