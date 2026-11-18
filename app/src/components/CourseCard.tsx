import type { Course } from '../domain/types';
import { CATEGORY_EMOJI, formatMinute } from '../domain/timeSlots';

const GRADIENTS: Record<string, string> = {
  seongsu: 'linear-gradient(135deg,#7a1f1f,#2b0d0d)',
  hongdae: 'linear-gradient(135deg,#5b2a86,#1c0f2b)',
  gangnam: 'linear-gradient(135deg,#1f4e79,#0c1a2b)',
  jamsil: 'linear-gradient(135deg,#0f6b5c,#0a211d)',
  euljiro: 'linear-gradient(135deg,#8a5a14,#2a1a06)',
};

export default function CourseCard({ course, onClick }: { course: Course; onClick: () => void }) {
  const first = course.stops[0];
  const last = course.stops[course.stops.length - 1];
  return (
    <button className="course-card" onClick={onClick} style={{ background: GRADIENTS[course.request.regionId] ?? '#222' }}>
      <div className="course-card-emoji">{course.stops.map((s) => CATEGORY_EMOJI[s.place.category]).join(' ')}</div>
      <div className="course-card-body">
        <strong>{course.title}</strong>
        <span>{course.stops.map((s) => s.place.name).join(' → ')}</span>
        {first && last && (
          <em>
            {formatMinute(first.arriveMinute)}–{formatMinute(last.leaveMinute)} · 이동 {course.totalTravelMinutes}분
          </em>
        )}
      </div>
    </button>
  );
}
