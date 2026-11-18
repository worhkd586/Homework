import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Course } from './src/domain/types';
import { loadSaved, newId, writeSaved, type SavedCourse } from './src/lib/savedCourses';
import SetupScreen, { type CourseOptions } from './src/screens/SetupScreen';
import ResultScreen from './src/screens/ResultScreen';

/** 지금 보고 있는 코스들. savedIds[i]가 있으면 그 코스는 "내 코스"에 저장된 것 (수정하면 자동 저장) */
interface Current {
  options: Course[];
  selected: number;
  note?: string;
  savedIds: (string | undefined)[];
}

export default function App() {
  const [current, setCurrent] = useState<Current | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [saved, setSaved] = useState<SavedCourse[]>([]);

  useEffect(() => {
    loadSaved().then(setSaved);
  }, []);

  // 안드로이드 뒤로가기: 결과 화면이면 선택 화면으로 (보던 코스는 남겨 둔다)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showResult) {
        setShowResult(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [showResult]);

  function persist(list: SavedCourse[]) {
    setSaved(list);
    writeSaved(list);
  }

  function changeCourse(course: Course) {
    if (!current) return;
    const options = current.options.map((c, i) => (i === current.selected ? course : c));
    setCurrent({ ...current, options });
    const id = current.savedIds[current.selected];
    if (id) persist(saved.map((s) => (s.id === id ? { ...s, course, savedAt: new Date().toISOString() } : s)));
  }

  function saveCourse() {
    if (!current || current.savedIds[current.selected]) return;
    const id = newId();
    persist([{ id, savedAt: new Date().toISOString(), course: current.options[current.selected] }, ...saved]);
    setCurrent({ ...current, savedIds: current.savedIds.map((s, i) => (i === current.selected ? id : s)) });
  }

  function openSaved(item: SavedCourse) {
    setCurrent({ options: [item.course], selected: 0, savedIds: [item.id] });
    setShowResult(true);
  }

  function deleteSaved(id: string) {
    persist(saved.filter((s) => s.id !== id));
    if (current) setCurrent({ ...current, savedIds: current.savedIds.map((s) => (s === id ? undefined : s)) });
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* 선택 화면은 숨겨만 둬서, 돌아왔을 때 고른 값이 그대로 남아 있게 한다 */}
      <View style={{ flex: 1, display: showResult ? 'none' : 'flex' }}>
        <SetupScreen
          saved={saved}
          hasCurrent={!!current}
          onResume={() => setShowResult(true)}
          onOpenSaved={openSaved}
          onDeleteSaved={deleteSaved}
          onResult={(r: CourseOptions) => {
            setCurrent({ options: r.options, selected: 0, note: r.note, savedIds: r.options.map(() => undefined) });
            setShowResult(true);
          }}
        />
      </View>
      {showResult && current && (
        <ResultScreen
          options={current.options}
          note={current.note}
          selected={current.selected}
          isSaved={!!current.savedIds[current.selected]}
          onSelect={(i) => setCurrent({ ...current, selected: i })}
          onChange={changeCourse}
          onSave={saveCourse}
          onBack={() => setShowResult(false)}
        />
      )}
    </SafeAreaProvider>
  );
}
