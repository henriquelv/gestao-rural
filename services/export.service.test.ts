import { describe, expect, it } from 'vitest';
import { buildCsv } from './export.service';

describe('buildCsv', () => {
  it('gera CSV UTF-8 compativel com Excel e escapa campos', () => {
    const csv = buildCsv([
      ['Data', 'O que aconteceu'],
      ['28/08/2026', 'Válvula; quebrou "ontem"\nrevisar']
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Válvula; quebrou ""ontem""\nrevisar"');
  });
});
