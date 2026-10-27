import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { confirmDialog, showToast } from '@/components/ui/dialogs';
import { TextField } from '@/components/ui/TextField';
import { listModels, pickModel, type ModelOption } from '@/features/analysis/claude';
import { deleteApiKey, KEY_STORAGE, loadApiKey, saveApiKey } from '@/features/analysis/keyStore';
import { useSettings } from '@/features/settings/store';
import { colors, spacing } from '@/theme';

const masked = (key: string) => `${key.slice(0, 7)}…${key.slice(-4)}`;

/** Claude API key (keychain on iOS) and the model for the match commentary. */
export function ClaudeKeyPanel() {
  const analysisModel = useSettings((s) => s.analysisModel);
  const update = useSettings((s) => s.update);
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApiKey()
      .then(setStored)
      .catch(() => setStored(null));
  }, []);

  const save = async () => {
    const key = input.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      // Check the key with the (free) model list before storing it.
      const list = await listModels(key);
      await saveApiKey(key);
      setStored(key);
      setInput('');
      setModels(list);
      showToast('API-Schlüssel gespeichert');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadModels = async () => {
    if (!stored) return;
    setBusy(true);
    setError(null);
    try {
      setModels(await listModels(stored));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'API-Schlüssel entfernen?', message: 'Der KI-Kommentar ist danach nicht mehr verfügbar.', confirmLabel: 'Entfernen', destructive: true }))) return;
    await deleteApiKey();
    setStored(null);
    setModels(null);
  };

  const current = models ? pickModel(models, analysisModel) : null;

  return (
    <View style={styles.root} testID="claude-panel">
      <AppText variant="muted">
        Für den KI-Kommentar zu Replays fragt die App die Claude API von Anthropic mit deinem eigenen API-Schlüssel an (console.anthropic.com → API Keys). Der Schlüssel
        bleibt {KEY_STORAGE}. Jede Analyse kostet je nach Modell und Duell-Länge ein paar Cent.
      </AppText>
      {stored ? (
        <>
          <AppText testID="claude-key-status">Gespeichert: {masked(stored)}</AppText>
          <AppText variant="small">
            Modell: {current ? current.name : analysisModel ? 'eigene Auswahl' : 'automatisch (neuestes Opus-Modell)'}
          </AppText>
          {models ? (
            <View style={styles.chips}>
              {models.map((m) => (
                <Chip key={m.id} testID={`claude-model-${m.id}`} label={m.name} selected={current?.id === m.id} onPress={() => update({ analysisModel: m.id })} />
              ))}
            </View>
          ) : null}
          <View style={styles.buttons}>
            <Button testID="claude-models" label={models ? 'Modelle neu laden' : 'Modell wählen'} icon="list-outline" loading={busy} onPress={loadModels} />
            <Button testID="claude-key-remove" label="Schlüssel entfernen" icon="trash-outline" variant="ghost" onPress={remove} />
          </View>
        </>
      ) : stored === null ? (
        <>
          <TextField
            testID="claude-key-input"
            value={input}
            onChangeText={setInput}
            placeholder="sk-ant-…"
            secureTextEntry
            autoCapitalize="none"
            icon="key-outline"
            onSubmitEditing={save}
          />
          <Button testID="claude-key-save" label="Prüfen und speichern" icon="checkmark" variant="primary" loading={busy} disabled={!input.trim()} onPress={save} />
        </>
      ) : null}
      {error ? (
        <AppText style={{ color: colors.danger }} testID="claude-error">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
