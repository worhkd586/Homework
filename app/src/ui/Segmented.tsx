import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import { colors } from './theme';

interface Option<T extends string> {
  id: T;
  label: string;
  sub?: string;
}

/** 한 줄짜리 선택 버튼 묶음 (지역 그룹, 시간대, 이동 수단, 코스 A/B/C) */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  role = 'button',
}: {
  options: Option<T>[];
  value: T | undefined;
  onChange: (id: T) => void;
  role?: 'button' | 'tab';
}) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            style={[styles.item, on && styles.itemOn]}
            onPress={() => onChange(o.id)}
            accessibilityRole={role}
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {o.label}
            </Text>
            {o.sub ? (
              <Text style={[styles.sub, on && styles.subOn]} numberOfLines={1}>
                {o.sub}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: colors.surface },
  item: { flex: 1, minHeight: 44, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: colors.card, shadowColor: '#1c1639', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  label: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  labelOn: { color: colors.accent, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 1 },
  subOn: { color: colors.text },
});
