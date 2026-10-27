import type Anthropic from '@anthropic-ai/sdk';
import type { betaZodOutputFormat as BetaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

/** A model the commentary can use (from the Models API, so new models show up without an app update). */
export type ModelOption = { id: string; name: string; createdAt: string; maxTokens: number; adaptive: boolean; effortHigh: boolean };

// Plain numbers: zod's .int() adds safe-integer bounds that end up as noise in the JSON schema.
const AnalysisSchema = z.object({
  summary: z.string(),
  turning_points: z.array(z.object({ turn: z.number(), text: z.string() })),
  suggestions: z.array(z.object({ decision: z.number(), option: z.number(), reason: z.string() })),
  tips: z.array(z.string()),
});

export type RawAnalysis = z.infer<typeof AnalysisSchema>;

export class AnalysisError extends Error {}

type Sdk = { Anthropic: typeof Anthropic; betaZodOutputFormat: typeof BetaZodOutputFormat };
let sdk: Promise<Sdk> | null = null;

/**
 * The SDK is loaded on first use only: Safari before 16.4 cannot parse it
 * (it contains a regex lookbehind), and the rest of the app must keep working there.
 */
async function loadSdk(): Promise<Sdk> {
  sdk ??= Promise.all([import('@anthropic-ai/sdk'), import('@anthropic-ai/sdk/helpers/beta/zod')]).then(([core, helpers]) => ({
    Anthropic: core.default,
    betaZodOutputFormat: helpers.betaZodOutputFormat,
  }));
  try {
    return await sdk;
  } catch {
    sdk = null;
    throw new AnalysisError('Der KI-Kommentar konnte nicht geladen werden. Er braucht Safari 16.4 oder neuer. Bitte die App neu laden oder iPadOS aktualisieren.');
  }
}

/**
 * The key belongs to the user and stays on this device; requests go directly
 * from the app to the Claude API (no server in between), hence the browser flag.
 */
function client({ Anthropic }: Sdk, apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function explain(error: unknown, Anthropic: Sdk['Anthropic']): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof Anthropic.AuthenticationError) return new AnalysisError('Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.');
  if (error instanceof Anthropic.PermissionDeniedError) return new AnalysisError('Der API-Schlüssel hat keinen Zugriff auf dieses Modell.');
  if (error instanceof Anthropic.NotFoundError) return new AnalysisError('Das gewählte Modell gibt es nicht mehr. Bitte in den Einstellungen ein anderes wählen.');
  if (error instanceof Anthropic.RateLimitError) return new AnalysisError('Zu viele Anfragen oder Guthaben aufgebraucht. Bitte später erneut versuchen.');
  if (error instanceof Anthropic.BadRequestError) return new AnalysisError(`Die Anfrage wurde abgelehnt: ${error.message}`);
  if (error instanceof Anthropic.APIConnectionError) return new AnalysisError('Keine Verbindung zur Claude API. Für den KI-Kommentar braucht das Gerät Internet.');
  if (error instanceof Anthropic.APIError) return new AnalysisError(`Fehler der Claude API (${error.status ?? '?'}): ${error.message}`);
  return new AnalysisError(error instanceof Error ? error.message : String(error));
}

/** Active models that support structured output and adaptive thinking, newest first. */
export async function listModels(apiKey: string): Promise<ModelOption[]> {
  const loaded = await loadSdk();
  try {
    const out: ModelOption[] = [];
    for await (const m of client(loaded, apiKey).models.list({ lifecycle: ['active'] })) {
      const caps = m.capabilities;
      if (caps && (!caps.structured_outputs.supported || !caps.thinking.types.adaptive.supported)) continue;
      out.push({
        id: m.id,
        name: m.display_name,
        createdAt: m.created_at,
        maxTokens: m.max_tokens ?? 16000,
        adaptive: caps?.thinking.types.adaptive.supported ?? false,
        effortHigh: caps?.effort.high.supported ?? false,
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    throw explain(error, loaded.Anthropic);
  }
}

/** The stored choice, or the newest Opus model. */
export function pickModel(models: ModelOption[], preferred: string | null): ModelOption | null {
  return models.find((m) => m.id === preferred) ?? models.find((m) => /opus/i.test(m.id)) ?? models[0] ?? null;
}

export type AnalysisResult = { analysis: RawAnalysis; model: string; usage: { input: number; output: number } };

/** One request: duel log and decisions in, structured commentary out. */
export async function requestAnalysis(apiKey: string, model: ModelOption, system: string, prompt: string): Promise<AnalysisResult> {
  const loaded = await loadSdk();
  try {
    const response = await client(loaded, apiKey).beta.messages.parse({
      model: model.id,
      max_tokens: Math.min(16000, model.maxTokens),
      // If the model declines for policy reasons, the API retries on its default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(model.adaptive ? { thinking: { type: 'adaptive' as const } } : {}),
      output_config: { ...(model.effortHigh ? { effort: 'high' as const } : {}), format: loaded.betaZodOutputFormat(AnalysisSchema) },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') throw new AnalysisError('Die KI hat diese Analyse abgelehnt.');
    if (response.stop_reason === 'max_tokens') throw new AnalysisError('Die Antwort war zu lang und wurde abgeschnitten. Bitte erneut versuchen.');
    if (!response.parsed_output) throw new AnalysisError('Die Antwort der KI konnte nicht gelesen werden.');
    return { analysis: response.parsed_output, model: response.model, usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
  } catch (error) {
    throw explain(error, loaded.Anthropic);
  }
}
