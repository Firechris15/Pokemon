import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { colors, radius, spacing } from '@/theme';

import { AppText } from './AppText';
import { Button, type IconName } from './Button';
import { TextField } from './TextField';

/**
 * App-wide dialogs and toasts. React Native's Alert does nothing on web, so
 * the app uses these everywhere for a consistent look on iPad and browser.
 */

type DialogRequest = { id: number } & (
  | {
      kind: 'confirm';
      title: string;
      message?: string;
      confirmLabel: string;
      destructive: boolean;
      resolve: (ok: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      message?: string;
      confirmLabel: string;
      defaultValue: string;
      placeholder?: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: 'choose';
      title: string;
      message?: string;
      options: ChoiceOption<unknown>[];
      resolve: (value: unknown) => void;
    }
);

export type ChoiceOption<T> = { label: string; value: T; icon?: IconName; destructive?: boolean; testID?: string };

let dialogId = 0;

type Toast = { id: number; message: string; tone: 'info' | 'success' | 'error' };

type DialogState = {
  dialog: DialogRequest | null;
  toasts: Toast[];
};

const useDialogStore = create<DialogState>(() => ({ dialog: null, toasts: [] }));

export function confirmDialog(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.setState({
      dialog: {
        id: ++dialogId,
        kind: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'OK',
        destructive: options.destructive ?? false,
        resolve,
      },
    });
  });
}

export function promptDialog(options: {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogStore.setState({
      dialog: {
        id: ++dialogId,
        kind: 'prompt',
        title: options.title,
        message: options.message,
        defaultValue: options.defaultValue ?? '',
        placeholder: options.placeholder,
        confirmLabel: options.confirmLabel ?? 'Speichern',
        resolve,
      },
    });
  });
}

/** Action sheet: resolves with the chosen value, or null when dismissed. */
export function chooseOption<T>(options: { title: string; message?: string; options: ChoiceOption<T>[] }): Promise<T | null> {
  return new Promise((resolve) => {
    useDialogStore.setState({
      dialog: {
        id: ++dialogId,
        kind: 'choose',
        title: options.title,
        message: options.message,
        options: options.options as ChoiceOption<unknown>[],
        resolve: resolve as (value: unknown) => void,
      },
    });
  });
}

let toastId = 0;
export function showToast(message: string, tone: Toast['tone'] = 'info'): void {
  const id = ++toastId;
  useDialogStore.setState((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
  setTimeout(() => useDialogStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
}

export function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog);
  const toasts = useDialogStore((s) => s.toasts);

  const close = () => {
    if (!dialog) return;
    useDialogStore.setState({ dialog: null });
    if (dialog.kind === 'confirm') dialog.resolve(false);
    else dialog.resolve(null);
  };

  return (
    <>
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => undefined}>
            {dialog ? <DialogBody key={dialog.id} dialog={dialog} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
      <View pointerEvents="none" style={styles.toastStack}>
        {toasts.map((toast) => (
          <View
            key={toast.id}
            style={[
              styles.toast,
              toast.tone === 'success' && { borderLeftColor: colors.primary },
              toast.tone === 'error' && { borderLeftColor: colors.danger },
            ]}>
            <AppText>{toast.message}</AppText>
          </View>
        ))}
      </View>
    </>
  );
}

function DialogBody({ dialog }: { dialog: DialogRequest }) {
  const [value, setValue] = useState(dialog.kind === 'prompt' ? dialog.defaultValue : '');

  const close = (result: boolean) => {
    useDialogStore.setState({ dialog: null });
    if (dialog.kind === 'confirm') dialog.resolve(result);
    else dialog.resolve(result ? value.trim() || null : null);
  };

  if (dialog.kind === 'choose') {
    const choose = (option: ChoiceOption<unknown>) => {
      useDialogStore.setState({ dialog: null });
      dialog.resolve(option.value);
    };
    return (
      <>
        <AppText variant="title">{dialog.title}</AppText>
        {dialog.message ? <AppText variant="muted">{dialog.message}</AppText> : null}
        <ScrollView style={styles.choices} contentContainerStyle={styles.choiceList}>
          {dialog.options.map((option, index) => (
            <Button
              key={index}
              testID={option.testID}
              label={option.label}
              icon={option.icon}
              variant={option.destructive ? 'danger' : 'secondary'}
              onPress={() => choose(option)}
              style={styles.choice}
            />
          ))}
        </ScrollView>
        <View style={styles.actions}>
          <Button testID="dialog-cancel" label="Abbrechen" variant="ghost" onPress={() => close(false)} />
        </View>
      </>
    );
  }

  return (
    <>
      <AppText variant="title">{dialog.title}</AppText>
      {dialog.message ? <AppText variant="muted">{dialog.message}</AppText> : null}
      {dialog.kind === 'prompt' ? (
        <TextField
          testID="dialog-input"
          autoFocus
          value={value}
          onChangeText={setValue}
          placeholder={dialog.placeholder}
          onSubmitEditing={() => close(true)}
        />
      ) : null}
      <View style={styles.actions}>
        <Button label="Abbrechen" variant="ghost" onPress={() => close(false)} />
        <Button
          testID="dialog-confirm"
          label={dialog.confirmLabel}
          variant={dialog.kind === 'confirm' && dialog.destructive ? 'danger' : 'primary'}
          onPress={() => close(true)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  choices: { maxHeight: 420 },
  choiceList: { gap: spacing.sm },
  choice: { justifyContent: 'flex-start' },
  toastStack: { position: 'absolute', bottom: spacing.xxl, left: 0, right: 0, alignItems: 'center', gap: spacing.sm },
  toast: {
    maxWidth: 520,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.info,
  },
});
