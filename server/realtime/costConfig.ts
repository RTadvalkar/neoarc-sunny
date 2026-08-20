/**
 * Centralized Configuration for Gemini Live Context Window Compression and Realtime Cost Control
 */

export const SUNNY_COST_CONFIG = {
  // Number of tokens accumulated in active context before compression triggers (default: "25000")
  triggerTokens: process.env.SUNNY_CONTEXT_TRIGGER_TOKENS || '25000',

  // Target token count to retain in sliding-window after compression completes (default: "8000")
  targetTokens: process.env.SUNNY_CONTEXT_TARGET_TOKENS || '8000',
};
