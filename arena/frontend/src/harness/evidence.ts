export function writeEvidence(
  scenario: string,
  metrics: Record<string, { measured: number; budget: number }>
): void {
  const timestamp = new Date().toISOString();
  const lines: string[] = [`=== ${scenario.toUpperCase()} ===`, `timestamp: ${timestamp}`];

  for (const [metric, data] of Object.entries(metrics)) {
    const passFail = data.measured <= data.budget ? 'PASS' : 'FAIL';
    lines.push(`${metric}: measured=${data.measured} budget=${data.budget} ${passFail}`);
  }

  console.log(`Evidence for ${scenario}:`);
  console.log(lines.join('\n'));
}
