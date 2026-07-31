import {
  evaluateLineTaxGate,
  executeLineTaxMatrix,
  LINE_TAX_COMPARISON_FIXTURES,
} from './line-tax-comparison.fixtures';
import { renderLineTaxComparisonReport } from './line-tax-comparison-report';

describe('line tax comparison matrix', () => {
  it('classifies every fixture and matches all expected error codes', () => {
    const executions = executeLineTaxMatrix();

    expect(executions).toHaveLength(LINE_TAX_COMPARISON_FIXTURES.length);
    expect(executions.every((execution) => Boolean(execution.classification))).toBe(
      true,
    );
    expect(
      executions.filter(
        (execution) => execution.classification === 'UNEXPECTED_ERROR',
      ),
    ).toEqual([]);
  });

  it('stops automatically when a comparable case differs', () => {
    const executions = executeLineTaxMatrix();
    const differingComparable = executions.filter((execution) => {
      if (execution.classification !== 'COMPARABLE') return false;
      const difference = execution.comparison?.difference;
      return (
        difference &&
        (!difference.subtotal.eq(0) ||
          !difference.vat.eq(0) ||
          !difference.impoconsumo.eq(0) ||
          !difference.grossTotal.eq(0))
      );
    });

    expect(differingComparable.length).toBeGreaterThan(0);
    expect(evaluateLineTaxGate(executions)).toBe('DETENER');
    expect(renderLineTaxComparisonReport(executions)).toContain(
      '**Resultado: DETENER**',
    );
  });
});
