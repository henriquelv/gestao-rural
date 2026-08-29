/**
 * Seed Data Service
 * Popula o banco de dados com imagens pré-configuradas para Instruções, Normas e Melhorias.
 * Roda apenas uma vez (usa flag localStorage para evitar duplicação).
 */

import { db } from './db.service';
import { Instruction, FarmDoc, Improvement, MediaItem } from '../types';

const SEED_FLAG = 'seed_v5_instructions';

function makeMedia(id: string, name: string, uri: string): MediaItem {
  return {
    id,
    type: 'photo',
    name,
    uri,
    mimeType: 'image/jpeg',
  };
}

function makeInstruction(id: string, title: string, sector: string, description: string, media: MediaItem[]): Instruction {
  return {
    id,
    createdAt: new Date().toISOString(),
    title,
    sector,
    description,
    media,
  };
}

function makeFarmDoc(id: string, title: string, sector: string, media: MediaItem): FarmDoc {
  return {
    id,
    updatedAt: new Date().toISOString(),
    title,
    sector,
    media,
  };
}

function makeImprovement(id: string, description: string, sector: string, employee: string, media: MediaItem[]): Improvement {
  return {
    id,
    createdAt: new Date().toISOString(),
    employee,
    sector,
    description,
    media,
  };
}

const BASE = '/images';

