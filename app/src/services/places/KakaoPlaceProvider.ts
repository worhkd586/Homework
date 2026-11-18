import type { Place, PlaceCategory, Region } from '../../domain/types';
import type { PlaceProvider } from './PlaceProvider';
import { REGIONS, defaultStayMinutes } from './mockData';

/** 프록시(proxy/worker.js)가 돌려주는 카카오 장소 한 건 */
export interface KakaoDoc {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  phone: string;
}

const CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'culture', 'activity', 'walk', 'shop', 'bar'];

/**
 * 카카오는 평점·영업시간을 주지 않는다. 그래서
 * - 평점 대신 카카오의 정확도 순위로 4.8부터 조금씩 낮춘 점수를 쓰고
 * - 영업시간은 종류별로 흔한 시간으로 가정한다 (실제와 다를 수 있음 → 화면에 안내)
 */
const ASSUMED_HOURS: Record<PlaceCategory, [number, number]> = {
  restaurant: [11 * 60, 22 * 60],
  cafe: [10 * 60, 22 * 60],
  culture: [10 * 60, 19 * 60],
  activity: [11 * 60, 22 * 60],
  walk: [0, 24 * 60],
  shop: [11 * 60, 21 * 60],
  bar: [18 * 60, 26 * 60],
};

/** 카카오 분류 → 앱의 장소 종류 */
export function categoryOf(doc: KakaoDoc, hint?: PlaceCategory): PlaceCategory {
  const name = doc.category_name;
  if (/술집|와인|칵테일|바$|호프|이자카야|포장마차/.test(name)) return 'bar';
  if (doc.category_group_code === 'CE7' || /카페|디저트|제과|베이커리/.test(name)) return 'cafe';
  if (doc.category_group_code === 'FD6') return 'restaurant';
  if (doc.category_group_code === 'CT1' || /미술관|박물관|전시|공연|영화/.test(name)) return 'culture';
  if (doc.category_group_code === 'AT4' || /공원|산책|관광|명소/.test(name)) return 'walk';
  if (/공방|방탈출|보드게임|볼링|오락|체험|스포츠|레저|테마파크/.test(name)) return 'activity';
  if (/소품|잡화|쇼핑|패션|팝업/.test(name)) return 'shop';
  return hint ?? 'activity';
}

export function toPlace(doc: KakaoDoc, regionId: string, rank: number, hint?: PlaceCategory): Place {
  const category = categoryOf(doc, hint);
  const parts = doc.category_name.split('>').map((s) => s.trim()).filter(Boolean);
  const [open, close] = ASSUMED_HOURS[category];
  return {
    id: `kakao-${doc.id}`,
    name: doc.place_name,
    regionId,
    category,
    location: { lat: Number(doc.y), lng: Number(doc.x) },
    rating: Math.max(3.8, 4.8 - rank * 0.05),
    openMinute: open,
    closeMinute: close,
    stayMinutes: defaultStayMinutes(category),
    tags: parts.slice(1),
    description: [parts[parts.length - 1], doc.road_address_name || doc.address_name].filter(Boolean).join(' · '),
    url: doc.place_url || undefined,
  };
}

/** 프록시를 거쳐 카카오 로컬 API로 실제 장소를 가져온다. 지역별로 한 번 가져와서 기억해 둔다. */
export class KakaoPlaceProvider implements PlaceProvider {
  readonly name = 'kakao';
  private readonly cache = new Map<string, Promise<Place[]>>();

  constructor(
    private readonly proxyUrl: string,
    private readonly regions: Region[] = REGIONS,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<KakaoDoc[]> {
    const url = `${this.proxyUrl.replace(/\/$/, '')}${path}?${new URLSearchParams(params)}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`장소 서버 오류 (${res.status})`);
    const body = (await res.json()) as { documents?: KakaoDoc[] };
    return body.documents ?? [];
  }

  async listRegions(): Promise<Region[]> {
    return this.regions;
  }

  listPlaces(regionId: string): Promise<Place[]> {
    const cached = this.cache.get(regionId);
    if (cached) return cached;
    const task = this.load(regionId);
    this.cache.set(regionId, task);
    task.catch(() => this.cache.delete(regionId)); // 실패하면 다음에 다시 시도
    return task;
  }

  private async load(regionId: string): Promise<Place[]> {
    const region = this.regions.find((r) => r.id === regionId);
    if (!region) throw new Error(`unknown region: ${regionId}`);
    const lists = await Promise.all(
      CATEGORIES.map(async (kind) => {
        const docs = await this.get('/places', { kind, x: String(region.center.lng), y: String(region.center.lat), radius: '1500' });
        return docs.map((d, i) => toPlace(d, regionId, i, kind));
      }),
    );
    const seen = new Set<string>();
    return lists.flat().filter((p) => !seen.has(p.id) && seen.add(p.id));
  }

  async searchPlaces(query: string, regionId?: string): Promise<Place[]> {
    const region = this.regions.find((r) => r.id === regionId);
    if (!query.trim()) return region ? this.listPlaces(region.id) : [];
    const params: Record<string, string> = { q: query.trim() };
    if (region) Object.assign(params, { x: String(region.center.lng), y: String(region.center.lat) });
    const docs = await this.get('/search', params);
    return docs.map((d, i) => toPlace(d, region?.id ?? 'search', i));
  }
}

/** 실제 데이터가 안 될 때(오프라인, 프록시 미설정·오류) 목업으로 대신한다 */
export class FallbackPlaceProvider implements PlaceProvider {
  readonly name: string;
  lastError?: string;

  constructor(
    private readonly primary: PlaceProvider,
    private readonly fallback: PlaceProvider,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  private async tryBoth<T>(run: (p: PlaceProvider) => Promise<T>, empty: (v: T) => boolean): Promise<T> {
    try {
      const value = await run(this.primary);
      if (!empty(value)) {
        this.lastError = undefined;
        return value;
      }
      this.lastError = '실제 장소를 찾지 못했어요';
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
    }
    return run(this.fallback);
  }

  listRegions() {
    return this.tryBoth((p) => p.listRegions(), (v) => v.length === 0);
  }
  listPlaces(regionId: string) {
    return this.tryBoth((p) => p.listPlaces(regionId), (v) => v.length === 0);
  }
  searchPlaces(query: string, regionId?: string) {
    return this.tryBoth((p) => p.searchPlaces(query, regionId), () => false);
  }
}
