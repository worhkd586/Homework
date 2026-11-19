import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Text from './Text';
import { colors } from './theme';

/**
 * 카카오 검색 썸네일(130x130)을 큰 카드에 맞는 크기로 바꿔 요청한다.
 * 큰 크기가 안 열리면 원래 썸네일로, 그것도 안 되면 placeholder로 내려간다.
 */
export function largerThumb(url: string): string {
  return url.replace(/\/argon\/\d+x\d+_\d+_c\//, '/argon/600x400_85_c/');
}

/** 각 주소 뒤에 (카카오 썸네일이면) 더 큰 썸네일을 끼워 넣고 중복을 뺀다 */
function expand(list: string[]): string[] {
  const out: string[] = [];
  for (const u of list) {
    for (const v of [largerThumb(u), u]) if (!out.includes(v)) out.push(v);
  }
  return out;
}

interface Props {
  /** 사진 주소(들)를 돌려주는 함수. 여러 개면 앞에서부터 시도 (없거나 다 실패하면 placeholder) */
  load: () => Promise<string | string[] | undefined>;
  /** 다시 불러야 하는 기준 (장소 id, 동네 id 등) */
  loadKey: string;
  style?: StyleProp<ViewStyle>;
  /** 사진이 없을 때 가운데 보여줄 이모지 */
  emoji?: string;
  /** 사진 위 아래쪽에 어둡게 깔고 글자를 올린다 */
  children?: ReactNode;
  label?: string;
}

/** 큰 사진 카드: 사진 + (선택) 아래쪽 어두운 띠 위의 글자 */
export default function Photo({ load, loadKey, style, emoji, children, label }: Props) {
  const [uris, setUris] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    setUris([]);
    setIndex(0);
    load().then((u) => {
      if (!alive || !u) return;
      setUris(expand(Array.isArray(u) ? u : [u]));
    });
    return () => {
      alive = false;
    };
  }, [loadKey]);

  const uri = uris[index];
  return (
    <View style={[styles.box, style]} accessibilityLabel={label}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setIndex((i) => i + 1)} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.empty, children ? styles.emptyDark : null]}>{emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}</View>
      )}
      {children ? (
        <>
          {uri ? <View style={styles.shadeSoft} /> : null}
          {uri ? <View style={styles.shade} /> : null}
          <View style={styles.caption}>{children}</View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: colors.surface, justifyContent: 'flex-end' },
  empty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e9e6e2' },
  emptyDark: { backgroundColor: '#2a2a2d' },
  emoji: { fontSize: 34, opacity: 0.8 },
  shadeSoft: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%', backgroundColor: 'rgba(0,0,0,0.18)' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', backgroundColor: 'rgba(0,0,0,0.32)' },
  caption: { padding: 12 },
});
