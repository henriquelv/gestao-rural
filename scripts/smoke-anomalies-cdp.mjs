const debugPort = process.env.CHROME_DEBUG_PORT || '9223';
const appUrl = process.env.SMOKE_APP_URL || 'http://127.0.0.1:3011';
const nativeMode = process.env.SMOKE_NATIVE === '1';
const anomalyCount = Number(process.env.SMOKE_ANOMALY_COUNT || '650');
const farmId = '00000000-0000-4000-8000-000000000001';

if (!Number.isInteger(anomalyCount) || anomalyCount < 1) {
  throw new Error(`SMOKE_ANOMALY_COUNT invalido: ${process.env.SMOKE_ANOMALY_COUNT}`);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page');
  if (!target) throw new Error('Nenhuma pagina do Chrome encontrada');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  return { socket, send };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function navigate(send, url) {
  await send('Page.navigate', { url });
  await wait(1800);
}

async function waitFor(send, expression, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(send, expression)) return;
    await wait(500);
  }
  throw new Error(`Tempo esgotado aguardando: ${expression}`);
}

const { socket, send } = await connect();
try {
  console.log('[smoke] habilitando Chrome');
  await send('Page.enable');
  await send('Runtime.enable');
  await navigate(send, `${appUrl}/`);

  console.log('[smoke] configurando contexto local');
  await evaluate(send, `(() => {
    localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({
      farm_id: '${farmId}', farm_name: 'Smoke Test', employee_id: 'employee-1',
      employee_name: 'FUNCIONARIO TESTE', device_id: 'device-smoke', status: 'active',
      license_status: 'active', last_license_check_at: new Date().toISOString(), admin_pin: '1234'
    }));
    localStorage.setItem('full_refresh_after_supabase_switch_v6', 'true');
    localStorage.setItem('error_cleanup_v1', 'true');
    localStorage.setItem('metrics_sync_reset_v1', 'true');
    localStorage.removeItem('last_runtime_error');
    return true;
  })()`);

  console.log('[smoke] reiniciando app ativado');
  await navigate(send, `${appUrl}/#/`);

  if (nativeMode) {
    await waitFor(send, `document.body.innerText.trim().length > 0`);
    console.log('[smoke] abrindo lista nativa');
    await evaluate(send, `(() => { location.hash = '#/anomalies/list'; return true; })()`);
    await waitFor(send, `document.body.innerText.includes('LISTA DE ANOMALIAS')`);
    const nativeList = await evaluate(send, `({ text: document.body.innerText, error: localStorage.getItem('last_runtime_error') })`);
    if (!nativeList.text.includes('LISTA DE ANOMALIAS') || nativeList.error) {
      throw new Error(`Lista nativa falhou: ${JSON.stringify(nativeList)}`);
    }

    console.log('[smoke] abrindo cadastro nativo');
    await evaluate(send, `(() => { location.hash = '#/anomalies/add'; return true; })()`);
    await waitFor(send, `document.body.innerText.includes('NOVA ANOMALIA') && document.body.innerText.includes('FUNCIONARIO TESTE')`);
    const nativeAdd = await evaluate(send, `({ text: document.body.innerText, error: localStorage.getItem('last_runtime_error') })`);
    if (!nativeAdd.text.includes('NOVA ANOMALIA') || !nativeAdd.text.includes('FUNCIONARIO TESTE') || nativeAdd.error) {
      throw new Error(`Cadastro nativo falhou: ${JSON.stringify(nativeAdd)}`);
    }

    for (const screen of [
      { path: 'notices/list', title: 'COMUNICADOS' },
      { path: 'instructions/list', title: 'LISTA DE INSTRUÇÕES' },
      { path: 'improvements/list', title: 'LISTA DE MELHORIAS' },
      { path: 'data/milk', title: 'VOLUME DE LEITE' }
    ]) {
      console.log('[smoke] abrindo tela nativa ' + screen.path);
      await evaluate(send, `(() => { location.hash = '#/${screen.path}'; return true; })()`);
      await waitFor(send, `document.body.innerText.toUpperCase().includes(${JSON.stringify(screen.title)})`);
      const screenState = await evaluate(send, `({ error: localStorage.getItem('last_runtime_error') })`);
      if (screenState.error) throw new Error(`Tela nativa ${screen.path} falhou: ${JSON.stringify(screenState)}`);
    }

    console.log('[smoke] validando PIN de funcionario comum');
    await evaluate(send, `(() => {
      localStorage.removeItem('app_gestao_rural_auth');
      location.hash = '#/settings';
      return true;
    })()`);
    await waitFor(send, `document.body.innerText.includes('Digite a senha para acessar')`);

    const submitPin = async (pin) => evaluate(send, `(() => {
      const input = document.querySelector('input[type="tel"]');
      if (!input || !input.form) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(pin)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form.requestSubmit();
      return true;
    })()`);

    await submitPin('9999');
    await waitFor(send, `document.body.innerText.includes('Acesso não autorizado: PIN incorreto.')`);
    await submitPin('1234');
    await waitFor(send, `!document.body.innerText.includes('Digite a senha para acessar') && document.body.innerText.toUpperCase().includes('CONFIGURAÇÕES')`);

    console.log('[smoke] trocando funcionario no app nativo offline');
    await evaluate(send, `(() => { location.hash = '#/switch-employee'; return true; })()`);
    await waitFor(send, `document.body.innerText.toUpperCase().includes('TROCAR FUNCIONÁRIO') && document.querySelectorAll('#switch-employee option').length > 1`);
    const switchTarget = await evaluate(send, `(() => {
      const context = JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2'));
      const select = document.querySelector('#switch-employee');
      const option = [...select.options].find((item) => item.value !== context.employee_id);
      if (!option) return null;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(select, option.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.value;
    })()`);
    if (!switchTarget) throw new Error('Nenhum funcionario alternativo disponivel no teste nativo');
    await evaluate(send, `(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('CONFIRMAR TROCA'));
      if (!button) return false;
      button.click();
      return true;
    })()`);
    await waitFor(send, `document.body.innerText.includes('Autorizar troca de funcionário')`);
    await submitPin('1234');
    await waitFor(send, `JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2')).employee_id === ${JSON.stringify(switchTarget)}`);
    await wait(800);

    await evaluate(send, `(() => { location.hash = '#/rota-inexistente'; return true; })()`);
    await waitFor(send, `location.hash === '#/'`);

    console.log(JSON.stringify({ ok: true, native: true, listScreen: true, addScreen: true, otherCriticalScreens: true, adminPin: true, employeeSwitch: true, unknownRouteRedirect: true }));
    process.exitCode = 0;
  } else {
  console.log('[smoke] inserindo dados antigos e volumosos');
  await evaluate(send, `window.__smokeSeedPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('FarmDB_Web_v3');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB bloqueado por outra conexao'));
    request.onsuccess = () => {
      try {
      const database = request.result;
      const transaction = database.transaction(['anomalies', 'employees', 'notices', 'instructions', 'improvements', 'milk_daily', 'daily_metrics'], 'readwrite');
      const anomalies = transaction.objectStore('anomalies');
      const employees = transaction.objectStore('employees');
      const notices = transaction.objectStore('notices');
      const instructions = transaction.objectStore('instructions');
      const improvements = transaction.objectStore('improvements');
      const milk = transaction.objectStore('milk_daily');
      const metrics = transaction.objectStore('daily_metrics');
      const now = new Date().toISOString();
      anomalies.clear();
      employees.clear();
      notices.clear();
      instructions.clear();
      improvements.clear();
      milk.clear();
      metrics.clear();
      for (let index = 0; index < ${anomalyCount}; index++) {
        const id = 'smoke-anomaly-' + index;
        anomalies.put({
          id,
          data: {
            id,
            farm_id: '${farmId}',
            createdAt: index % 17 === 0 ? null : new Date(2026, index % 12, (index % 27) + 1).toISOString(),
            responsible: index % 13 === 0 ? null : 'FUNCIONARIO ' + (index % 20),
            sector: index % 11 === 0 ? 'SETOR LEGADO' : 'Ordenha',
            description: index % 19 === 0 ? null : 'Registro de compatibilidade ' + index,
            media: index % 7 === 0 ? null : []
          },
          updated_at: now,
          synced: true
        });
      }
      employees.put({ id: 'employee-1', data: { id: 'employee-1', farm_id: '${farmId}', name: 'FUNCIONARIO TESTE', role: null }, updated_at: now, synced: true });
      employees.put({ id: 'employee-2', data: { id: 'employee-2', farm_id: '${farmId}', name: 'OUTRO FUNCIONARIO', role: 'Colaborador', status: 'active' }, updated_at: now, synced: true });
      employees.put({ id: 'employee-invalid', data: { id: 'employee-invalid', farm_id: '${farmId}', name: null }, updated_at: now, synced: true });
      for (let index = 0; index < 120; index++) {
        const createdAt = new Date(2026, index % 12, (index % 27) + 1).toISOString();
        notices.put({
          id: 'smoke-notice-' + index,
          data: { id: 'smoke-notice-' + index, farm_id: '${farmId}', createdAt, responsible: index % 9 === 0 ? 42 : 'FUNCIONARIO TESTE', content: index % 7 === 0 ? null : 'Comunicado ' + index, media: index % 6 === 0 ? {} : [] },
          updated_at: now, synced: true
        });
        instructions.put({
          id: 'smoke-instruction-' + index,
          data: { id: 'smoke-instruction-' + index, farm_id: '${farmId}', createdAt, employee_name: index % 8 === 0 ? 7 : 'FUNCIONARIO TESTE', title: index % 5 === 0 ? null : 'Instrucao ' + index, sector: 'Ordenha', description: null, media: [] },
          updated_at: now, synced: true
        });
        improvements.put({
          id: 'smoke-improvement-' + index,
          data: { id: 'smoke-improvement-' + index, farm_id: '${farmId}', createdAt, employee: index % 10 === 0 ? null : 'FUNCIONARIO TESTE', sector: 'Ordenha', description: index % 4 === 0 ? null : 'Melhoria ' + index, media: [] },
          updated_at: now, synced: true
        });
      }
      // Pendências locais não podem ser apagadas por uma reconciliação remota vazia.
      milk.put({ id: '${farmId}_2026-08-23', data: { farm_id: '${farmId}', date: '2026-08-23', liters: '1250.5' }, updated_at: now, synced: false });
      metrics.put({ id: '${farmId}_2026-08-23_lactation', data: { farm_id: '${farmId}', date: '2026-08-23', type: 'lactation', value: '120' }, updated_at: now, synced: false });
      transaction.oncomplete = () => {
        database.close();
        resolve(true);
      };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transacao IndexedDB abortada'));
      } catch (error) {
        reject(error);
      }
    };
  })`);

  console.log('[smoke] trocando funcionario fora do Admin');
  await navigate(send, `${appUrl}/#/switch-employee`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('TROCAR FUNCIONÁRIO')`);
  await evaluate(send, `(() => {
    const select = document.querySelector('#switch-employee');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'employee-2');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    return true;
  })()`);
  await wait(200);
  await evaluate(send, `(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.innerText.includes('CONFIRMAR TROCA'));
    button.click();
    return true;
  })()`);
  await waitFor(send, `document.body.innerText.includes('Autorizar troca de funcionário')`);
  await evaluate(send, `(() => {
    const input = document.querySelector('input[type="tel"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '1234');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.form.requestSubmit();
    return true;
  })()`);
  await waitFor(send, `JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2')).employee_id === 'employee-2'`);
  await wait(800);
  await evaluate(send, `(() => {
    const context = JSON.parse(localStorage.getItem('gestao_rural_farm_context_v2'));
    localStorage.setItem('gestao_rural_farm_context_v2', JSON.stringify({ ...context, employee_id: 'employee-1', employee_name: 'FUNCIONARIO TESTE' }));
    return true;
  })()`);

  console.log('[smoke] abrindo lista de anomalias');
  await navigate(send, `${appUrl}/#/anomalies/list`);
  const list = await evaluate(send, `({
    text: document.body.innerText,
    error: localStorage.getItem('last_runtime_error'),
    cards: document.querySelectorAll('[class*="border-l-8"]').length
  })`);
  const expectedVisible = Math.min(40, anomalyCount);
  if (!list.text.includes('LISTA DE ANOMALIAS') || !list.text.includes(`Mostrando ${expectedVisible} de ${anomalyCount}`) || list.error) {
    throw new Error(`Lista de anomalias falhou: ${JSON.stringify(list)}`);
  }

  console.log('[smoke] abrindo nova anomalia');
  await navigate(send, `${appUrl}/#/anomalies/add`);
  const add = await evaluate(send, `({
    text: document.body.innerText,
    error: localStorage.getItem('last_runtime_error')
  })`);
  if (!add.text.includes('NOVA ANOMALIA') || !add.text.includes('FUNCIONARIO TESTE') || add.error) {
    throw new Error(`Nova anomalia falhou: ${JSON.stringify(add)}`);
  }

  for (const screen of [
    { path: 'notices/list', title: 'COMUNICADOS' },
    { path: 'instructions/list', title: 'LISTA DE INSTRUÇÕES' },
    { path: 'improvements/list', title: 'LISTA DE MELHORIAS' }
  ]) {
    console.log('[smoke] abrindo ' + screen.path);
    await navigate(send, `${appUrl}/#/${screen.path}`);
    await waitFor(send, `document.body.innerText.toUpperCase().includes(${JSON.stringify(screen.title)})`);
    const state = await evaluate(send, `({ text: document.body.innerText, error: localStorage.getItem('last_runtime_error') })`);
    if (!state.text.includes('120/120') || !state.text.includes('Carregar mais (80 restantes)') || state.error) {
      throw new Error(`Tela ${screen.path} falhou: ${JSON.stringify(state)}`);
    }
  }

  console.log('[smoke] abrindo dados de leite');
  await navigate(send, `${appUrl}/#/data/milk`);
  await waitFor(send, `document.body.innerText.toUpperCase().includes('VOLUME DE LEITE')`);
  const milkState = await evaluate(send, `({ text: document.body.innerText, error: localStorage.getItem('last_runtime_error') })`);
  if ((!milkState.text.includes('1250.5') && !milkState.text.includes('1.250,5')) || milkState.error) {
    throw new Error(`Tela de leite falhou: ${JSON.stringify(milkState)}`);
  }

  console.log('[smoke] validando rota desconhecida');
  await navigate(send, `${appUrl}/#/rota-inexistente`);
  await waitFor(send, `location.hash === '#/'`);

  console.log(JSON.stringify({ ok: true, employeeSwitch: true, listCards: list.cards, listTotal: anomalyCount, addScreen: true, legacyLists: true, milk: true, unknownRouteRedirect: true }));
  }
} finally {
  socket.close();
}
