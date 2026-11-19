import type { LatLng, TravelChoice, TravelEstimate } from '../../domain/types';

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 걸어서만 고르면 이보다 먼 구간은 피한다 (실제 길 기준) */
export const MAX_WALK_METERS = 1600;

/**
 * 직선거리 기반 대략적인 이동 추정.
 * - transit(기본): 1.2km 이하는 도보, 그 이상은 대중교통
 * - walk: 전부 도보 (분속 70m)
 * - car: 500m 이하는 도보, 그 이상은 차 (주차 5분 + 시내 24km/h, 5km 넘는 구간은 40km/h)
 */
export function roughTravel(from: LatLng, to: LatLng, choice: TravelChoice = 'transit'): TravelEstimate {
  const straight = haversineMeters(from, to);
  const road = Math.round(straight * 1.3); // 실제 길은 직선보다 길다
  const walk: TravelEstimate = { mode: 'walk', minutes: Math.max(1, Math.round(road / 70)), distanceMeters: road };
  if (choice === 'walk') return walk;
  if (choice === 'car') {
    if (road <= 500) return walk;
    const drive = road <= 5000 ? road / 400 : 12.5 + (road - 5000) / 667;
    return { mode: 'car', minutes: Math.round(5 + drive), distanceMeters: road };
  }
  if (road <= 1200) {
    return { mode: 'walk', minutes: Math.max(1, Math.round(road / 70)), distanceMeters: road };
  }
  // 대기·환승 10분 + 평균 20km/h
  return { mode: 'transit', minutes: Math.round(10 + road / 333), distanceMeters: road };
}
