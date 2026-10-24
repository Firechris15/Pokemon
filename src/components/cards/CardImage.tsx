import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useCardImage } from '@/features/cards/imageCache';
import type { FrameType, ImageSize } from '@/features/cards/types';
import { CARD_ASPECT, colors, frameColors, radius } from '@/theme';

type Props = {
  imageId: number | null;
  size: ImageSize;
  width: number;
  /** Shown on the placeholder while the image loads (or when offline). */
  name?: string;
  frameType?: FrameType;
  style?: StyleProp<ViewStyle>;
  /** A lower resolution image to show while the full one is loading. */
  fallbackSize?: ImageSize;
};

/** Card artwork from the local cache with a frame-coloured placeholder. */
export const CardImage = memo(function CardImage({ imageId, size, width, name, frameType, style, fallbackSize }: Props) {
  const { uri } = useCardImage(imageId, size);
  const fallback = useCardImage(fallbackSize && !uri ? imageId : null, fallbackSize ?? 'small');
  const height = width / CARD_ASPECT;
  const source = uri ?? fallback.uri;
  const frame = frameType ? frameColors[frameType] : colors.surfaceRaised;

  return (
    <View style={[{ width, height, borderRadius: Math.max(3, width * 0.035) }, styles.container, style]}>
      {source ? (
        <Image
          source={{ uri: source }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory"
          recyclingKey={source}
          accessibilityLabel={name}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: frame }]}>
          <View style={styles.placeholderArt} />
          {name && width >= 48 ? (
            <Text
              numberOfLines={3}
              style={[styles.placeholderText, { fontSize: Math.max(8, Math.min(14, width / 9)) }, frameType === 'xyz' && { color: '#eee' }]}>
              {name}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // Touches are handled by the parent (tap, swipe); this also stops the
  // browser's native image drag from swallowing swipe gestures on web.
  container: { overflow: 'hidden', backgroundColor: colors.surfaceRaised, pointerEvents: 'none' },
  placeholder: { padding: '8%', justifyContent: 'space-between' },
  placeholderArt: {
    flex: 1,
    marginVertical: '12%',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  placeholderText: { color: '#111', fontWeight: '700', textAlign: 'center' },
});
