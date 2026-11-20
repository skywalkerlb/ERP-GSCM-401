import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../supabase/functions/onboarding/index.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function harness({demo=false,available=true,email='owner@example.com',createError=null,appUrl='https://glazed.example/ERP/'}={}) {
 let handler;const calls=[];
 const client={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner-id',email}:null},error:null})},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='business_registration_status'?available:{business_id:'business-a',name:'Shop',slug:'shop'},error:name==='create_business'?createError:null}}};
 vm.runInNewContext(js,{createClient:(url,key,options)=>{calls.push({name:'client',key,options});return client},USERNAME_DOMAIN:'users.glazed.invalid',Deno:{env:{get:key=>({APP_URL:appUrl,DEMO_MODE:String(demo),SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-key'})[key]},serve:fn=>{handler=fn}},Request,Response,URL});
 return {calls,async request(body,{token='valid',origin='https://glazed.example',method='POST'}={}){const headers={'Content-Type':'application/json',Origin:origin};if(token)headers.Authorization=`Bearer ${token}`;const r=await handler(new Request('https://example.supabase.co/functions/v1/onboarding',{method,headers,body:method==='POST'?JSON.stringify(body):undefined}));return{status:r.status,body:r.status===204?null:await r.json()}}};
}
const create={action:'create',business_name:'Shop',location_name:'First shop',location_address:'Main Street',request_id:'11111111-1111-4111-8111-111111111111'};
test('public registration status reveals availability only',async()=>{const h=harness();assert.deepEqual((await h.request({action:'status'},{token:null})).body,{available:true});assert.equal(h.calls.at(-1).name,'business_registration_status')});
test('demo never checks registration or creates businesses',async()=>{const h=harness({demo:true});assert.equal((await h.request({action:'status'})).body.available,false);assert.equal((await h.request(create)).status,403);assert.equal(h.calls.length,0)});
test('missing origin configuration and foreign origins fail closed',async()=>{assert.equal((await harness({appUrl:''}).request(create)).status,503);assert.equal((await harness().request(create,{origin:'https://evil.example'})).status,403);assert.equal((await harness().request(null,{method:'GET'})).status,405)});
test('business context is permitted by CORS',async()=>{const h=harness();assert.equal((await h.request(null,{method:'OPTIONS'})).status,204)});
test('creation requires valid identity and email rather than synthetic username',async()=>{for(const token of[null,'invalid']){const h=harness();assert.equal((await h.request(create,{token})).status,401);assert.equal(h.calls.some(c=>c.name==='create_business'),false)}assert.equal((await harness({email:'user@users.glazed.invalid'}).request(create)).status,403)});
test('creation forwards the user JWT using only the public API key',async()=>{const h=harness();assert.equal((await h.request({...create,p_actor:'attacker',role:'owner'})).status,200);assert.equal(h.calls[0].key,'public-key');assert.equal(h.calls[0].options.global.headers.Authorization,'Bearer valid');assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1))),{name:'create_business',args:{p_name:'Shop',p_location_name:'First shop',p_location_address:'Main Street',p_request_id:create.request_id}})});
test('invalid details cannot reach atomic create',async()=>{for(const change of[{business_name:''},{business_name:'a'.repeat(121)},{location_name:3},{location_address:''},{request_id:'bad'}]){const h=harness();assert.equal((await h.request({...create,...change})).status,400);assert.equal(h.calls.some(c=>c.name==='create_business'),false)}});
test('old private-code owner claiming is unavailable',async()=>{for(const action of['locations','complete'])assert.equal((await harness().request({...create,action,setup_code:'old-code'})).status,400)});
test('database registration gates cannot be bypassed by edge requests',async()=>{const h=harness({createError:{code:'42501',message:'secret'}});const r=await h.request(create);assert.equal(r.status,403);assert.equal(JSON.stringify(r.body).includes('secret'),false)});
