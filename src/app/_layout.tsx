import { DarkTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CardDetailModal } from '@/components/cards/CardDetailModal';
import { CardPickerModal } from '@/components/cards/CardPickerModal';
import { InstanceSheet } from '@/components/duel/InstanceSheet';
import { EngineHostView } from '@/features/engine/host';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { confirmDialog, DialogHost } from '@/components/ui/dialogs';
import { getDb } from '@/db/database';
import { useCardDb } from '@/features/cards/store';
import { useCombos } from '@/features/combos/store';
import { useDecks } from '@/features/decks/store';
import { useDuel } from '@/features/engine/duelStore';
import { usePuzzles } from '@/features/puzzles/store';
import { useSettings } from '@/features/settings/store';
import { loadBuild, newerBuild } from '@/lib/appUpdate';
import { colors, spacing } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

async function bootstrap() {
  // Web: if a newer version was deployed since this page was loaded, load it before anything else.
  const build = await newerBuild();
  if (build && loadBuild(build)) return new Promise<void>(() => undefined);
  await getDb();
  await Promise.all([
    useSettings.getState().load(),
    useCardDb.getState().refreshInfo(),
    useDecks.getState().load(),
    useCombos.getState().load(),
    usePuzzles.getState().load(),
  ]);
}

export default function RootLayout() {
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading');

  const run = () =>
    bootstrap()
      .then(() => setState('ready'))
      .catch((error) => setState({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => SplashScreen.hideAsync().catch(() => undefined));

  useEffect(() => {
    run();
  }, []);

  // Coming back to the app (e.g. the home-screen app on the iPad): offer a newer version, but never in the middle of a duel.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      const build = await newerBuild();
      const status = useDuel.getState().status;
      if (!build || status === 'playing' || status === 'preparing') return;
      if (await confirmDialog({ title: 'Neue Version verfügbar', message: 'Die App wurde aktualisiert. Jetzt neu laden?', confirmLabel: 'Neu laden' })) loadBuild(build);
    });
    return () => subscription.remove();
  }, []);

  const retry = () => {
    setState('loading');
    run();
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          {state === 'ready' ? (
            <>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface },
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontWeight: '700' },
                  contentStyle: { backgroundColor: colors.bg },
                  headerBackButtonDisplayMode: 'minimal',
                }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="decks/index" options={{ title: 'Decks' }} />
                <Stack.Screen name="decks/[id]" options={{ title: 'Deck' }} />
                <Stack.Screen name="decks/import" options={{ title: 'Deck importieren', presentation: 'modal' }} />
                <Stack.Screen name="hand/index" options={{ title: 'Hand-Trainer' }} />
                <Stack.Screen name="hand/[deckId]" options={{ title: 'Hand-Trainer' }} />
                <Stack.Screen name="combos/index" options={{ title: 'Combos' }} />
                <Stack.Screen name="combos/[id]" options={{ title: 'Combo' }} />
                <Stack.Screen name="combos/quiz/[id]" options={{ title: 'Quiz' }} />
                <Stack.Screen name="combos/review" options={{ title: 'Wiederholung' }} />
                <Stack.Screen name="puzzles/index" options={{ title: 'Puzzles' }} />
                <Stack.Screen name="puzzles/[id]" options={{ title: 'Puzzle' }} />
                <Stack.Screen name="puzzles/edit/[id]" options={{ title: 'Puzzle-Editor' }} />
                <Stack.Screen name="duel/index" options={{ title: 'KI-Duell' }} />
                <Stack.Screen name="duel/play" options={{ title: 'Duell', gestureEnabled: false }} />
                <Stack.Screen name="replays/index" options={{ title: 'Analyse' }} />
                <Stack.Screen name="replays/[id]" options={{ title: 'Replay' }} />
                <Stack.Screen name="cards" options={{ title: 'Kartendatenbank' }} />
                <Stack.Screen name="settings" options={{ title: 'Einstellungen' }} />
              </Stack>
              <EngineHostView />
              <InstanceSheet />
              <CardPickerModal />
              <CardDetailModal />
              <DialogHost />
            </>
          ) : state === 'loading' ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <View style={styles.center}>
              <AppText variant="title">Datenbank konnte nicht geöffnet werden</AppText>
              <AppText variant="muted" style={{ textAlign: 'center' }}>
                {state.error}
              </AppText>
              <Button label="Erneut versuchen" variant="primary" onPress={retry} />
            </View>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Shown instead of a blank screen when a screen crashes. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.center} testID="app-error">
      <AppText variant="title">Da ist etwas schiefgelaufen</AppText>
      <AppText variant="muted" style={{ textAlign: 'center' }}>
        {error.message}
      </AppText>
      <Button label="Erneut versuchen" variant="primary" onPress={retry} />
      {Platform.OS === 'web' ? <Button label="App neu laden" icon="refresh" onPress={() => window.location.reload()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.bg },
});
