import type { ReplayInfo, Suggestion, SuggestionCheck } from '@/features/engine/types';
import type { Replay } from '@/features/replays/repository';

import { listModels, pickModel, requestAnalysis, AnalysisError } from './claude';
import { buildPrompt, mapSuggestions, prepareDecisions, SYSTEM_PROMPT, type Names } from './prompt';
import type { MatchAnalysis } from './types';

export type AnalyzeStep = 'models' | 'claude' | 'engine';

/**
 * KI-Kommentar: sends the duel (log + the player's decisions with all legal
 * options) to Claude, then lets the rules engine check every suggested move.
 */
export async function analyzeReplay(params: {
  replay: Replay;
  info: ReplayInfo;
  names: Names;
  apiKey: string;
  preferredModel: string | null;
  verify: (suggestions: Suggestion[]) => Promise<SuggestionCheck[]>;
  onStep?: (step: AnalyzeStep) => void;
}): Promise<MatchAnalysis> {
  const { replay, info, names, apiKey, preferredModel, verify, onStep } = params;
  onStep?.('models');
  const model = pickModel(await listModels(apiKey), preferredModel);
  if (!model) throw new AnalysisError('Mit diesem API-Schlüssel ist kein passendes Modell verfügbar.');

  const decisions = prepareDecisions(info, names);
  const prompt = buildPrompt(replay, info, decisions, names);
  onStep?.('claude');
  const result = await requestAnalysis(apiKey, model, SYSTEM_PROMPT, prompt);
  const { suggestions, invalid } = mapSuggestions(result.analysis.suggestions, decisions);

  onStep?.('engine');
  const checks = await verify(suggestions.map((s) => ({ decision: s.responseIndex, response: s.response })));
  suggestions.forEach((s, i) => (s.check = checks[i] ?? null));

  return {
    createdAt: Date.now(),
    model: result.model,
    modelName: model.name,
    usage: result.usage,
    summary: result.analysis.summary,
    turningPoints: result.analysis.turning_points.map((t) => ({ turn: Math.round(t.turn), text: t.text })),
    suggestions,
    invalid,
    tips: result.analysis.tips,
  };
}
