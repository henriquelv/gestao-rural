import { describe, expect, it } from 'vitest';
import { createId } from './id';
import { normalizeEmployees, normalizeMediaItem } from './record-normalize';

describe('compatibilidade com dados locais antigos', () => {
  it('gera identificadores UUID válidos e diferentes', () => {
    const first = createId();
    const second = createId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });

  it('normaliza funcionários e ignora registros inválidos sem quebrar a tela', () => {
    const employees = normalizeEmployees([
      { id: 1, name: ' IVONE ', role: null, status: null },
      { id: '2', employee_name: 'GIDELSON', cargo: 'Ordenhador' },
      { id: '3', name: null },
      null
    ]);

    expect(employees).toHaveLength(2);
    expect(employees[0]).toMatchObject({ id: '1', name: 'IVONE', role: 'Colaborador', status: 'active' });
    expect(employees[1]).toMatchObject({ id: '2', name: 'GIDELSON', role: 'Ordenhador', status: 'active' });
  });

  it('repara mídia antiga sem id', () => {
    const media = normalizeMediaItem({ type: 'photo', remotePath: 'anomalies/foto.jpg' });
    expect(media?.id).toBeTruthy();
    expect(media?.remotePath).toBe('anomalies/foto.jpg');
  });
});
