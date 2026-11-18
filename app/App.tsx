import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Course } from './src/domain/types';
import SetupScreen from './src/screens/SetupScreen';
import ResultScreen from './src/screens/ResultScreen';

export default function App() {
  const [course, setCourse] = useState<Course | null>(null);

  // 안드로이드 뒤로가기: 결과 화면이면 선택 화면으로
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (course) {
        setCourse(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [course]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {course ? <ResultScreen course={course} onChange={setCourse} onBack={() => setCourse(null)} /> : <SetupScreen onCourse={setCourse} />}
    </SafeAreaProvider>
  );
}
