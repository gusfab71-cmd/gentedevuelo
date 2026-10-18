const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/gemini-audit.js');

function response() {
  return {statusCode: 200, headers: {}, setHeader(k,v){this.headers[k]=v;}, end(s){this.body=JSON.parse(s);}};
}
function request(method='POST', authorization='') {
  return {method,headers:{authorization},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify({subject:'Caso sintético de IAS y TAS para revisar'}));}};
}
test('GET is rejected',async()=>{
  const res=response();await handler(request('GET'),res);
  assert.equal(res.statusCode,405);
});
test('disabled by default without configured key and explicit switch',async()=>{
  const res=response();await handler(request(),res);
  assert.equal(res.statusCode,503);
  assert.equal(res.body.error,'not_configured');
});
test('missing bearer token is rejected before any external call',async()=>{
  const prevKey=process.env.GEMINI_API_KEY,prevFlag=process.env.GEMINI_AUDIT_ENABLED;
  try {
    process.env.GEMINI_API_KEY='test-only-not-a-real-key';
    process.env.GEMINI_AUDIT_ENABLED='true';
    const res=response();await handler(request(),res);
    assert.equal(res.statusCode,401);
  } finally {
    if(prevKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=prevKey;
    if(prevFlag===undefined)delete process.env.GEMINI_AUDIT_ENABLED;else process.env.GEMINI_AUDIT_ENABLED=prevFlag;
  }
});
