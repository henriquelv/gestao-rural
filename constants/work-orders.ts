import { Employee } from '../types';

export const TECHNICIAN_NAMES = [
  'Ana Victória Freitas Ribeiro',
  'Camila Pedro',
  'Debora Maria Barbosa Prado',
  'Gabriel De Sousa Vilela',
  'Gabriel Franco Rodrigues de Oliveira',
  'Guilherme Fontes',
  'Henrique Rodrigues Gomes Pereira',
  'Leonardo Rezende Guimarães',
  'Mateus Bogaz de Angelo',
  'Matheus Augusto Ferreira Fernandes',
  'Paulo Fernando Duarte Fernandes',
  'Ricardo Nascimento Fernandes Vieira',
  'William França Resende Cunha',
  'Adriana'
] as const;

export const FIELD_ADMIN_NAMES = new Set<string>([
  'Gabriel De Sousa Vilela',
  'Gabriel Franco Rodrigues de Oliveira',
  'Guilherme Fontes',
  'Henrique Rodrigues Gomes Pereira',
  'Ricardo Nascimento Fernandes Vieira',
  'Adriana'
]);

export const TECHNICIANS: Employee[] = TECHNICIAN_NAMES.map((name, index) => {
  const isAdmin = FIELD_ADMIN_NAMES.has(name);
  return {
    id: `tecnico-${String(index + 1).padStart(2, '0')}`,
    name,
    role: isAdmin ? 'Administrador' : 'Técnico',
    status: 'active',
    is_admin: isAdmin,
    admin_pin: isAdmin ? '1234' : undefined,
    access_pin: '1234'
  };
});

export const ADMIN_PROFILE: Employee = {
  id: 'administrador-campo-legado',
  name: 'Administrador',
  role: 'Administrador',
  status: 'active',
  is_admin: true,
  admin_pin: '1234',
  access_pin: '1234'
};

export const LOCAL_PROFILES: Employee[] = [ADMIN_PROFILE, ...TECHNICIANS];

export const LOCAL_LEGACY_CLEANUP_FLAG = 'campo_legado_remove_legacy_records_v1';

export const CLIENTS = [
  'Acir Braga Coelho',
  'Adailson Alves de Almeida',
  'Adão Francisco dos Santos',
  'Agropecuária Cenci - Lago Verde',
  'Agropecuária Cenci',
  'Agropecuária Funchal',
  'Alfredo Vilela Junqueira Neto',
  'Anizeu Nunes',
  'Ary Silverio Xavier',
  'Cacildo Afonso Vieira',
  'Carlos Ipojucan Hollmann',
  'Carlos Sergio Nunes',
  'Campo Legado Consultoria',
  'Claudio Henrique de Oliveira Barbosa Vieira',
  'Cristiano Humberto Ribeiro Fontes',
  'Daniel Bruno de Mendonça',
  'Daniella Martins da Silva',
  'Danilo Moreira',
  'Diogo Cantarelli Guimaraes',
  'Diola Agronegocios Ltda',
  'Euclides Rodrigues de Resende Neto',
  'Frederico Resende Franco',
  'Gilson Andre da Silva',
  'Giovanne Vicente de Souza',
  'Guilherme Correa de Moraes Sarmento',
  'Integral Agroindustrial',
  'Jan Hendrik Boerman',
  'Jander Guimarães Xavier',
  'Johann Friedrich Volker Karl Joeris Schicht - cria e fiv',
  'Johann Friedrich Volker Karl Joeris Schicht',
  'José Arnoldo Caixeta',
  'José Eduardo Alves Gouveia',
  'José Gouveia Franco Neto',
  'José Nazareno Freitas Bahia',
  'José Paula',
  'Jose Ronaldo Lopes - Confinamento',
  'Jose Ronaldo Lopes',
  'Juliano Douglas Tizzo',
  'Juvenal Pinto Rocha',
  'Lucas Fernandes Santana e Outros',
  'Luiz Eduardo Branquinho',
  'Luiz Eugenio da Fonseca',
  'Luiz Eugenio da Fonseca - Manejo de Animais',
  'Luiz Humberto Gonçalves Reis',
  'Patrícia Franco Cunha',
  'Paulo Henrique Braga Machado',
  'Rafael Bali Moreira',
  'Rodrigo Lemos de Moraes Sarmento',
  'Samuel Toleto You Hsin Ma',
  'Silas Antonio Peres',
  'Volmar Pereira Caixeta',
  'Jose Nazareno de Freitas Bahia'
] as const;

export const WORK_ORDER_TYPES = [
  { value: 'receita', label: 'Receita' },
  { value: 'despesa', label: 'Despesa' }
] as const;
