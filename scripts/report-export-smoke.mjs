import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const waitFor = async (expression, label, timeout = 40_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await sleep(180);
  }
  throw new Error(`Tempo esgotado: ${label}`);
};
const buttonWith = (text) => `[...document.querySelectorAll('button')].find((button) => button.textContent.toLocaleLowerCase('pt-BR').includes(${JSON.stringify(text.toLocaleLowerCase('pt-BR'))}))`;
const setInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

const origin = new URL(page.url).origin;
const downloadDirectory = await mkdtemp(join(tmpdir(), 'campo-legado-export-'));
await send('Network.enable');
await send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
  connectionType: 'wifi'
});
console.log('Preparando navegador de teste...');
await evaluate(`localStorage.clear(); sessionStorage.clear(); location.hash = '#/';`);
await send('Page.reload', { ignoreCache: true });
await waitFor(`document.readyState === 'complete'`, 'carregamento inicial do app');
await waitFor(`navigator.serviceWorker?.getRegistration().then(Boolean)`, 'service worker registrado');
await send('Page.reload', { ignoreCache: false });
await waitFor(`navigator.serviceWorker.controller !== null`, 'app controlado pelo cache offline');
console.log('Cache offline preparado.');

// A partir daqui o navegador fica sem rede. Assim nem a preparação nem a
// limpeza das fixtures podem consultar ou gravar dados no Supabase.
await send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
  connectionType: 'none'
});
console.log('Rede desativada para isolar as fixtures.');
await evaluate(`(async () => {
  const databaseName = 'CampoLegado_TESTE_Supabase_Web_v1';
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === databaseName)) return true;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const names = ['anomalies', 'outbox'].filter((name) => database.objectStoreNames.contains(name));
      if (!names.length) {
        database.close();
        const deletion = indexedDB.deleteDatabase(databaseName);
        deletion.onsuccess = () => resolve(true);
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () => reject(new Error('Base local de QA bloqueada.'));
        return;
      }
      const transaction = database.transaction(names, 'readwrite');
      names.forEach((name) => transaction.objectStore(name).clear());
      transaction.oncomplete = () => { database.close(); resolve(true); };
      transaction.onerror = () => reject(transaction.error);
    };
  });
})()`);
console.log('Base local de QA limpa.');
await evaluate(`localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({
  farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
  farm_name: 'Campo Legado Consultoria',
  employee_id: 'administrador-campo-legado',
  employee_name: 'Administrador',
  employee_role: 'Administrador',
  is_admin: true,
  device_id: 'qa-export-read-only'
})); localStorage.setItem('campo_legado_test_period_reset_2026_08_03_v1', 'true'); localStorage.setItem('campo_legado_remove_legacy_records_v1', 'true'); localStorage.setItem('error_cleanup_v1', 'true'); location.hash = '#/anomalies/list';`);
await send('Page.reload', { ignoreCache: false });
await waitFor(`${buttonWith('Exportar OS')} !== undefined`, 'tela de exportações');
console.log('App e cache offline prontos.');

