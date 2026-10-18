const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/gemini-audit.js');

function response() {
  return {statusCode: 200, headers: {}, setHeader(k,v){this.headers[k]=v;}, end(s){this.body=JSON.parse(s);}};
}
function request(method='POST', authorization='', body={caseId:'tas'}) {
  return {method,headers:{authorization},body};
}
test('GET is rejected',async()=>{
  const res=response();await handler(request('GET'),res);
  assert.equal(res.statusCode,405);
});
test('disabled by default without configured key and explicit switch',async()=>{
  const prevKey=process.env.GEMINI_API_KEY,prevFlag=process.env.GEMINI_AUDIT_ENABLED;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_AUDIT_ENABLED;
    const res=response();await handler(request(),res);
    assert.equal(res.statusCode,503);
    assert.equal(res.body.error,'not_configured');
  } finally {restore('GEMINI_API_KEY',prevKey);restore('GEMINI_AUDIT_ENABLED',prevFlag);}
});
function restore(name,value){if(value===undefined)delete process.env[name];else process.env[name]=value;}
async function enabled(run) {
  const prevKey=process.env.GEMINI_API_KEY,prevFlag=process.env.GEMINI_AUDIT_ENABLED;
  const prevFetch=global.fetch;
  try {
    process.env.GEMINI_API_KEY='test-only-not-a-real-key';
    process.env.GEMINI_AUDIT_ENABLED='true';
    await run();
  } finally {
    restore('GEMINI_API_KEY',prevKey);restore('GEMINI_AUDIT_ENABLED',prevFlag);
    global.fetch=prevFetch;
  }
}
test('missing bearer token is rejected before any external call',async()=>{
  await enabled(async()=>{
    global.fetch=()=>{throw new Error('Should not fetch');};
    const res=response();await handler(request(),res);
    assert.equal(res.statusCode,401);
  });
});
test('a signed-in non-admin cannot call Google',async()=>{
  await enabled(async()=>{
    let calls=0;
    global.fetch=async url=>{calls++;return {ok:true,json:async()=>url.includes('/auth/v1/user')?{id:'member-1'}:[]};};
    const res=response();await handler(request('POST','Bearer mock-token'),res);
    assert.equal(res.statusCode,403);
    assert.equal(calls,2);
  });
});
test('admin cannot send an arbitrary prompt or personal plan',async()=>{
  await enabled(async()=>{
    let calls=0;
    global.fetch=async url=>{
      calls++;
      if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'admin-invalid'})};
      if(url.includes('/site_admins'))return {ok:true,json:async()=>[{user_id:'admin-invalid'}]};
      throw new Error('Google must not be called');
    };
    const res=response();await handler(request('POST','Bearer mock-token',{caseId:'tas',subject:'Mi plan real'}),res);
    assert.equal(res.statusCode,400);
    assert.equal(res.body.error,'invalid_case');
    assert.equal(calls,2);
  });
});
test('admin calls Google only with a predefined synthetic case and is throttled',async()=>{
  await enabled(async()=>{
    const calls=[];
    global.fetch=async (url,options)=>{
      calls.push({url,options});
      if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'admin-success'})};
      if(url.includes('/site_admins'))return {ok:true,json:async()=>[{user_id:'admin-success'}]};
      return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Revisión ficticia correcta.'}]}}]})};
    };
    const res=response();await handler(request('POST','Bearer mock-token',{caseId:'fuel'}),res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.advisory_only,true);
    assert.equal(res.body.caseId,'fuel');
    assert.equal(calls.length,3);
    assert.equal(calls[2].options.headers['x-goog-api-key'],'test-only-not-a-real-key');
    const sent=JSON.stringify(JSON.parse(calls[2].options.body));
    assert.ok(sent.includes('67 L'));
    assert.ok(!sent.includes('mock-token'));
    const second=response();await handler(request('POST','Bearer mock-token',{caseId:'wind'}),second);
    assert.equal(second.statusCode,429);
    assert.equal(second.body.error,'slow_down');
    assert.equal(calls.length,5);
  });
});
test('malformed JSON is rejected without calling Gemini',async()=>{
  await enabled(async()=>{
    global.fetch=async url=>{
      if(url.includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'admin-bad-json'})};
      if(url.includes('/site_admins'))return {ok:true,json:async()=>[{user_id:'admin-bad-json'}]};
      throw new Error('Google must not be called');
    };
    const req=request('POST','Bearer mock-token');
    delete req.body;
    req[Symbol.asyncIterator]=async function*(){yield Buffer.from('{broken');};
    const res=response();await handler(req,res);
    assert.equal(res.statusCode,400);
    assert.equal(res.body.error,'invalid_json');
  });
});