export async function seedImageData(): Promise<void> {
  if (import.meta.env.VITE_ENABLE_SEED_DATA !== 'true') return;
  if (localStorage.getItem(SEED_FLAG)) return;

  console.log('[Seed] Populando banco de dados com imagens...');

  try {
    // =====================================================================
    // INSTRUÇÕES DE TRABALHO
    // =====================================================================

    const instructions: Instruction[] = [
      // Alimentação (agrupado)
      makeInstruction('seed-v5-alim-1', 'Como carregar dieta', 'Alimentação', '', [
        makeMedia('seed-v5-alim-1-1', 'Alimentação 1', `${BASE}/instructions/alimentacao_1.jpeg`),
        makeMedia('seed-v5-alim-1-2', 'Alimentação 2', `${BASE}/instructions/alimentacao_2.jpeg`)
      ]),
      makeInstruction('seed-v5-alim-3', 'Padrão do escore de cocho', 'Alimentação', '', [makeMedia('seed-v5-alim-3', 'Alimentação 3', `${BASE}/instructions/alimentacao_3.jpeg`)]),
      makeInstruction('seed-v5-alim-4', 'Retirar podre da silagem', 'Alimentação', '', [makeMedia('seed-v5-alim-4', 'Alimentação 4', `${BASE}/instructions/alimentacao_4.jpeg`)]),
      makeInstruction('seed-v5-alim-5', 'Processo de alimentação', 'Alimentação', '', [makeMedia('seed-v5-alim-5', 'Alimentação 5', `${BASE}/instructions/alimentacao_5.jpeg`)]),
      makeInstruction('seed-v5-alim-6', 'Fazer matéria seca silagem', 'Alimentação', '', [makeMedia('seed-v5-alim-6', 'Alimentação 6', `${BASE}/instructions/alimentacao_6.jpeg`)]),
      makeInstruction('seed-v5-alim-7', 'Verificar tamanho de partículas', 'Alimentação', '', [makeMedia('seed-v5-alim-7', 'Alimentação 7', `${BASE}/instructions/alimentacao_7.jpeg`)]),
      makeInstruction('seed-v5-alim-8', 'Checklist Vagão', 'Alimentação', '', [makeMedia('seed-v5-alim-8', 'Alimentação 8', `${BASE}/instructions/alimentacao_8.jpeg`)]),
      makeInstruction('seed-v5-alim-9', 'Resultado esperado da alimentação', 'Alimentação', '', [makeMedia('seed-v5-alim-9', 'Alimentação 9', `${BASE}/instructions/alimentacao_9.jpeg`)]),

      // Manejo
      makeInstruction('seed-v5-man-1', 'Avaliação das vacas pós-parto', 'Manejo', '', [makeMedia('seed-v5-man-1', 'Manejo 1', `${BASE}/instructions/manejo_1.jpeg`)]),
      makeInstruction('seed-v5-man-2', 'Casqueamento', 'Manejo', '', [makeMedia('seed-v5-man-2', 'Manejo 2', `${BASE}/instructions/manejo_2.jpeg`)]),
      makeInstruction('seed-v5-man-3', 'Inseminação de animais', 'Manejo', '', [makeMedia('seed-v5-man-3', 'Manejo 3', `${BASE}/instructions/manejo_3.jpeg`)]),
      makeInstruction('seed-v5-man-4', 'Protocolar animais vazios', 'Manejo', '', [makeMedia('seed-v5-man-4', 'Manejo 4', `${BASE}/instructions/manejo_4.jpeg`)]),

      // Criação
      makeInstruction('seed-v5-cri-1', 'Amamentar as Bezerras', 'Criação', '', [makeMedia('seed-v5-cri-1', 'Criação 1', `${BASE}/instructions/criacao_1.jpeg`)]),
      makeInstruction('seed-v5-cri-2', 'Pesar as Bezerras', 'Criação', '', [makeMedia('seed-v5-cri-2', 'Criação 2', `${BASE}/instructions/criacao_2.jpeg`)]),
      makeInstruction('seed-v5-cri-3', 'Resultado esperado de criação', 'Criação', '', [makeMedia('seed-v5-cri-3', 'Criação 3', `${BASE}/instructions/criacao_3.jpeg`)]),

      // Maternidade
      makeInstruction('seed-v5-mat-1', 'Congelar colostro Versão:02', 'Maternidade', '', [makeMedia('seed-v5-mat-1', 'Maternidade 1', `${BASE}/instructions/maternidade_1.jpeg`)]),
      makeInstruction('seed-v5-mat-2', 'Descongelar e aprontar sêmen', 'Maternidade', '', [makeMedia('seed-v5-mat-2', 'Maternidade 2', `${BASE}/instructions/maternidade_2.jpeg`)]),
      makeInstruction('seed-v5-mat-3', 'Descongelar colostro Versão:02', 'Maternidade', '', [makeMedia('seed-v5-mat-3', 'Maternidade 3', `${BASE}/instructions/maternidade_3.jpeg`)]),
      makeInstruction('seed-v5-mat-4', 'Resultado esperado da maternidade', 'Maternidade', '', [makeMedia('seed-v5-mat-4', 'Maternidade 4', `${BASE}/instructions/maternidade_4.jpeg`)]),

      // Conforto
      makeInstruction('seed-v5-conf-1', 'Procedimento de limpeza de cama', 'Conforto', '', [makeMedia('seed-v5-conf-1', 'Conforto 1', `${BASE}/instructions/conforto_1.jpeg`)]),
      makeInstruction('seed-v5-conf-2', 'Checklist Robô', 'Conforto', '', [makeMedia('seed-v5-conf-2', 'Conforto 2', `${BASE}/instructions/conforto_2.jpeg`)]),

      // Ordenha (agrupado)
      makeInstruction('seed-v5-ord-1', 'Processo de ordenha', 'Ordenha', '', [
        makeMedia('seed-v5-ord-1-1', 'Ordenha 1', `${BASE}/instructions/ordenha_1.jpeg`),
        makeMedia('seed-v5-ord-1-2', 'Ordenha 3', `${BASE}/instructions/ordenha_3.jpeg`)
      ]),
      makeInstruction('seed-v5-ord-2', 'Monitoria: Ordenhar vacas', 'Ordenha', '', [makeMedia('seed-v5-ord-2', 'Ordenha 2', `${BASE}/instructions/ordenha_2.jpeg`)]),
      makeInstruction('seed-v5-ord-3', 'Alarmes e Erros', 'Ordenha', '', [makeMedia('seed-v5-ord-3', 'Ordenha 4', `${BASE}/instructions/ordenha_4.jpeg`)]),

      // Serviços Externos
      makeInstruction('seed-v5-serv-1', 'Nível de água da caixa nova', 'Serviços Externos', '', [makeMedia('seed-v5-serv-1', 'Serviços 1', `${BASE}/instructions/servicos_externos_1.jpeg`)]),
      makeInstruction('seed-v5-serv-2', 'Tabela de óleos da vagão novo', 'Serviços Externos', '', [makeMedia('seed-v5-serv-2', 'Serviços 2', `${BASE}/instructions/servicos_externos_2.jpeg`)]),
    ];

    for (const inst of instructions) {
      const existing = await db.getInstructionById(inst.id);
      if (!existing) {
        await db.addInstruction(inst);
      }
    }

    // =====================================================================
    // NORMAS E ORGANIZAÇÃO (farm_docs)
    // =====================================================================

    const norms: FarmDoc[] = [
      // Normas da Fazenda (4 imagens → 4 documentos)
      ...Array.from({ length: 4 }, (_, i) =>
        makeFarmDoc(`seed-norm-nf-${i + 1}`, `Normas da Fazenda ${i + 1}`, 'normas_fazenda',
          makeMedia(`seed-media-nf-${i + 1}`, `Normas da Fazenda ${i + 1}`, `${BASE}/norms/normas_fazenda_${i + 1}.jpeg`)
        )
      ),

      // Organograma (1 imagem)
      makeFarmDoc('seed-norm-org-1', 'Organograma', 'organograma',
        makeMedia('seed-media-org-1', 'Organograma', `${BASE}/norms/organograma_1.jpeg`)
      ),

      // Cargos e Salários (1 imagem)
      makeFarmDoc('seed-norm-cs-1', 'Plano de Cargos e Salários', 'cargos_salarios',
        makeMedia('seed-media-cs-1', 'Cargos e Salários', `${BASE}/norms/cargos_salarios_1.jpeg`)
      ),

      // Responsabilidade por Função (8 imagens → 8 documentos)
      ...Array.from({ length: 8 }, (_, i) =>
        makeFarmDoc(`seed-norm-rf-${i + 1}`, `Responsabilidade por Função ${i + 1}`, 'resp_funcao',
          makeMedia(`seed-media-rf-${i + 1}`, `Resp. por Função ${i + 1}`, `${BASE}/norms/resp_funcao_${i + 1}.jpeg`)
        )
      ),
    ];

    for (const doc of norms) {
      const existing = await db.getFarmDoc(doc.id);
      if (!existing) {
        await db.addFarmDoc(doc);
      }
    }

    // =====================================================================
    // MELHORIAS
    // =====================================================================

    const improvements: Improvement[] = [
      makeImprovement('seed-imp-1', 'Melhorias na Ordenha', 'Ordenha', 'Equipe', [
        makeMedia('seed-media-imp-1', 'Melhorias na Ordenha', `${BASE}/improvements/melhoria_1.jpeg`),
      ]),
    ];

    for (const imp of improvements) {
      const existing = await db.getImprovementById(imp.id);
      if (!existing) {
        await db.addImprovement(imp);
      }
    }

    // Marcar como concluído
    localStorage.setItem(SEED_FLAG, 'true');
    console.log('[Seed] Banco de dados populado com sucesso! (43 imagens)');

  } catch (e) {
    console.error('[Seed] Erro ao popular banco de dados:', e);
  }
}