// A fixture vive somente no IndexedDB deste navegador e nunca é enviada ao Supabase.
// Ela garante que os três documentos realmente incorporem uma foto e uma assinatura.
const photoSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#dfeadb"/><circle cx="400" cy="220" r="125" fill="#3f7457"/><text x="400" y="430" text-anchor="middle" font-size="50" font-family="serif" fill="#173f32">FOTO DA VISITA</text></svg>').toString('base64');
const signatureSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="260"><path d="M70 170 C180 25 225 245 345 105 S520 220 650 90 S760 175 840 90" fill="none" stroke="#173f32" stroke-width="12" stroke-linecap="round"/><path d="M100 215 H810" stroke="#8fa096" stroke-width="3"/></svg>').toString('base64');
await evaluate(`new Promise((resolve, reject) => {
  const request = indexedDB.open('CampoLegado_TESTE_Supabase_Web_v1');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction('anomalies', 'readwrite');
    transaction.objectStore('anomalies').put({
      id: 'qa-export-media-os',
      updated_at: new Date().toISOString(),
      synced: true,
      data: {
        id: 'qa-export-media-os',
        farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
        employee_id: 'administrador-campo-legado',
        employee_name: 'Administrador',
        createdByEmployeeId: 'administrador-campo-legado',
        createdByEmployeeName: 'Administrador',
        recordType: 'service_order',
        createdAt: '2026-08-23T12:00:00.000Z',
        serviceDate: '2026-08-23',
        clientName: 'Cliente Exportação QA',
        serviceOrderType: 'despesa',
        visitValue: 150.25,
        kmQuantity: 87.5,
        kmValue: 214.90,
        additionalExpenseValue: 35.40,
        additionalExpenseDescription: 'Pedágio',
        responsible: 'Administrador',
        sector: '',
        description: 'Fixture local para validar documentos, imagem e assinatura.',
        immediateSolution: '',
        location: { latitude: -23.374866, longitude: -47.791233, accuracy: 8, capturedAt: '2026-08-23T12:00:00.000Z', address: 'Endereço de validação local' },
        media: [
          { id: 'qa-export-photo', type: 'photo', mimeType: 'image/svg+xml', name: 'foto-visita.svg', uri: 'data:image/svg+xml;base64,${photoSvg}' },
          { id: 'qa-export-signature', type: 'photo', mimeType: 'image/svg+xml', name: 'assinatura-cliente.svg', uri: 'data:image/svg+xml;base64,${signatureSvg}', purpose: 'client_signature' },
          { id: 'qa-export-document', type: 'pdf', mimeType: 'application/pdf', name: 'relatorio-visita.pdf', uri: '' }
        ]
      }
    });
    transaction.objectStore('anomalies').put({
      id: 'qa-export-previous-month-os',
      updated_at: new Date().toISOString(),
      synced: true,
      data: {
        id: 'qa-export-previous-month-os',
        farm_id: 'ca4f1e9a-2026-4e57-8000-000000000001',
        employee_id: 'administrador-campo-legado',
        employee_name: 'Administrador',
        createdByEmployeeId: 'administrador-campo-legado',
        createdByEmployeeName: 'Administrador',
        recordType: 'service_order',
        createdAt: '2026-07-18T12:00:00.000Z',
        serviceDate: '2026-07-18',
        clientName: 'Cliente Comparativo QA',
        serviceOrderType: 'receita',
        projectValue: 600,
        paymentStatus: 'recebido',
        responsible: 'Administrador',
        sector: '',
        description: 'Fixture local do comparativo mensal.',
        immediateSolution: '',
        media: []
      }
    });
    transaction.oncomplete = () => { database.close(); resolve(true); };
    transaction.onerror = () => reject(transaction.error);
  };
})`);
console.log('Fixture local com foto e assinatura criada.');
await evaluate(`location.hash = '#/';`);
await waitFor(`location.hash === '#/'`, 'saída da lista');
await evaluate(`location.hash = '#/anomalies/list';`);
await waitFor(`${buttonWith('Exportar OS')} !== undefined`, 'retorno à lista offline');
await setInput('input[type="search"]', 'Cliente Exportação QA');
await waitFor(`document.body.textContent.includes('1 de ')`, 'filtro da fixture local');
console.log('Fixture isolada pelos filtros.');
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });

const waitForDownloaded = async (extension, previous = []) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const files = await readdir(downloadDirectory);
    const found = files.find((name) => name.toLowerCase().endsWith(extension) && !name.endsWith('.crdownload') && !previous.includes(name));
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`Download ${extension} não concluído.`);
};

const exports = {};
for (const [label, extension, key] of [
  ['Excel completo', '.xlsx', 'xlsx'],
  ['PDF detalhado', '.pdf', 'pdf'],
  ['Word editável', '.docx', 'docx'],
  ['CSV leve', '.csv', 'csv']
]) {
  console.log(`Gerando ${label}...`);
  const previous = await readdir(downloadDirectory);
  await evaluate(`${buttonWith('Exportar OS')}?.click()`);
  await waitFor(`document.querySelector('[role="dialog"][aria-labelledby="export-orders-title"]') !== null`, 'modal de exportação');
  await evaluate(`${buttonWith(label)}?.click()`);
  exports[key] = await waitForDownloaded(extension, previous);
  await waitFor(`document.querySelector('[role="dialog"][aria-labelledby="export-orders-title"]') === null`, `conclusão ${label}`, 60_000);
  console.log(`${label} concluído.`);
}

