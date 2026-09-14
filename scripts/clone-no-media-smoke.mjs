const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9335';
const appUrlMatch = process.env.APP_URL_MATCH || '127.0.0.1';
const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === 'page' && item.url.includes(appUrlMatch));
if (!page?.webSocketDebuggerUrl) throw new Error(`Página do app não encontrada (${appUrlMatch}).`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const payload = JSON.parse(String(event.data));
  if (!payload.id || !pending.has(payload.id)) return;
  const request = pending.get(payload.id);
  pending.delete(payload.id);
  if (payload.error) request.reject(new Error(payload.error.message));
  else request.resolve(payload.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Erro ao avaliar a página.');
  return result.result?.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression, label, timeout = 35_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await sleep(180);
  }
  throw new Error(`Tempo esgotado: ${label}`);
};
const setField = (selector, value, prototypeName = 'HTMLInputElement') => evaluate(`(() => {
  const field = document.querySelector(${JSON.stringify(selector)});
  if (!field) return false;
  const setter = Object.getOwnPropertyDescriptor(window[${JSON.stringify(prototypeName)}].prototype, 'value').set;
  setter.call(field, ${JSON.stringify(value)});
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

await send('Network.enable');
await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi'
});
await evaluate(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({
  farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
  farm_name: 'Campo Legado Consultoria',
  employee_id: 'administrador-campo-legado',
  employee_name: 'Administrador',
  employee_role: 'Administrador',
  is_admin: true,
  device_id: 'qa-clone-no-media'
})); localStorage.setItem('campo_legado_test_period_reset_2026_08_03_v1', 'true'); localStorage.setItem('campo_legado_remove_legacy_records_v1', 'true'); localStorage.setItem('error_cleanup_v1', 'true'); location.hash = '#/anomalies/list';`);
await send('Page.reload', { ignoreCache: true });
console.log('Página carregada; aguardando cache offline.');
await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent.includes('Exportar OS'))`, 'banco local inicializado');
await waitFor(`navigator.serviceWorker?.getRegistration().then(Boolean)`, 'service worker registrado');
await send('Page.reload', { ignoreCache: false });
await waitFor(`navigator.serviceWorker.controller !== null`, 'app controlado pelo cache offline');
console.log('App controlado pelo cache offline.');

await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
  connectionType: 'none'
});

await evaluate(`new Promise((resolve, reject) => {
  const request = indexedDB.open('CampoLegado_TESTE_Supabase_Web_v1');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction(['employees', 'clients', 'anomalies'], 'readwrite');
    const now = new Date().toISOString();
    transaction.objectStore('employees').put({
      id: 'qa-tecnico-clone', synced: true, updated_at: now,
      data: { id: 'qa-tecnico-clone', name: 'Técnico Clone QA', role: 'Técnico', status: 'active' }
    });
    transaction.objectStore('clients').put({
      id: 'qa-cliente-clone', synced: true, updated_at: now,
      data: { id: 'qa-cliente-clone', name: 'Cliente Clone QA', status: 'active' }
    });
    transaction.objectStore('anomalies').put({
      id: 'qa-clone-source', synced: true, updated_at: now,
      data: {
        id: 'qa-clone-source', farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
        employee_id: 'administrador-campo-legado', employee_name: 'Administrador',
        createdByEmployeeId: 'administrador-campo-legado', createdByEmployeeName: 'Administrador',
        technicianId: 'qa-tecnico-clone', responsible: 'Técnico Clone QA', recordType: 'service_order',
        createdAt: '2026-08-25T12:00:00.000Z', serviceDate: '2026-08-25', clientName: 'Cliente Clone QA',
        serviceOrderType: 'despesa', visitValue: 100, kmQuantity: 10, kmValue: 50,
        additionalExpenseValue: 20, additionalExpenseDescription: 'Pedágio original',
        description: 'Observação original', sector: 'Ordem de Serviço', immediateSolution: '',
        location: { latitude: -23.37, longitude: -47.79, accuracy: 9, capturedAt: '2026-08-25T12:00:00.000Z', address: 'Endereço original' },
        media: [
          { id: 'qa-original-photo', type: 'photo', mimeType: 'image/png', name: 'foto-original.png', uri: 'data:image/png;base64,AA==' },
          { id: 'qa-original-document', type: 'pdf', mimeType: 'application/pdf', name: 'documento-original.pdf', uri: '' },
          { id: 'qa-original-signature', type: 'photo', mimeType: 'image/png', name: 'assinatura-original.png', uri: 'data:image/png;base64,AA==', purpose: 'client_signature' }
        ]
      }
    });
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => reject(transaction.error);
  };
})`);
console.log('Fixture local da OS original criada.');

await evaluate(`location.hash = '#/anomalies/clone/qa-clone-source'`);
await sleep(4_000);
console.log(await evaluate(`JSON.stringify({ hash: location.hash, body: document.body.textContent.slice(0, 500) })`));
await waitFor(`document.body.textContent.includes('Revise a nova OS') && document.body.textContent.includes('0/5')`, 'formulário completo de clonagem');
console.log('Formulário de clonagem carregado.');
const formState = await evaluate(`(() => {
  const selectors = [...document.querySelectorAll('button[aria-haspopup="dialog"]')];
  const typeButtons = [...document.querySelectorAll('fieldset button')].filter((button) => /receita|despesa/i.test(button.textContent || ''));
  return {
    clientEnabled: selectors[0] ? !selectors[0].disabled : false,
    technicianEnabled: selectors[1] ? !selectors[1].disabled : false,
    typeEnabled: typeButtons.length === 2 && typeButtons.every((button) => !button.disabled),
    notesEnabled: !document.querySelector('textarea')?.disabled,
    originalMediaVisible: /foto-original|documento-original|assinatura-original/i.test(document.body.textContent || '')
  };
})()`);
if (!formState.clientEnabled || !formState.technicianEnabled || !formState.typeEnabled || !formState.notesEnabled || formState.originalMediaVisible) {
  throw new Error(`Formulário de clonagem não está totalmente editável ou exibiu mídia antiga: ${JSON.stringify(formState)}`);
}

await setField('input[type="date"]', '2026-09-05');
await setField('input[aria-label="Valor da visita"]', '125,00');
await setField('input[aria-label="KM rodados"]', '12,5');
await setField('input[aria-label="Valor total do deslocamento"]', '78,90');
await setField('input[aria-label="Outros valores a receber"]', '30,00');
await setField('textarea', 'Observação alterada na clonagem', 'HTMLTextAreaElement');
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Criar OS clonada'))?.click()`);
await waitFor(`location.hash.includes('/anomalies/detail/') && !location.hash.endsWith('qa-clone-source')`, 'OS clonada salva');

