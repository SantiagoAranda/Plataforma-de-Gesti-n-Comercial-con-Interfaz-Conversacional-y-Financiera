import { evaluateLineTaxGate, FixtureExecution } from './line-tax-comparison.fixtures';

const money = (value?: { toFixed(decimalPlaces: number): string }) =>
  value ? value.toFixed(2) : 'N/A';

export function renderLineTaxComparisonReport(
  executions: FixtureExecution[],
): string {
  const gate = evaluateLineTaxGate(executions);
  const comparable = executions.filter(
    (execution) => execution.classification === 'COMPARABLE',
  );
  const differing = comparable.filter((execution) => {
    const delta = execution.comparison?.difference;
    return (
      !delta ||
      !delta.subtotal.eq(0) ||
      !delta.vat.eq(0) ||
      !delta.impoconsumo.eq(0) ||
      !delta.grossTotal.eq(0)
    );
  });
  const unrepresentable = executions.filter(
    (execution) =>
      execution.classification === 'CURRENT_ENGINE_UNREPRESENTABLE',
  );
  const expectedErrors = executions.filter(
    (execution) =>
      execution.classification === 'EXPECTED_VALIDATION_ERROR',
  );
  const unexpectedErrors = executions.filter(
    (execution) => execution.classification === 'UNEXPECTED_ERROR',
  );

  const fiscalRows = executions
    .map((execution) => {
      const current = execution.comparison?.currentAggregateResult;
      const candidate = execution.comparison?.candidateLineResult;
      const delta = execution.comparison?.difference;
      return `| ${execution.fixture.name} | ${money(current?.subtotal)} | ${money(candidate?.subtotal)} | ${money(delta?.subtotal)} | ${money(current?.vat)} | ${money(candidate?.vat)} | ${money(delta?.vat)} | ${money(current?.impoconsumo)} | ${money(candidate?.impoconsumo)} | ${money(delta?.impoconsumo)} | ${money(delta?.grossTotal)} | ${execution.classification} |`;
    })
    .join('\n');

  const retentionRows = comparable
    .map((execution) => {
      const current = execution.comparison!.retentionProjection.current;
      const candidate = execution.comparison!.retentionProjection.candidate;
      const delta = execution.comparison!.retentionProjection.difference;
      return `| ${execution.fixture.name} | ${money(current.withholdingTax)} / ${money(candidate.withholdingTax)} / ${money(delta.withholdingTax)} | ${money(current.vatWithholding)} / ${money(candidate.vatWithholding)} / ${money(delta.vatWithholding)} | ${money(current.icaWithholding)} / ${money(candidate.icaWithholding)} / ${money(delta.icaWithholding)} | ${money(current.selfWithholding)} / ${money(candidate.selfWithholding)} / ${money(delta.selfWithholding)} | ${money(current.netReceived)} / ${money(candidate.netReceived)} / ${money(delta.netReceived)} |`;
    })
    .join('\n');

  const notes = executions
    .filter((execution) => execution.reason || execution.actualErrorCode)
    .map(
      (execution) =>
        `- **${execution.fixture.name}:** ${execution.reason ?? `código validado \`${execution.actualErrorCode}\`.`}`,
    )
    .join('\n');

  return `# Line Tax Comparison Report

## Resumen

- Casos ejecutados: ${executions.length}
- Casos comparables: ${comparable.length}
- Casos comparables sin diferencias: ${comparable.length - differing.length}
- Casos comparables con diferencias: ${differing.length}
- Casos no representables: ${unrepresentable.length}
- Errores de validación esperados: ${expectedErrors.length}
- Errores inesperados: ${unexpectedErrors.length}

## Política

- Redondeo: \`ROUND_HALF_UP\`
- Escala: 2
- Diferencia: candidato - actual
- Motor fiscal oficial modificado: No
- Diagnóstico expuesto en producción: No

## Matriz fiscal

| Caso | Subtotal actual | Subtotal candidato | Δ subtotal | IVA actual | IVA candidato | Δ IVA | INC actual | INC candidato | Δ INC | Δ total | Estado |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${fiscalRows}

## Matriz de retenciones

Cada celda contiene \`actual / candidato / diferencia\`.

| Caso comparable | ReteFuente | ReteIVA | ReteICA | Autorretención | Neto recibido |
| --- | ---: | ---: | ---: | ---: | ---: |
${retentionRows}

## Casos no comparables y validaciones

${notes || '- Ninguno.'}

## Puerta 1A

**Resultado: ${gate}**

${
  gate === 'DETENER'
    ? `Motivo: se encontraron diferencias en ${differing.length} caso(s) comparable(s) o errores inesperados. No se modificó la fuente fiscal oficial y no debe comenzar la Etapa 1B.`
    : 'Motivo: todos los casos comparables coinciden, los no representables están documentados y los errores esperados devolvieron el código exacto. El resultado requiere revisión explícita y no inicia la Etapa 1B.'
}
`;
}
