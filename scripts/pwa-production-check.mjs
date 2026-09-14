const origin = process.env.APP_ORIGIN || 'https://campo-legado-gestao-rural.vercel.app';
const serviceWorkerResponse = await fetch(`${origin}/sw.js?check=${Date.now()}`);
if (!serviceWorkerResponse.ok) throw new Error(`Service worker: HTTP ${serviceWorkerResponse.status}`);
const source = await serviceWorkerResponse.text();
const match = source.match(/const APP_SHELL = (\[[^;]+\]);/);
if (!match) throw new Error('Lista de arquivos offline não encontrada.');
const files = JSON.parse(match[1]);
const failures = [];
for (let index = 0; index < files.length; index += 8) {
  const batch = files.slice(index, index + 8);
  const results = await Promise.all(batch.map(async (file) => {
    const response = await fetch(`${origin}${file}`, { redirect: 'follow' });
    return { file, status: response.status, ok: response.ok };
  }));
  failures.push(...results.filter((result) => !result.ok));
}

const manifestResponse = await fetch(`${origin}/manifest.webmanifest?check=${Date.now()}`);
const manifest = await manifestResponse.json();
const iconResults = await Promise.all(manifest.icons.map(async (icon) => {
  const response = await fetch(`${origin}${icon.src}`);
  return { src: icon.src, status: response.status, type: response.headers.get('content-type') };
}));

console.log(JSON.stringify({
  ok: serviceWorkerResponse.ok && manifestResponse.ok && failures.length === 0 && iconResults.every((icon) => icon.status === 200),
  shellFiles: files.length,
  shellFailures: failures,
  deferredExportsPrecached: /(exceljs|jspdf|html2canvas|purify|index\.es-)/i.test(match[1]),
  icons: iconResults
}));
