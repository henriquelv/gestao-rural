import { describe, expect, it } from 'vitest';
import { formatEmployeeSelectionLabel, resolveEmployeeSelection } from './employee-selection';

const employees = [
  { id: 'employee-1', name: 'JOAO' },
  { id: 'employee-2', name: 'JOAO' },
  { id: 'employee-3', name: 'IVONE' }
];

describe('selecao de funcionario', () => {
  it('prioriza o ID mesmo quando existem nomes repetidos', () => {
    expect(resolveEmployeeSelection(employees, 'employee-2', 'JOAO')?.id).toBe('employee-2');
  });

  it('nao escolhe silenciosamente o primeiro nome duplicado', () => {
    expect(resolveEmployeeSelection(employees, '', 'JOAO')).toBeNull();
    expect(resolveEmployeeSelection(employees, '', 'IVONE')?.id).toBe('employee-3');
  });

  it('diferencia nomes repetidos nas listas por ID', () => {
    expect(formatEmployeeSelectionLabel(employees[1], employees)).toBe('JOAO (cadastro - oyee-2)');
    expect(formatEmployeeSelectionLabel(employees[2], employees)).toBe('IVONE');
  });
});
