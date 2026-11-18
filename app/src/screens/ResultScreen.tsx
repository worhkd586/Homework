import type { Course } from '../domain/types';
import { CATEGORY_EMOJI, formatMinute, getTimeSlot } from '../domain/timeSlots';
import RouteMap from '../components/RouteMap';

interface Props {
  course: Course;
  loading: boolean;
  onReplace: (placeId: string) => void;
  onEdit: () => void;
}

export default function ResultScreen({ course, loading, onReplace, onEdit }: Props) {
  const slot = getTimeSlot(course.request.slotId);
  const { stops, legs } = course;
  return (
    <main className="result">
      <section className="result-head">
        <p className="eyebrow">
          {course.request.date} · {slot.emoji} {slot.label} {formatMinute(course.request.startMinute)}–{formatMinute(course.request.endMinute)}
        </p>
        <h1>{course.title}</h1>
        <p className="muted">
          {stops.length}곳 · 총 이동 {course.totalTravelMinutes}분
        </p>
        <div className="hero-actions">
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>
            조건 바꾸기
          </button>
          <button className="btn btn-ghost btn-sm" disabled title="마지막 단계에서 추가될 기능이에요">
            📅 캘린더에 추가 (준비 중)
          </button>
        </div>
      </section>

      {course.warnings.length > 0 && (
        <ul className="warnings">
          {course.warnings.map((w, i) => (
            <li key={i} className={`warning warning-${w.kind}`}>
              ⚠️ {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="result-body">
        <ol className="timeline">
          {stops.map((s, i) => (
            <li key={s.place.id}>
              <div className="stop">
                <div className="stop-time">
                  <strong>{formatMinute(s.arriveMinute)}</strong>
                  <span>{formatMinute(s.leaveMinute)}</span>
                </div>
                <div className="stop-card">
                  <div className="stop-head">
                    <span className="stop-emoji">{CATEGORY_EMOJI[s.place.category]}</span>
                    <div>
                      <strong>{s.place.name}</strong>
                      <span className="muted">{s.place.description}</span>
                    </div>
                    {s.fixedTime ? <span className="badge badge-lock">🔒 시간 고정</span> : s.pinned ? <span className="badge">📌 꼭 갈 곳</span> : null}
                  </div>
                  <p className="stop-reason">{s.reason}</p>
                  {!s.pinned && (
                    <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => onReplace(s.place.id)}>
                      ↻ 다른 곳으로
                    </button>
                  )}
                </div>
              </div>
              {legs[i] && (
                <div className="leg">
                  {legs[i].travel.mode === 'walk' ? '🚶 도보' : '🚇 대중교통(어림)'} {legs[i].travel.minutes}분 · {(legs[i].travel.distanceMeters / 1000).toFixed(1)}km
                  {s.slackMinutes > 0 && <span className="slack"> · 여유 {s.slackMinutes}분</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
        <aside>
          <RouteMap stops={stops} />
        </aside>
      </div>
    </main>
  );
}
