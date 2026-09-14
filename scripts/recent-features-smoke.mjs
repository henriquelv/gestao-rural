import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const endpoint=process.env.CDP_ENDPOINT||'http://127.0.0.1:9340';
const pages=await fetch(`${endpoint}/json/list`).then(response=>response.json());
const page=pages.find(item=>item.type==='page'&&item.url.includes('127.0.0.1'));
if(!page?.webSocketDebuggerUrl)throw new Error('Página local do app não encontrada.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let sequence=0;const pending=new Map();
socket.addEventListener('message',event=>{const payload=JSON.parse(String(event.data));if(!payload.id||!pending.has(payload.id))return;const request=pending.get(payload.id);pending.delete(payload.id);payload.error?request.reject(new Error(payload.error.message)):request.resolve(payload.result);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result?.value;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(expression,label,timeout=30000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await sleep(180);}throw new Error(`Tempo esgotado: ${label}`);};
const text=value=>`document.body.innerText.toLocaleLowerCase('pt-BR').includes(${JSON.stringify(value.toLocaleLowerCase('pt-BR'))})`;
const click=value=>evaluate(`(()=>{const value=${JSON.stringify(value.toLocaleLowerCase('pt-BR'))};const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim().toLocaleLowerCase('pt-BR').includes(value));if(!button)return false;button.click();return true;})()`);
const setInput=(selector,value,index=0)=>evaluate(`(()=>{const input=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!input)return false;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
const origin=new URL(page.url).origin;const downloadDir=await mkdtemp(join(tmpdir(),'campo-legado-fuel-'));
const results=[];const check=async(name,expression)=>{const ok=Boolean(await evaluate(expression));results.push({name,ok});if(!ok)throw new Error(`Falhou: ${name}`);};
try{
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await send('Network.enable');
  await send('Storage.clearDataForOrigin',{origin,storageTypes:'all'});await evaluate(`location.hash='#/'`);await send('Page.reload',{ignoreCache:true});
  await waitFor(`document.querySelector('input[placeholder="TESTE"]')!==null`,'ativação');await setInput('input[placeholder="TESTE"]','TESTE');await evaluate(`document.querySelector('button[title="Validar código"]')?.click()`);
  await waitFor(`document.querySelector('button[aria-haspopup="dialog"]')!==null`,'seletor de perfil');await evaluate(`document.querySelector('button[aria-haspopup="dialog"]')?.click()`);await waitFor(text('Administrador'),'administrador');await click('Administrador');await setInput('input[aria-label^="Senha do perfil"]','1234');await click('Concluir ativação');
  await waitFor(text('Abastecimentos'),'home');await check('Home possui sete módulos para o administrador',`document.querySelectorAll('section[aria-label="Módulos disponíveis"] > button').length===7`);await check('Indicadores individuais visíveis',text('Indicadores da Fazenda'));await check('Consolidado administrativo visível',text('Gestão Campo Legado'));
  await evaluate(`location.hash='#/anomalies/clients'`);await waitFor(text('Carteira de clientes'),'painel de clientes');await check('Painel de clientes abre',text('Clientes mais atendidos'));
  await evaluate(`location.hash='#/fuelings'`);await waitFor(text('Controle de combustível'),'abastecimentos');await waitFor(`document.querySelector('input[placeholder="Ex.: Corolla Cross"]')!==null`,'formulário');
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none'});
  await setInput('input[placeholder="Ex.: Corolla Cross"]','Veículo QA Offline');await setInput('input[placeholder="0,0 km"]','12345');await setInput('input[placeholder="0,00"]','638',0);await setInput('input[placeholder="0,00"]','10000',1);await click('Salvar abastecimento');
  await waitFor(`${text('Histórico')}&&${text('Veículo QA Offline')}`,'salvamento offline');await check('Abastecimento aparece no histórico',text('Veículo QA Offline'));await check('Litros calculados automaticamente',text('15,67'));
  await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});await click('Exportar todos em CSV');
  const started=Date.now();let csv='';while(Date.now()-started<15000){csv=(await readdir(downloadDir)).find(name=>name.endsWith('.csv'))||'';if(csv)break;await sleep(200);}if(!csv)throw new Error('CSV não foi baixado.');const content=await readFile(join(downloadDir,csv),'utf8');if(!content.includes('Veículo QA Offline'))throw new Error('CSV não contém o lançamento.');results.push({name:'CSV contém o lançamento',ok:true});
  console.log(JSON.stringify({ok:true,results},null,2));
}finally{
  try{await send('Storage.clearDataForOrigin',{origin,storageTypes:'all'});}finally{await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1,connectionType:'wifi'});socket.close();await rm(downloadDir,{recursive:true,force:true});}
}
