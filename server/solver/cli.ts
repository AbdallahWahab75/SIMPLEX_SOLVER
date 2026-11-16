import fs from 'node:fs';
import { solveLinearProgram } from './index.js';

function runCli() {
  const args = process.argv.slice(2);
  let rawJson: string;

  if (args[0] && args[0] !== '-') {
    rawJson = fs.readFileSync(args[0], 'utf8');
  } else if (args[0] === '-') {
    rawJson = fs.readFileSync(0, 'utf8');
  } else {
    // Default reference problem from specification section 8
    rawJson = JSON.stringify({
      name: 'Production',
      sense: 'maximize',
      objective: { x1: 40, x2: 30 },
      variables: {
        x1: { type: 'lower_bounded', lower: 0 },
        x2: { type: 'lower_bounded', lower: 0 },
      },
      constraints: [
        {
          name: 'Ressource A',
          coefficients: { x1: 2, x2: 1 },
          operator: '<=',
          rhs: 100,
        },
        {
          name: 'Ressource B',
          coefficients: { x1: 1, x2: 2 },
          operator: '<=',
          rhs: 80,
        },
      ],
    });
  }

  const model = JSON.parse(rawJson);
  const result = solveLinearProgram(model);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'invalid_model' || result.status === 'failed') {
    process.exitCode = 1;
  }
}

runCli();