const clonedRecords = await evaluate(`new Promise((resolve, reject) => {
  const request = indexedDB.open('CampoLegado_TESTE_Supabase_Web_v1');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction('anomalies', 'readonly');
    const getAll = transaction.objectStore('anomalies').getAll();
    getAll.onsuccess = () => {
      const rows = getAll.result.map((row) => row.data);
      database.close();
      resolve(rows);
    };
    getAll.onerror = () => reject(getAll.error);
  };
})`);
const original = clonedRecords.find((item) => item.id === 'qa-clone-source');
const clone = clonedRecords.find((item) => item.id !== 'qa-clone-source'
  && item.clientName === 'Cliente Clone QA'
  && item.description === 'Observação alterada na clonagem');
if (!original || !clone) throw new Error('OS original ou clonada não encontrada no banco local.');
if (original.media?.length !== 3) throw new Error('A mídia da OS original foi alterada.');
if ((clone.media || []).length !== 0) throw new Error('A OS clonada ainda recebeu fotos, documentos ou assinatura da original.');
if (clone.serviceDate !== '2026-09-05' || clone.kmQuantity !== 12.5 || clone.kmValue !== 78.9 || clone.visitValue !== 125 || clone.additionalExpenseValue !== 30 || clone.description !== 'Observação alterada na clonagem') {
  throw new Error(`Os campos editados não foram preservados na clonagem: ${JSON.stringify(clone)}`);
}

await evaluate(`new Promise((resolve, reject) => {
  localStorage.clear();
  sessionStorage.clear();
  const request = indexedDB.open('CampoLegado_TESTE_Supabase_Web_v1');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction(['employees', 'clients', 'anomalies', 'outbox'], 'readwrite');
    transaction.objectStore('employees').clear();
    transaction.objectStore('clients').clear();
    transaction.objectStore('anomalies').clear();
    transaction.objectStore('outbox').clear();
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => reject(transaction.error);
  };
})`);
await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi'
});
console.log(JSON.stringify({
  ok: true,
  cloneFormEditable: formState,
  clonedFieldsChanged: true,
  clonedMediaCount: clone.media?.length || 0,
  originalMediaCount: original.media?.length || 0,
  supabaseWrites: false,
  fixtureScope: 'IndexedDB local, removida ao final'
}, null, 2));
socket.close();
