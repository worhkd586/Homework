import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Course } from './src/domain/types';
import SetupScreen, { type CourseOptions } from './src/screens/SetupScreen';
import ResultScreen from './src/screens/ResultScreen';

export default function App() {
  const [result, setResult] = useState<CourseOptions | null>(null);
  const [selected, setSelected] = useState(0);

  // 안드로이드 뒤로가기: 결과 화면이면 선택 화면으로
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (result) {
        setResult(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [result]);

  function updateSelected(course: Course) {
    if (!result) return;
    setResult({ ...result, options: result.options.map((c, i) => (i === selected ? course : c)) });
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* 선택 화면은 숨겨만 둬서, 돌아왔을 때 고른 값이 그대로 남아 있게 한다 */}
      <View style={{ flex: 1, display: result ? 'none' : 'flex' }}>
        <SetupScreen
          onResult={(r) => {
            setResult(r);
            setSelected(0);
          }}
        />
      </View>
      {result && (
        <ResultScreen
          options={result.options}
          note={result.note}
          selected={selected}
          onSelect={setSelected}
          onChange={updateSelected}
          onBack={() => setResult(null)}
        />
      )}
    </SafeAreaProvider>
  );
}
