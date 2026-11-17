import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../supabase/functions/onboarding/index.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({secret='private-test-code-123456',demo=false,available=true,allowed=true,email='owner@example.com',confirmed=true,completeError=null,appUrl='https://glazed.example/ERP/'}={}) {
  let handler; const calls=[];
  const client={
    auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner-id',email,email_confirmed_at:confirmed?'date':null}:null},error:null})},
    rpc:async(name,args)=>{calls.push({name,args});return {data:name==='_business_setup_status'?available:name==='_business_setup_attempt'?allowed:{completed:true,location_id:1},error:name==='_complete_business_setup'?completeError:null};},
    from:table=>({select:()=>({eq:()=>({order:async()=>{calls.push({name:'locations',table});return {data:[{id:1,name:'Shop',address:'Street'}],error:null};}})})}),
  };
  vm.runInNewContext(js,{createClient:()=>client,USERNAME_DOMAIN:'users.glazed.invalid',Deno:{env:{get:key=>({APP_URL:appUrl,OWNER_SETUP_CODE:secret,DEMO_MODE:String(demo),SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'})[key]},serve:fn=>{handler=fn;}},Request,Response,URL,TextEncoder,crypto:webcrypto});
  return {calls,async request(body,{token='valid',origin='https://glazed.example',method='POST'}={}) {const headers={'Content-Type':'application/json',Origin:origin};if(token)headers.Authorization=`Bearer ${token}`;const r=await handler(new Request('https://example.supabase.co/functions/v1/onboarding',{method,headers,body:method==='POST'?JSON.stringify(body):undefined}));return {status:r.status,body:r.status===204?null:await r.json()};}};
}
const complete={action:'complete',setup_code:'private-test-code-123456',business_name:'New Shop',location_name:'First shop',location_address:'Main Street'};
test('public status reveals availability only',async()=>{const h=harness();assert.deepEqual((await h.request({action:'status'},{token:null})).body,{available:true});assert.equal(h.calls.length,1);});
test('missing or short backend setup code closes status and rejects claims',async()=>{for(const secret of [undefined,'short']){const h=harness({secret:secret??''});assert.equal((await h.request({action:'status'})).body.available,false);assert.equal((await h.request(complete)).status,503);assert.equal(h.calls.some(c=>c.name==='_complete_business_setup'),false);}});
test('demo status is closed and mutations are forbidden',async()=>{const h=harness({demo:true});assert.equal((await h.request({action:'status'})).body.available,false);assert.equal((await h.request(complete)).status,403);assert.equal(h.calls.length,0);});
test('foreign origin, wrong method, missing APP_URL reject requests',async()=>{assert.equal((await harness().request(complete,{origin:'https://evil.example'})).status,403);assert.equal((await harness().request(null,{method:'GET'})).status,405);assert.equal((await harness({appUrl:''}).request(complete)).status,503);});
test('anonymous and invalid JWT cannot claim',async()=>{for(const token of [null,'invalid']){const h=harness();assert.equal((await h.request(complete,{token})).status,401);assert.equal(h.calls.length,0);}});
test('synthetic and unconfirmed email accounts cannot claim',async()=>{for(const options of [{email:'name@users.glazed.invalid'},{confirmed:false}]){const h=harness(options);assert.equal((await h.request(complete)).status,403);assert.equal(h.calls.length,0);}});
test('wrong and missing code consume attempt without accessing business records',async()=>{for(const setup_code of ['',null,'wrong']){const h=harness();assert.equal((await h.request({...complete,setup_code})).status,403);assert.deepEqual(h.calls.map(c=>c.name),['_business_setup_attempt']);}});
test('rate limit persists before secret comparison',async()=>{const h=harness({allowed:false});assert.equal((await h.request(complete)).status,429);assert.deepEqual(h.calls.map(c=>c.name),['_business_setup_attempt']);});
test('locations are visible only after verified JWT and setup code',async()=>{const h=harness();const r=await h.request({action:'locations',setup_code:complete.setup_code});assert.equal(r.status,200);assert.equal(r.body.locations[0].id,1);assert.deepEqual(h.calls.map(c=>c.name),['_business_setup_attempt','_business_setup_status','locations']);});
test('closed setup cannot disclose locations',async()=>{const h=harness({available:false});assert.equal((await h.request({action:'locations',setup_code:complete.setup_code})).status,409);assert.equal(h.calls.some(c=>c.name==='locations'),false);});
test('valid claim passes verified actor and only permitted parameters',async()=>{const h=harness();const r=await h.request({...complete,p_actor:'attacker',role:'admin',owner_id:'attacker'});assert.equal(r.status,200);const call=h.calls.at(-1);assert.equal(call.name,'_complete_business_setup');assert.equal(call.args.p_actor,'owner-id');assert.equal(Object.hasOwn(call.args,'role'),false);assert.equal(r.body.completed,true);});
test('completion races return conflict; backend details stay private',async()=>{const h=harness({completeError:{code:'23505',message:'sensitive'}});const r=await h.request(complete);assert.equal(r.status,409);assert.equal(JSON.stringify(r.body).includes('sensitive'),false);});
test('invalid input cannot reach atomic claim',async()=>{for(const change of [{business_name:''},{business_name:'a'.repeat(121)},{location_id:-1},{location_name:3},{location_address:'a'.repeat(501)}]){const h=harness();assert.equal((await h.request({...complete,...change})).status,400);assert.equal(h.calls.some(c=>c.name==='_complete_business_setup'),false);}});
