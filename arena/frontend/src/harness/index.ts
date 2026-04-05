export { IDLE_REDRAW_FPS, CHAT_MAX_DOM } from './budgets';
export { createIdleFixture, createChatBurstFixture, createTrustBurstFixture, createMaxPlayerFixture } from './fixtures';
export type { GameState, ChatMessage, HexTile, AgentState } from './fixtures';
export { writeEvidence } from './evidence';
export { measureIdleRedraws, measureChatDOM, measureTrustUpdate, measureUnrelatedRerenders, runAllBenchmarks } from './runners';
