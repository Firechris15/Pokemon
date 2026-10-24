import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, font, radius, spacing } from '@/theme';

import type { IconName } from './Button';

export function TextField({
  icon,
  onClear,
  style,
  ...props
}: TextInputProps & { icon?: IconName; onClear?: () => void }) {
  return (
    <View style={[styles.wrapper, props.multiline && styles.multiline, style]}>
      {icon ? <Ionicons name={icon} size={18} color={colors.textFaint} /> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline]}
      />
      {onClear && props.value ? (
        <Pressable accessibilityLabel="Eingabe löschen" onPress={onClear} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 42,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: spacing.sm },
  input: { flex: 1, color: colors.text, fontSize: font.body, paddingVertical: 8, outlineStyle: 'none' } as never,
  inputMultiline: { minHeight: 140, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: font.label },
});
