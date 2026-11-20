import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/lib/businessContext.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const business={business_id:'00000000-0000-4000-8000-000000000001',name:'Original',slug:'glazed'};
function tab({demo=false,values=new Map(),blocked=false}={}){
 if(demo)values.set('glazed-demo-v1','true');
 const storage={getItem:k=>{if(blocked)throw Error('Storage blocked');return values.get(k)??null;},setItem:(k,v)=>{if(blocked)throw Error('Storage blocked');values.set(k,v);},removeItem:k=>values.delete(k)};
 const exports={};vm.runInNewContext(code,{exports,sessionStorage:storage});return { ...exports, values };
}
test('business selection persists for its tab and scopes per-business records',()=>{
 const one=tab();one.selectBusiness(business);const first=one.businessStorageKey('cart');
 one.selectBusiness({...business,business_id:'00000000-0000-4000-8000-000000000002',slug:'second'});
 assert.notEqual(one.businessStorageKey('cart'),first);assert.equal(one.shopPath('/cart'),'/b/second/shop/cart');
 assert.equal(tab({values:one.values}).selectedBusiness().slug,'second');assert.equal(tab().selectedBusiness(),null);
});
test('real and demo cart/location namespaces differ even with the same business UUID',()=>{
 const real=tab(),demo=tab({demo:true});real.selectBusiness(business);demo.selectBusiness(business);
 for(const key of ['cart','location'])assert.notEqual(real.businessStorageKey(key),demo.businessStorageKey(key));
});
test('corrupt stored selection is ignored and original shop links remain compatible',()=>{
 const current=tab({values:new Map([['glazed-business-v1','not json']])});assert.equal(current.selectedBusiness(),null);
 current.selectBusiness(business);assert.equal(current.shopPath('/login'),'/shop/login');
 current.selectBusiness(null);assert.equal(current.selectedBusiness(),null);
});
test('blocked storage fails before changing the selected business',()=>{
 const current=tab({blocked:true});assert.equal(current.selectedBusiness(),null);
 assert.throws(()=>current.selectBusiness(business),/storage|site data|browser/i);assert.equal(current.selectedBusiness(),null);
});
