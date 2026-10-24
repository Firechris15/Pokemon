import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CardDetailModal } from '@/components/cards/CardDetailModal';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DialogHost } from '@/components/ui/dialogs';
import { getDb } from '@/db/database';
import { useCardDb } from '@/features/cards/store';
import { useDecks } from '@/features/decks/store';
import { useSettings } from '@/features/settings/store';
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
  await getDb();
  await Promise.all([useSettings.getState().load(), useCardDb.getState().refreshInfo(), useDecks.getState().load()]);
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
                <Stack.Screen name="cards" options={{ title: 'Kartendatenbank' }} />
                <Stack.Screen name="settings" options={{ title: 'Einstellungen' }} />
              </Stack>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.bg },
});
