import type { LatLng, TravelEstimate } from '../../domain/types';

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 직선거리 기반 대략적인 이동 추정 (목업용). 1.2km 이하는 도보, 그 이상은 대중교통. */
export function roughTravel(from: LatLng, to: LatLng): TravelEstimate {
  const straight = haversineMeters(from, to);
  const road = Math.round(straight * 1.3); // 실제 길은 직선보다 길다
  if (road <= 1200) {
    return { mode: 'walk', minutes: Math.max(1, Math.round(road / 70)), distanceMeters: road };
  }
  // 대기·환승 10분 + 평균 20km/h
  return { mode: 'transit', minutes: Math.round(10 + road / 333), distanceMeters: road };
}
