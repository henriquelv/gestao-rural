export const APP_BRAND = {
  name: 'Campo Legado',
  descriptor: 'Consultoria',
  fullName: 'Campo Legado Consultoria',
  appName: 'Gestão Rural Campo Legado',
  tagline: 'Tradição que ensina, inovação que transforma.',
  logoUri: '/brand/campo-legado-logo.jpg'
} as const;

export const APP_ENVIRONMENT = {
  label: 'TESTE',
  activationCode: 'TESTE',
  webDatabase: 'CampoLegado_TESTE_Supabase_Web_v1',
  nativeDatabase: 'CampoLegado_TESTE_Supabase_Native_v1'
} as const;

// Os módulos continuam implementados e com suas rotas preservadas em App.tsx.
// Para reexibir um deles no futuro, basta adicioná-lo a esta lista.
export const VISIBLE_HOME_ROUTES = ['/anomalies', '/agenda', '/fuelings', '/farm-indicators', '/notices', '/settings'] as const;
