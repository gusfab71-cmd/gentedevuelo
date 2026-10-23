'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const r2=fs.readFileSync('assets/r2-media.js','utf8');
const homepage=fs.readFileSync('assets/home-video.js','utf8');
const queue=fs.readFileSync('supabase/functions/r2-cleanup-queue/index.ts','utf8');
const moderation=fs.readFileSync('moderacion.html','utf8');

async function main(){
 const sent=[];
 const browser={GDV_R2_MEDIA:null};
 const context={
  window:browser,
  fetch:async(url,options)=>{
   sent.push({url,options});
   return {ok:true,json:async()=>({processed:1,pending:0,errors:0})};
  },
  console
 };
 vm.runInNewContext(r2,context);
 assert.equal(typeof browser.GDV_R2_MEDIA.cleanupQueued,'function');
 const client={auth:{getSession:async()=>({data:{session:{access_token:'session-test'}}})}};
 const cleaned=await browser.GDV_R2_MEDIA.cleanupQueued(client,'https://supabase.example/','public-key');
 assert.equal(cleaned.processed,1);
 assert.equal(sent.length,1);
 assert.equal(sent[0].url,'https://supabase.example/functions/v1/r2-cleanup-queue');
 assert.equal(sent[0].options.headers.Authorization,'Bearer session-test');
 assert.equal(sent[0].options.method,'POST');
 assert.equal(JSON.parse(sent[0].options.body).constructor,Object);
 await assert.rejects(browser.GDV_R2_MEDIA.cleanupQueued({auth:{getSession:async()=>({data:{session:null}})}},
  'https://supabase.example','public-key'),/sesión venció/i);
 assert.equal(sent.length,1,'Sin sesión no se llama al proceso de borrado.');

 assert.ok(queue.includes('service.from("site_admins")'),'El servicio debe comprobar el rol admin.');
 assert.ok(queue.indexOf('if(adminError||!admin)')<queue.indexOf('.from("r2_cleanup_queue")'),
  'Verificar permisos antes de procesar objetos.');
 assert.match(queue,/gdv_r2_is_file_referenced/,'Debe verificar referencias vivas antes del borrado.');
 assert.ok(queue.indexOf('if (referenced) continue;')<queue.indexOf('new DeleteObjectCommand'),
  'Nunca borrar un objeto todavía referenciado.');

 const saveStart=homepage.indexOf('async function save(evt)');
 const previewStart=homepage.indexOf('function preview()',saveStart);
 const saveBlock=homepage.slice(saveStart,previewStart);
 assert.ok(saveBlock.indexOf(".update({title,video_url:url")>=0,'Guardar la nueva URL.');
 assert.ok(saveBlock.indexOf("if(error||!data)throw")>saveBlock.indexOf(".update({title,video_url:url"),
  'Confirmar publicación antes de limpiar.');
 assert.ok(saveBlock.indexOf("cleanupQueued(")>saveBlock.indexOf("if(error||!data)throw"),
  'La limpieza solo puede seguir a un guardado exitoso.');
 assert.ok(saveBlock.includes('catch(err){'),'Los fallos de limpieza deben manejarse sin revertir la portada.');
 const uploadBlock=homepage.slice(homepage.indexOf('async function upload()'),homepage.indexOf('window.GDV_STOL_VIDEO'));
 assert.doesNotMatch(uploadBlock,/cleanupQueued/,'La limpieza no debe realizarse al seleccionar o subir sin publicar.');
 assert.ok(moderation.includes('Una vez publicado el reemplazo, se elimina el archivo antiguo'));
 assert.ok(moderation.includes('home-video.js?v=20261023portadaLimpieza1'));
 assert.ok(moderation.includes('r2-media.js?v=20261023portadaLimpieza1'));
 console.log('PASS: portada segura, eliminación solo tras guardar, permisos admin, referencias vivas y recuperación');
}
main().catch(err=>{console.error(err);process.exitCode=1});