console.log('Gerando relatório mensal com comparativo...');
const previousMonthlyFiles = await readdir(downloadDirectory);
await evaluate(`${buttonWith('Relatório mensal')}?.click()`);
await waitFor(`document.querySelector('[role="dialog"][aria-labelledby="monthly-report-title"]') !== null`, 'modal do relatório mensal');
await waitFor(`document.body.textContent.toLocaleLowerCase('pt-BR').includes('comparação com o mês anterior')`, 'descrição do comparativo mensal');
await evaluate(`${buttonWith('Baixar PDF')}?.click()`);
exports.monthlyPdf = await waitForDownloaded('.pdf', previousMonthlyFiles);
await waitFor(`${buttonWith('Baixar PDF')}?.disabled === false`, 'conclusão do relatório mensal', 60_000);
console.log('Relatório mensal concluído.');

const xlsx = await readFile(join(downloadDirectory, exports.xlsx));
const docx = await readFile(join(downloadDirectory, exports.docx));
const pdf = await readFile(join(downloadDirectory, exports.pdf));
const monthlyPdf = await readFile(join(downloadDirectory, exports.monthlyPdf));
const csv = await readFile(join(downloadDirectory, exports.csv), 'utf8');
const binaryIncludes = (buffer, text) => buffer.includes(Buffer.from(text));
const ExcelJSImport = await import('exceljs');
const ExcelJS = ExcelJSImport.default || ExcelJSImport;
const parsedWorkbook = new ExcelJS.Workbook();
await parsedWorkbook.xlsx.load(xlsx);
const expectedSheets = ['Resumo gerencial', 'Ordens de Serviço', 'Imagens e assinaturas'];
if (xlsx.subarray(0, 2).toString() !== 'PK' || !binaryIncludes(xlsx, 'xl/media/') || !expectedSheets.every((name) => parsedWorkbook.getWorksheet(name))) {
  throw new Error('Excel inválido ou sem as abas gerencial, de dados e de imagens.');
}
const summarySheet = parsedWorkbook.getWorksheet('Resumo gerencial');
if (!String(summarySheet.getCell('A1').value).includes('RELATÓRIO GERENCIAL') || Number(summarySheet.getCell('A6').result ?? summarySheet.getCell('A6').value?.result) !== 1) {
  throw new Error('Resumo gerencial do Excel não contém os indicadores esperados.');
}
if (docx.subarray(0, 2).toString() !== 'PK' || !binaryIncludes(docx, 'word/media/')) {
  throw new Error('Word inválido ou sem imagens incorporadas.');
}
if (pdf.subarray(0, 5).toString() !== '%PDF-' || !binaryIncludes(pdf, '/Subtype /Image')) {
  throw new Error('PDF inválido ou sem imagens incorporadas.');
}
if (monthlyPdf.subarray(0, 5).toString() !== '%PDF-' || monthlyPdf.length < 10_000) {
  throw new Error('Relatório mensal em PDF inválido ou incompleto.');
}
const requiredColumns = ['Data da OS', 'KM rodados', 'Outros valores a receber (R$)', 'Valor pendente a receber (R$)', 'Impacto líquido da OS (R$)', 'Assinatura do cliente', 'Outros anexos', 'ID da OS'];
if (!requiredColumns.every((column) => csv.includes(column)) || !csv.includes('Cliente Exportação QA')) {
  throw new Error('CSV não contém as colunas ou a OS esperada.');
}

await evaluate(`localStorage.clear(); sessionStorage.clear(); new Promise((resolve, reject) => {
  const request = indexedDB.open('CampoLegado_TESTE_Supabase_Web_v1');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const names = ['anomalies', 'outbox'].filter((name) => database.objectStoreNames.contains(name));
    if (!names.length) { database.close(); resolve(true); return; }
    const transaction = database.transaction(names, 'readwrite');
    names.forEach((name) => transaction.objectStore(name).clear());
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
const keepExports = process.env.KEEP_EXPORTS === '1';
if (!keepExports) await rm(downloadDirectory, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  excel: { valid: true, managementSummary: true, sheets: expectedSheets, imagesEmbedded: true, bytes: xlsx.length, fileName: exports.xlsx },
  word: { valid: true, imagesEmbedded: true, bytes: docx.length, fileName: exports.docx },
  pdf: { valid: true, imagesEmbedded: true, bytes: pdf.length, fileName: exports.pdf },
  monthlyPdf: { valid: true, comparisonIncluded: true, bytes: monthlyPdf.length, fileName: exports.monthlyPdf },
  csv: { valid: true, columnsChecked: requiredColumns.length, fileName: exports.csv },
  databaseWrites: false,
  fixtureScope: 'IndexedDB local, removida ao final',
  ...(keepExports ? { outputDirectory: downloadDirectory } : {})
}, null, 2));
socket.close();
