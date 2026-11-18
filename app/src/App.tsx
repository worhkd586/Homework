import { useState } from 'react';
import type { Course, CourseRequest } from './domain/types';
import { recommender } from './lib/services';
import HomeScreen from './screens/HomeScreen';
import BuilderScreen from './screens/BuilderScreen';
import ResultScreen from './screens/ResultScreen';

type View = { name: 'home' } | { name: 'builder'; regionId?: string } | { name: 'result'; course: Course };

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function run(request: CourseRequest) {
    setLoading(true);
    setError(undefined);
    try {
      const course = await recommender.recommend(request);
      setView({ name: 'result', course });
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'home' })}>
          오늘<span>어디가</span>
        </button>
        {view.name !== 'builder' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setView({ name: 'builder' })}>
            + 코스 만들기
          </button>
        )}
      </header>
      {error && <div className="banner banner-error">{error}</div>}
      {view.name === 'home' && (
        <HomeScreen onStart={(regionId) => setView({ name: 'builder', regionId })} onOpenCourse={(course) => setView({ name: 'result', course })} />
      )}
      {view.name === 'builder' && <BuilderScreen initialRegionId={view.regionId} loading={loading} onSubmit={run} onCancel={() => setView({ name: 'home' })} />}
      {view.name === 'result' && (
        <ResultScreen
          course={view.course}
          loading={loading}
          onReplace={(placeId) =>
            run({ ...view.course.request, excludePlaceIds: [...(view.course.request.excludePlaceIds ?? []), placeId] })
          }
          onEdit={() => setView({ name: 'builder', regionId: view.course.request.regionId })}
        />
      )}
    </div>
  );
}
