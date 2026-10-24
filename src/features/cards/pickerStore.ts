import { create } from 'zustand';

export type PickerSection = { title: string; ids: number[] };

export type PickerRequest = {
  id: number;
  title: string;
  /** Multiple mode collects a list (duplicates allowed); single mode returns on the first tap. */
  multiple: boolean;
  sections: PickerSection[];
  initial: number[];
  resolve: (ids: number[] | null) => void;
};

type PickerState = { request: PickerRequest | null };

export const useCardPicker = create<PickerState>(() => ({ request: null }));

let requestId = 0;

/**
 * Opens the global card picker. Resolves with the chosen passcodes, or null
 * if the user cancelled. Sections offer quick picks (hand, deck …); a search
 * tab is always available.
 */
export function pickCards(options: { title: string; multiple?: boolean; sections?: PickerSection[]; initial?: number[] }): Promise<number[] | null> {
  return new Promise((resolve) => {
    useCardPicker.setState({
      request: {
        id: ++requestId,
        title: options.title,
        multiple: options.multiple ?? false,
        sections: (options.sections ?? []).filter((s) => s.ids.length > 0),
        initial: options.initial ?? [],
        resolve,
      },
    });
  });
}

export function closeCardPicker(result: number[] | null): void {
  const request = useCardPicker.getState().request;
  useCardPicker.setState({ request: null });
  request?.resolve(result);
}
