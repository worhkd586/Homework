import { colors } from './theme';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Text from './Text';
import type { Place } from '../domain/types';
import { CATEGORY_EMOJI } from '../domain/timeSlots';
import { placeProvider } from '../lib/services';

/** 장소 사진 (다음 이미지 검색). 사진이 없거나 안 열리면 종류 이모지 칸으로 대신한다. */
export default function PlacePhoto({ place, size = 64 }: { place: Place; size?: number }) {
  const [uri, setUri] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUri(undefined);
    setFailed(false);
    placeProvider.photoOf?.(place).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [place.id]);

  const box = { width: size, height: size, borderRadius: Math.round(size / 6) };
  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.box, box]} onError={() => setFailed(true)} accessibilityLabel={`${place.name} 사진`} />;
  }
  return (
    <View style={[styles.box, styles.empty, box]}>
      <Text style={{ fontSize: Math.round(size * 0.42) }}>{CATEGORY_EMOJI[place.category]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, overflow: 'hidden' },
  empty: { alignItems: 'center', justifyContent: 'center' },
});
