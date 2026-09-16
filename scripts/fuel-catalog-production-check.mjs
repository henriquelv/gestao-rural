// Verificação de produção sem criar registros: leituras e escritas recusadas antes do BD.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const env = Object.fromEntries((await readFile('.env.local','utf8')).split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
assert.ok(env.VITE_SUPABASE_URL.includes('qkwgeahpctkjuqpamupi'), 'Somente o projeto TESTE.');
const base=process.env.APP_URL||'https://campo-legado-gestao-rural.vercel.app';
const employees=await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/employees?select=id,farm_id,role,status,access_pin,admin_pin`,{headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.VITE_SUPABASE_ANON_KEY}`}}).then(async r=>{assert.equal(r.status,200);return r.json();});
const url=`${base}/api/fueling/catalog`;
assert.equal((await fetch(`${url}?kind=vehicle`)).status,403);
assert.equal((await fetch(url,{method:'DELETE'})).status,405);
for(const role of ['Técnico','Administrador']){
  const user=employees.find(e=>e.role===role&&(!e.status||e.status==='active')&&(e.access_pin||e.admin_pin));assert.ok(user,`${role} ativo disponível`);
  const headers={'Content-Type':'application/json','x-campo-farm-id':user.farm_id,'x-campo-employee-id':String(user.id),'x-campo-admin-pin':user.access_pin||user.admin_pin};
  for(const kind of ['vehicle','station']){
    const response=await fetch(`${url}?kind=${kind}`,{headers});assert.equal(response.status,200,`${role}: ${kind}`);
    const {items}=await response.json();assert.ok(Array.isArray(items));assert.ok(items.every(row=>row.farm_id===user.farm_id&&String(row.employee_id)===String(user.id)));
    assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  }
  assert.equal((await fetch(`${url}?kind=unknown`,{headers})).status,400);
  const denied=await fetch(`${url}?kind=vehicle`,{method:'POST',headers,body:JSON.stringify({op:'upsert',payload:{id:'denied-qa-do-not-create',farm_id:user.farm_id,employee_id:'other-user-not-authorized',name:'Nunca salvar'}})});assert.equal(denied.status,403);
}
console.log(JSON.stringify({ok:true,production:true,technicianAndAdminOwnCatalogs:true,unauthorizedDenied:true,crossOwnerWriteDenied:true,cache:'no-store',createdRecords:0}));
