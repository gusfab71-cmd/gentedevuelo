'use strict';
window.GDVPresence=(()=>{
 let db,userId=null,started=false,working=false;
 function paint(rows,error=false){const online=new Set(rows.filter(r=>Date.now()-new Date(r.last_seen).getTime()<90000).map(r=>r.user_id));document.querySelectorAll('[data-member-status]').forEach(el=>{const active=!error&&online.has(el.dataset.memberStatus);el.classList.toggle('online',active);el.textContent=error?'Estado no disponible':active?'En línea':'Desconectado'})}
 async function refresh(){if(!db)return;try{const rows=[];for(let from=0;;from+=500){const r=await db.from('gdv_member_presence').select('user_id,last_seen').gt('last_seen',new Date(Date.now()-90000).toISOString()).order('user_id').range(from,from+499);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<500)break}paint(rows)}catch{paint([],true)}}
 async function tick(){if(working||!db)return;working=true;try{if(userId){const r=await db.from('gdv_member_presence').upsert({user_id:userId},{onConflict:'user_id'});if(r.error)throw r.error}if(document.querySelector('[data-member-status]'))await refresh()}catch{if(document.querySelector('[data-member-status]'))paint([],true)}finally{working=false}}
 async function leave(){if(db&&userId)await db.from('gdv_member_presence').delete().eq('user_id',userId)}
 function start(client){if(started)return;started=true;db=client;db.auth.onAuthStateChange((_event,session)=>{userId=session?.user?.id||null;setTimeout(tick,0)});setInterval(tick,30000);window.addEventListener('online',tick);document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});}
 return {start,refresh,leave};
})();
