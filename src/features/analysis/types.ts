import type { EngineResponse, SuggestionCheck } from '@/features/engine/types';

/** A better move Claude suggested, with the engine's check. */
export type AnalysedSuggestion = {
  /** Decision number shown to Claude (1-based, "E1", "E2", …). */
  decision: number;
  /** Index into the replay's responses. */
  responseIndex: number;
  /** Replay frame of the decision (for "show in the replay"). */
  frame: number;
  turn: number;
  chosenLabel: string;
  optionLabel: string;
  response: EngineResponse;
  reason: string;
  /** null = not checked yet. */
  check: SuggestionCheck | null;
};

/** Claude's commentary on one duel, stored with the replay. */
export type MatchAnalysis = {
  createdAt: number;
  model: string;
  modelName: string;
  usage: { input: number; output: number };
  summary: string;
  turningPoints: { turn: number; text: string }[];
  suggestions: AnalysedSuggestion[];
  /** Suggestions that referred to a decision or option that does not exist. */
  invalid: number;
  tips: string[];
};
