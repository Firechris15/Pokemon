import { create } from 'zustand';

export type SheetItem = { uid: string; cardId: number; faceDown: boolean; caption: string };

export type SheetRequest = {
  id: number;
  title: string;
  message?: string;
  items: SheetItem[];
  /** view: a tap returns that card; select: toggle cards and confirm. */
  mode: 'view' | 'select';
  min: number;
  max: number;
  /** Extra button in view mode (e.g. "Karten hinzufügen" in the editor). */
  action?: string;
  resolve: (result: string[] | 'action' | null) => void;
};

type SheetState = { request: SheetRequest | null };

export const useInstanceSheet = create<SheetState>(() => ({ request: null }));

let requestId = 0;

function open(options: Omit<SheetRequest, 'id' | 'resolve'>): Promise<string[] | 'action' | null> {
  return new Promise((resolve) => useInstanceSheet.setState({ request: { ...options, id: ++requestId, resolve } }));
}

/** Shows the cards of a pile; resolves with the tapped card, 'action' or null. */
export async function showPile(options: { title: string; items: SheetItem[]; action?: string }): Promise<string | 'action' | null> {
  const result = await open({ ...options, mode: 'view', min: 0, max: 1 });
  return result === 'action' ? 'action' : (result?.[0] ?? null);
}

/** Lets the player choose cards (materials, tributes, targets). */
export async function selectInstances(options: { title: string; message?: string; items: SheetItem[]; min: number; max: number }): Promise<string[] | null> {
  const result = await open({ ...options, mode: 'select' });
  return result === 'action' ? null : result;
}

export function closeInstanceSheet(result: string[] | 'action' | null): void {
  const request = useInstanceSheet.getState().request;
  useInstanceSheet.setState({ request: null });
  request?.resolve(result);
}
