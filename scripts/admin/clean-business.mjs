// Administrative one-time cleanup. Default is local rehearsal; --apply requires a restored-backup manifest.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../seed/package.json',import.meta.url));
const postgres=require('postgres');
const ref='wzsbtfzettxpczgulibd';
const samples=['owner@example.com','admin@example.com','manager@example.com','cashier.provo@example.com','cashier.orem@example.com','baker@example.com','ava@example.com','liam@example.com'];
const apply=process.argv.includes('--apply');
const url=apply?process.env.DATABASE_URL:'postgresql://postgres@127.0.0.1:55439/postgres';
const u=new URL(url);
if(apply && !(u.hostname===`db.${ref}.supabase.co` || (u.hostname.endsWith('.pooler.supabase.com')&&u.username===`postgres.${ref}`)))throw Error('Wrong cleanup target');
const sql=postgres(url,{max:1,connect_timeout:15,onnotice:()=>{},transform:{undefined:null}});
const privateDir='.env.cleanup-backups';
async function manifest(s){
 await s`select set_config('TimeZone','UTC',false)`;
 const tables=await s`select tablename from pg_tables where schemaname='public' order by tablename`;
 const out={};
 for(const t of [...tables.map(r=>`public.${r.tablename}`),'auth.users']){
  const [r]=await s.unsafe(`select count(*)::int n,md5(coalesce(string_agg(h,'' order by h),'')) hash from (select md5(to_jsonb(t)::text) h from ${t} t) x`);out[t]=r;
 }
 return out;
}
try{
 const [tenantSchema]=await sql`select to_regclass('public.businesses') is not null as present`;
 if(tenantSchema.present)throw Error('Legacy global cleanup is retired for multi-business databases.');
 if(!apply){const m=await manifest(sql);fs.writeFileSync(privateDir+'/restored-manifest.json',JSON.stringify(m),{mode:0o600});}
 await sql.begin(async tx=>{
  await tx.unsafe("set local lock_timeout='10s'; set local statement_timeout='90s'");
  const ts=await tx`select tablename from pg_tables where schemaname='public' order by tablename`;
  // Also blocks Auth signup trigger and concurrent existing application writes.
  await tx.unsafe('lock table auth.users,'+ts.map(t=>`public."${t.tablename}"`).join(',')+' in access exclusive mode');
  const before=await manifest(tx);
  assert.deepEqual(before,JSON.parse(fs.readFileSync(privateDir+'/restored-manifest.json','utf8')),'Data changed since backup. Take and rehearse a fresh backup.');
  await tx`select set_config('glazed.cleanup_authorized',${ref},true), set_config('glazed.sample_emails',${'{'+samples.join(',')+'}'},true)`;
  await tx.unsafe(fs.readFileSync(new URL('./clean-business.sql',import.meta.url),'utf8'));
  const [checks]=await tx`select (select count(*)::int from profiles) profiles,(select count(*)::int from profiles where role='owner') owners,(select count(*)::int from locations) locations,(select count(*)::int from customers) customers,(select completed_at is not null from business_setup where id=1) closed`;
  assert.equal(checks.profiles,3);assert.equal(checks.owners,1);assert.equal(checks.locations,0);assert.equal(checks.customers,3);assert.equal(checks.closed,true);
  fs.writeFileSync(privateDir+(apply?'/live-result.json':'/rehearsal-result.json'),JSON.stringify(await manifest(tx)),{mode:0o600});
  if(!apply){console.log('Backup verified; cleanup rehearsal passed',checks);throw Object.assign(Error('rollback rehearsal'),{rehearsal:true});}
  console.log('Permanent business cleanup checks passed',checks);
 });
}catch(e){if(!e.rehearsal)throw e;}finally{await sql.end()}
