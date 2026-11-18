import type { CourseStop } from '../domain/types';

/**
 * 동선 미리보기. 실제 지도 없이 좌표를 상대 위치로만 그린다.
 * 네이버 지도 연동 시 이 컴포넌트를 NaverMap(마커 + 폴리라인)으로 바꾸면 된다.
 */
export default function RouteMap({ stops }: { stops: CourseStop[] }) {
  if (!stops.length) return null;
  const W = 320;
  const H = 200;
  const pad = 28;
  const lats = stops.map((s) => s.place.location.lat);
  const lngs = stops.map((s) => s.place.location.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(maxLat - minLat, maxLng - minLng, 0.002);
  const x = (lng: number) => pad + ((lng - minLng) / span) * (W - pad * 2) + ((span - (maxLng - minLng)) / span) * (W - pad * 2) * 0.5;
  const y = (lat: number) => H - pad - ((lat - minLat) / span) * (H - pad * 2) - ((span - (maxLat - minLat)) / span) * (H - pad * 2) * 0.5;
  const pts = stops.map((s) => [x(s.place.location.lng), y(s.place.location.lat)] as const);

  return (
    <figure className="route-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="코스 동선">
        <polyline points={pts.map((p) => p.join(',')).join(' ')} className="route-line" />
        {pts.map(([px, py], i) => (
          <g key={stops[i].place.id}>
            <circle cx={px} cy={py} r={11} className={stops[i].pinned ? 'route-dot pinned' : 'route-dot'} />
            <text x={px} y={py + 4} textAnchor="middle" className="route-num">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>지도 미리보기 · 네이버 지도 연동 예정</figcaption>
    </figure>
  );
}
