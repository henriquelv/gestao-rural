export function getUserFacingError(error: unknown, fallback: string): string {
  const raw = error && typeof error === 'object'
    ? String((error as any).message || (error as any).error_description || '')
    : String(error || '');
  const code = error && typeof error === 'object' ? String((error as any).code || '') : '';
  const normalized = `${code} ${raw}`.toLowerCase();

  if (/failed to fetch|networkerror|network request|load failed|timeout|timed out/.test(normalized)) {
    return 'Sem conexão com o servidor. Verifique a internet e tente novamente.';
  }
  if (/42501|permission denied|row-level security|\brls\b|\b401\b|\b403\b|jwt/.test(normalized)) {
    return 'Acesso não autorizado pelo servidor. Procure o administrador.';
  }
  if (/42703|column .* does not exist|schema cache/.test(normalized)) {
    return 'Esta versão do aplicativo não é compatível com o banco atual. Atualize o app.';
  }
  return raw.trim() || fallback;
}
