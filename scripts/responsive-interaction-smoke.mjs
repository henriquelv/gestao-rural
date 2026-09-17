/* global process, Buffer */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const endpoint=process.env.CDP_ENDPOINT||'http://127.0.0.1:9348';
const origin=process.env.APP_URL||'http://127.0.0.1:3000';
const pages=await fetch(`${endpoint}/json/list`).then(response=>response.json());
const page=pages.find(item=>item.type==='page'&&(item.url==='about:blank'||item.url.startsWith(origin)));assert.ok(page?.webSocketDebuggerUrl);
const socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let sequence=0;const pending=new Map();socket.addEventListener('message',event=>{const data=JSON.parse(String(event.data));const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.error?task.reject(Error(data.error.message)):task.resolve(data.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result?.value;};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(expression,label)=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`).catch(()=>false))return;await wait(50);}throw Error(`Timeout: ${label}`);};
const context={farm_id:'11111111-1111-4111-8111-111111111111',farm_name:'Campo Legado QA',employee_id:'qa-responsive',employee_name:'Técnico QA',employee_role:'Técnico',device_id:'qa-responsive-device',is_admin:false};
const artifacts=await mkdtemp(join(tmpdir(),'campo-legado-responsive-'));
try{
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(navigator,'onLine',{get:()=>false});localStorage.setItem('gestao_rural_farm_context_v2',JSON.stringify(${JSON.stringify(context)}));['campo_legado_test_period_reset_2026_08_03_v1','campo_legado_remove_legacy_records_v1','error_cleanup_v1'].forEach(k=>localStorage.setItem(k,'true'));`});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:`${origin}/#/`});await until(`document.querySelectorAll('section[aria-label="Módulos disponíveis"] button').length>=5`,'desktop home');
  await wait(900);
  const desktop=await evaluate(`(()=>{const shell=document.querySelector('.campo-app-shell');const cards=[...document.querySelectorAll('section[aria-label="Módulos disponíveis"] button')].map(button=>button.getBoundingClientRect());return {shellWidth:shell.getBoundingClientRect().width,viewport:innerWidth,firstRow:cards.filter(card=>Math.abs(card.top-cards[0].top)<3).length};})()`);
  assert.ok(desktop.shellWidth>=1100&&desktop.shellWidth<desktop.viewport);assert.equal(desktop.firstRow,3);
  const homeImage=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'desktop-home.png'),Buffer.from(homeImage.data,'base64'));
  const point=await evaluate(`(()=>{const button=document.querySelector('section[aria-label="Módulos disponíveis"] button');const box=button.getBoundingClientRect();return{x:box.left+box.width/2,y:box.top+box.height/2};})()`);
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await wait(30);
  const pressed=await evaluate(`(()=>{const button=document.querySelector('section[aria-label="Módulos disponíveis"] button');return{className:button.classList.contains('campo-pressed'),transform:getComputedStyle(button).transform};})()`);
  assert.equal(pressed.className,true);assert.notEqual(pressed.transform,'none');
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(150);assert.equal(await evaluate(`document.querySelector('.campo-pressed')===null`),true);
  await send('Page.navigate',{url:`${origin}/#/fuelings`});await until(`document.body.innerText.includes('Histórico de abastecimentos')`,'fueling menu');
  const menuColumns=await evaluate(`(()=>{const buttons=[...document.querySelectorAll('main button')].map(button=>button.getBoundingClientRect());return buttons.filter(box=>Math.abs(box.top-buttons[0].top)<3).length;})()`);assert.equal(menuColumns,2);
  const menuImage=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'desktop-fuel-menu.png'),Buffer.from(menuImage.data,'base64'));
  await send('Page.navigate',{url:`${origin}/#/fuelings/new`});await until(`document.body.innerText.includes('SALVAR ABASTECIMENTO')`,'desktop form');
  const formColumns=await evaluate(`(()=>{const cards=[...document.querySelectorAll('form>section')].map(section=>section.getBoundingClientRect());return cards.filter(box=>Math.abs(box.top-cards[0].top)<3).length;})()`);assert.equal(formColumns,3);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:720,deviceScaleFactor:1,mobile:true});await send('Page.reload',{ignoreCache:true});await until(`document.body.innerText.includes('SALVAR ABASTECIMENTO')`,'mobile form');
  const mobile=await evaluate(`(()=>{const shell=document.querySelector('.campo-app-shell');const main=document.querySelector('main');return{shellWidth:shell.getBoundingClientRect().width,scrollHeight:main.scrollHeight,clientHeight:main.clientHeight,touchAction:getComputedStyle(main).touchAction};})()`);assert.ok(mobile.shellWidth<=390);assert.ok(mobile.scrollHeight>mobile.clientHeight);assert.equal(mobile.touchAction,'pan-y');
  console.log(JSON.stringify({ok:true,desktop:{viewport:desktop.viewport,shellWidth:desktop.shellWidth,homeColumns:desktop.firstRow,fuelingMenuColumns:menuColumns,formColumns},touchFeedback:true,mobile,screenshots:{home:join(artifacts,'desktop-home.png'),fuelingMenu:join(artifacts,'desktop-fuel-menu.png')}}));
}catch(error){console.error(await evaluate(`JSON.stringify({url:location.href,body:document.body?.innerText.slice(0,1200)})`).catch(()=>''));throw error;}
finally{await send('Storage.clearDataForOrigin',{origin,storageTypes:'all'}).catch(()=>{});socket.close();}
