import { useEffect, useMemo, useState } from 'react';
import type { CourseRequest, PinnedPlace, Place, Region, TimeSlotId } from '../domain/types';
import { CATEGORY_EMOJI, CATEGORY_LABEL, TIME_SLOTS, formatMinute, getTimeSlot, parseHHMM } from '../domain/timeSlots';
import { placeProvider } from '../lib/services';

const PREFERENCES = ['조용한', '분위기', '뷰맛집', '실내', '야외', '디저트', '활기찬', '레트로'];
const STEPS = ['지역', '시간대', '꼭 갈 곳'];

interface Props {
  initialRegionId?: string;
  loading: boolean;
  onSubmit: (req: CourseRequest) => void;
  onCancel: () => void;
}

export default function BuilderScreen({ initialRegionId, loading, onSubmit, onCancel }: Props) {
  const [step, setStep] = useState(initialRegionId ? 1 : 0);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState(initialRegionId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slotId, setSlotId] = useState<TimeSlotId>('evening');
  const [start, setStart] = useState(getTimeSlot('evening').defaultStart);
  const [end, setEnd] = useState(getTimeSlot('evening').defaultEnd);
  const [pins, setPins] = useState<PinnedPlace[]>([]);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);

  useEffect(() => {
    placeProvider.listRegions().then(setRegions);
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    let alive = true;
    // 지역 안을 먼저, 검색어가 있으면 전체 지역에서 찾는다
    placeProvider.searchPlaces(query, query ? undefined : regionId).then((r) => alive && setResults(r.slice(0, 12)));
    return () => {
      alive = false;
    };
  }, [query, step, regionId]);

  const regionName = useMemo(() => regions.find((r) => r.id === regionId)?.name, [regions, regionId]);

  function pickSlot(id: TimeSlotId) {
    const slot = getTimeSlot(id);
    setSlotId(id);
    setStart(slot.defaultStart);
    setEnd(slot.defaultEnd);
  }

  function togglePin(place: Place) {
    setPins((ps) => (ps.some((p) => p.place.id === place.id) ? ps.filter((p) => p.place.id !== place.id) : [...ps, { place }]));
  }

  function setPinTime(id: string, minute: number | undefined) {
    setPins((ps) => ps.map((p) => (p.place.id === id ? { ...p, fixedMinute: minute } : p)));
  }

  const canNext = step === 0 ? !!regionId : step === 1 ? end > start : true;

  function submit() {
    if (!regionId) return;
    onSubmit({ regionId, date, slotId, startMinute: start, endMinute: end, pins, preferences: prefs });
  }

  return (
    <main className="builder">
      <ol className="stepper">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''}>
            <button onClick={() => (i < step || (i === step + 1 && canNext)) && setStep(i)}>
              <span>{i + 1}</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h1 className="screen-title">어디서 만나요?</h1>
          <div className="region-grid">
            {regions.map((r) => (
              <button key={r.id} className={`region-tile big ${regionId === r.id ? 'selected' : ''}`} onClick={() => setRegionId(r.id)}>
                <strong>{r.name}</strong>
                <span>{r.tagline}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="screen-title">언제 만나요?</h1>
          <label className="field">
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="slot-grid">
            {TIME_SLOTS.map((s) => (
              <button key={s.id} className={`slot ${slotId === s.id ? 'selected' : ''}`} onClick={() => pickSlot(s.id)}>
                <span className="slot-emoji">{s.emoji}</span>
                <strong>{s.label}</strong>
                <span>
                  {formatMinute(s.defaultStart)}–{formatMinute(s.defaultEnd)}
                </span>
              </button>
            ))}
          </div>
          <div className="time-range">
            <label className="field">
              <span>시작</span>
              <input type="time" step={600} value={formatMinute(start)} onChange={(e) => setStart(parseHHMM(e.target.value))} />
            </label>
            <label className="field">
              <span>끝</span>
              <input
                type="time"
                step={600}
                value={formatMinute(end)}
                onChange={(e) => {
                  const m = parseHHMM(e.target.value);
                  setEnd(m <= start && m < 6 * 60 ? m + 1440 : m); // 자정 넘김
                }}
              />
            </label>
          </div>
          {end <= start && <p className="hint error">끝나는 시각이 시작보다 늦어야 해요.</p>}
          <p className="hint">
            총 {Math.floor((end - start) / 60)}시간 {(end - start) % 60 ? `${(end - start) % 60}분` : ''}
          </p>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="screen-title">꼭 갈 곳이 있나요?</h1>
          <p className="hint">여자친구가 찜해둔 곳이 있다면 넣어 주세요. 예약 시간이 정해졌으면 시간을 고정하고, 아니면 동선에 맞춰 순서를 정해 드려요. 없으면 건너뛰어도 돼요.</p>

          {pins.length > 0 && (
            <ul className="pin-list">
              {pins.map((p) => (
                <li key={p.place.id} className="pin">
                  <div>
                    <strong>
                      {CATEGORY_EMOJI[p.place.category]} {p.place.name}
                    </strong>
                    <span className="muted">{regions.find((r) => r.id === p.place.regionId)?.name}</span>
                  </div>
                  <div className="pin-controls">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={p.fixedMinute !== undefined}
                        onChange={(e) => setPinTime(p.place.id, e.target.checked ? Math.max(start, p.place.openMinute) : undefined)}
                      />
                      {p.fixedMinute !== undefined ? '🔒 시간 고정' : '📌 순서 자유'}
                    </label>
                    {p.fixedMinute !== undefined && (
                      <input type="time" step={600} value={formatMinute(p.fixedMinute)} onChange={(e) => setPinTime(p.place.id, parseHHMM(e.target.value))} />
                    )}
                    <button className="icon-btn" aria-label="빼기" onClick={() => togglePin(p.place)}>
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <input className="search" placeholder={`장소 검색 (지금은 ${regionName ?? ''} 목록)`} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="place-results">
            {results.map((p) => {
              const on = pins.some((x) => x.place.id === p.id);
              return (
                <button key={p.id} className={`place-chip ${on ? 'selected' : ''}`} onClick={() => togglePin(p)}>
                  <span>{CATEGORY_EMOJI[p.category]}</span>
                  <span>
                    <strong>{p.name}</strong>
                    <em>
                      {CATEGORY_LABEL[p.category]} · ★{p.rating.toFixed(1)}
                    </em>
                  </span>
                  <span className="plus">{on ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>

          <h2 className="sub-title">취향 (선택)</h2>
          <div className="chips">
            {PREFERENCES.map((t) => (
              <button key={t} className={`chip ${prefs.includes(t) ? 'selected' : ''}`} onClick={() => setPrefs((ps) => (ps.includes(t) ? ps.filter((x) => x !== t) : [...ps, t]))}>
                {t}
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="builder-actions">
        <button className="btn btn-ghost" onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
          {step === 0 ? '취소' : '이전'}
        </button>
        {step < 2 ? (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
            다음
          </button>
        ) : (
          <button className="btn btn-primary" disabled={loading} onClick={submit}>
            {loading ? '코스 짜는 중…' : '✨ 코스 추천받기'}
          </button>
        )}
      </footer>
    </main>
  );
}
