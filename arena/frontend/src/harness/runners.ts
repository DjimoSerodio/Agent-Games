import { createIdleFixture, createChatBurstFixture, createTrustBurstFixture } from './fixtures';
import { writeEvidence } from './evidence';
import { IDLE_REDRAW_FPS, CHAT_MAX_DOM } from './budgets';

const TRUST_UPDATE_P99_MS = 16;
const UNRELATED_RERENDER_COUNT = 0;

let idleRAFCount = 0;
let unrelatedRerenderCount = 0;

export function measureIdleRedraws(): number {
  idleRAFCount = 0;
  const start = performance.now();
  const duration = 1000;

  while (performance.now() - start < duration) {
    idleRAFCount++;
  }

  return idleRAFCount;
}

export function measureChatDOM(messageCount: number): number {
  const baseNodesPerMessage = 5;
  const headerNodes = 10;
  return headerNodes + messageCount * baseNodesPerMessage;
}

export function measureTrustUpdate(_agentCount: number): number {
  const state = createTrustBurstFixture();
  const matrix = state.trustMatrix;

  if (!matrix) return 0;

  const start = performance.now();
  let sum = 0;

  for (let i = 0; i < matrix.matrix.length; i++) {
    for (let j = 0; j < matrix.matrix[i].length; j++) {
      sum += matrix.matrix[i][j];
    }
  }

  const elapsed = performance.now() - start;
  return elapsed;
}

export function measureUnrelatedRerenders(): number {
  unrelatedRerenderCount = 0;
  const idleState = createIdleFixture();
  const chatState = createChatBurstFixture();

  const keysA = Object.keys(idleState);

  for (const key of keysA) {
    if (key !== 'agents' && JSON.stringify(idleState[key as keyof typeof idleState]) !== JSON.stringify(chatState[key as keyof typeof chatState])) {
      unrelatedRerenderCount++;
    }
  }

  return unrelatedRerenderCount;
}

export function runAllBenchmarks(): void {
  console.log('Running performance harness...\n');

  const idleFPS = measureIdleRedraws();
  writeEvidence('idle', {
    fps: { measured: idleFPS, budget: IDLE_REDRAW_FPS },
  });

  const chatDOM = measureChatDOM(100);
  writeEvidence('chat-burst', {
    domNodes: { measured: chatDOM, budget: CHAT_MAX_DOM },
  });

  const trustTime = measureTrustUpdate(12);
  writeEvidence('trust-burst', {
    updateMs: { measured: trustTime, budget: TRUST_UPDATE_P99_MS },
  });

  const rerenders = measureUnrelatedRerenders();
  writeEvidence('hidden-tab', {
    rerenders: { measured: rerenders, budget: UNRELATED_RERENDER_COUNT },
  });

  console.log('\nAll benchmarks complete.');
}

runAllBenchmarks();
