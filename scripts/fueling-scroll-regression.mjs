/* global process */
import assert from 'node:assert/strict';
const endpoint=process.env.CDP_ENDPOINT||'http://127.0.0.1:9340';
const origin=process.env.APP_URL||'https://campo-legado-gestao-rural.vercel.app';
const pages=await fetch(`${endpoint}/json/list`).then(r=>r.json());
const page=pages.find(item=>item.type==='page'&&(item.url==='about:blank'||item.url.startsWith(origin)));
assert.ok(page?.webSocketDebuggerUrl);
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
let seq=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(String(event.data));const job=pending.get(data.id);if(!job)return;pending.delete(data.id);data.error?job.reject(Error(data.error.message)):job.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const out=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(out.exceptionDetails)throw Error(out.exceptionDetails.text);return out.result?.value;};
const context={farm_id:'11111111-1111-4111-8111-111111111111',farm_name:'QA',employee_id:'qa-scroll',employee_name:'Técnico QA',employee_role:'Técnico',device_id:'qa-scroll-device',is_admin:false};
try{
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:720,deviceScaleFactor:1,mobile:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'onLine',{get:()=>false});localStorage.setItem('gestao_rural_farm_context_v2',JSON.stringify(${JSON.stringify(context)}));['campo_legado_test_period_reset_2026_08_03_v1','campo_legado_remove_legacy_records_v1','error_cleanup_v1'].forEach(k=>localStorage.setItem(k,'true'));`});
  const started=Date.now();await send('Page.navigate',{url:`${origin}/#/fuelings`});
  for(let i=0;i<200&&!await evaluate(`document.body?.innerText.includes('SALVAR ABASTECIMENTO')`);i++)await new Promise(r=>setTimeout(r,50));
  const before=await evaluate(`(()=>{const main=document.querySelector('main');return {scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,overflow:getComputedStyle(main).overflowY,bodyOverflow:getComputedStyle(document.body).overflow,touchAction:getComputedStyle(main).touchAction};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:600}]});
  for(const y of [540,480,420,360,300,240]){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y}]});await new Promise(r=>setTimeout(r,35));}
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await new Promise(r=>setTimeout(r,250));
  const result={...before,after:await evaluate(`document.querySelector('main').scrollTop`)};
  assert.ok(result.scrollHeight>result.clientHeight,'a tela precisa ter conteúdo rolável');assert.ok(result.after>0,'o gesto de toque precisa rolar a tela');assert.match(result.overflow,/auto|scroll/);
  console.log(JSON.stringify({ok:true,renderMs:Date.now()-started,...result}));
}finally{await send('Storage.clearDataForOrigin',{origin,storageTypes:'all'}).catch(()=>{});socket.close();}
