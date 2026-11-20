import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../../src/features/portal/cartStore.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source.replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('cart resolves storage after auth and keeps cart lines and pickup shops per business',()=>{
 let key='original',reads=0;const values=new Map([['cart:a',JSON.stringify({lines:[{item_id:5,qty:2}],location_id:10})]]);const exports={};
 vm.runInNewContext(code,{exports,businessStorageKey:()=>`cart:${key}`,readStorage:k=>{reads++;return values.get(k)??null;},writeStorage:(k,v)=>values.set(k,v),useMemo:f=>f(),useSyncExternalStore:(_subscribe,snapshot)=>snapshot()});
 assert.equal(reads,0);key='a';assert.equal(exports.useCart().count,2);assert.equal(exports.useCart().location_id,10);
 exports.useCart().add(5);assert.equal(exports.useCart().count,3);assert.equal(reads,1);
 key='b';assert.equal(exports.useCart().count,0);assert.equal(exports.useCart().location_id,null);exports.useCart().add(8);exports.useCart().setLocation(20);
 key='a';assert.equal(exports.useCart().count,3);assert.equal(exports.useCart().location_id,10);
 key='b';assert.equal(exports.useCart().count,1);assert.equal(exports.useCart().lines[0].item_id,8);assert.equal(exports.useCart().location_id,20);
});
