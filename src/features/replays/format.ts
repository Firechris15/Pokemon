import { colors } from '@/theme';

import type { ReplaySummary } from './repository';

export function resultLabel(r: Pick<ReplaySummary, 'winner' | 'viewer'>): { text: string; color: string } {
  if (r.winner === null) return { text: 'Unentschieden', color: colors.textMuted };
  return r.winner === r.viewer ? { text: 'Sieg', color: colors.primary } : { text: 'Niederlage', color: colors.danger };
}
