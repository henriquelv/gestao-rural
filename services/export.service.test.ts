import { describe, expect, it } from 'vitest';
import { buildCsv, buildXlsx } from './export.service';

const readStoredZipEntries = (bytes: Uint8Array): Record<string, string> => {
  const entries: Record<string, string> = {};
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034B50) break;
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries[name] = decoder.decode(bytes.slice(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
};

describe('buildCsv', () => {
  it('gera CSV UTF-8 compativel com Excel e escapa campos', () => {
    const csv = buildCsv([
      ['Data', 'O que aconteceu'],
      ['28/08/2026', 'Válvula; quebrou "ontem"\nrevisar']
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Válvula; quebrou ""ontem""\nrevisar"');
  });

  it('neutraliza formulas digitadas em campos de texto no CSV', () => {
    const csv = buildCsv([['Descrição'], ['=HYPERLINK("https://invalid")'], [-12]]);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain('\r\n-12');
  });

  it('gera XLSX com estilos, filtros e abas válidas', () => {
    const xlsx = buildXlsx([
      {
        name: 'Anomalias',
        title: 'Relatório de Anomalias',
        subtitle: 'Fazenda Star Milk | 2 registros',
        columns: [
          { header: 'Setor', width: 24 },
          { header: 'Quantidade', width: 14, type: 'number' }
        ],
        rows: [['Ordenha', 2], ['Manejo', 1]]
      },
      {
        name: 'Pareto por setor',
        title: 'Análise de Pareto',
        columns: [{ header: 'Acumulado', type: 'percent' }],
        rows: [[0.75], [1]]
      }
    ]);
    expect(Array.from(xlsx.slice(0, 4))).toEqual([0x50, 0x4B, 0x03, 0x04]);
    const entries = readStoredZipEntries(xlsx);
    expect(Object.keys(entries)).toContain('xl/styles.xml');
    expect(entries['xl/workbook.xml']).toContain('Pareto por setor');
    expect(entries['xl/worksheets/sheet1.xml']).toContain('<autoFilter ref="A4:B6"/>');
    expect(entries['xl/worksheets/sheet1.xml']).toContain('Relatório de Anomalias');
    expect(entries['xl/worksheets/sheet2.xml']).toContain('s="6" t="n"><v>0.75</v>');
  });
});
