import { useEffect, useState } from 'react';
import type { Course, CourseRequest, Region } from '../domain/types';
import { getTimeSlot } from '../domain/timeSlots';
import { placeProvider, recommender } from '../lib/services';
import CourseCard from '../components/CourseCard';

interface Row {
  title: string;
  requests: CourseRequest[];
}

const today = () => new Date().toISOString().slice(0, 10);
const req = (regionId: string, slotId: CourseRequest['slotId'], preferences: string[] = []): CourseRequest => {
  const slot = getTimeSlot(slotId);
  return { regionId, slotId, date: today(), startMinute: slot.defaultStart, endMinute: slot.defaultEnd, pins: [], preferences };
};

const ROWS: Row[] = [
  { title: '오늘 저녁, 여기 어때요', requests: ['seongsu', 'hongdae', 'gangnam', 'jamsil', 'euljiro'].map((r) => req(r, 'evening')) },
  { title: '비 오는 날 실내 코스', requests: ['seongsu', 'gangnam', 'hongdae', 'jamsil'].map((r) => req(r, 'afternoon', ['실내'])) },
  { title: '야경 보러 가는 밤', requests: ['jamsil', 'euljiro', 'gangnam', 'hongdae'].map((r) => req(r, 'night', ['뷰맛집', '분위기'])) },
  { title: '여유로운 점심 데이트', requests: ['hongdae', 'euljiro', 'seongsu', 'jamsil'].map((r) => req(r, 'lunch', ['조용한'])) },
];

export default function HomeScreen({ onStart, onOpenCourse }: { onStart: (regionId?: string) => void; onOpenCourse: (c: Course) => void }) {
  const [rows, setRows] = useState<Array<{ title: string; courses: Course[] }>>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, built] = await Promise.all([
        placeProvider.listRegions(),
        Promise.all(ROWS.map(async (row) => ({ title: row.title, courses: await Promise.all(row.requests.map((r) => recommender.recommend(r))) }))),
      ]);
      if (alive) {
        setRegions(rs);
        setRows(built);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main>
      <section className="hero">
        <div className="hero-glow" aria-hidden />
        <div className="hero-body">
          <p className="eyebrow">AI 데이트 코스</p>
          <h1>
            어디 갈지 고민은 그만.
            <br />
            지역과 시간만 골라요.
          </h1>
          <p className="hero-sub">시간대에 맞춰 식사·카페·산책 순서를 짜고, 이동 시간까지 계산해 드려요. 여자친구가 찜해둔 곳은 꼭 넣어서요.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => onStart()}>
              ▶ 코스 만들기
            </button>
            {rows[0]?.courses[0] && (
              <button className="btn btn-secondary" onClick={() => onOpenCourse(rows[0].courses[0])}>
                ⓘ 추천 코스 보기
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="row">
        <h2 className="row-title">지역으로 시작하기</h2>
        <div className="row-scroll">
          {regions.map((r) => (
            <button key={r.id} className="region-tile" onClick={() => onStart(r.id)}>
              <strong>{r.name}</strong>
              <span>{r.tagline}</span>
            </button>
          ))}
        </div>
      </section>

      {rows.map((row) => (
        <section className="row" key={row.title}>
          <h2 className="row-title">{row.title}</h2>
          <div className="row-scroll">
            {row.courses.map((c, i) => (
              <CourseCard key={i} course={c} onClick={() => onOpenCourse(c)} />
            ))}
          </div>
        </section>
      ))}
      {!rows.length && <p className="muted pad">추천 코스를 불러오는 중…</p>}
    </main>
  );
}
