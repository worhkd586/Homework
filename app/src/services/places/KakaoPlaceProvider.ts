import type { Place, PlaceCategory, Region } from '../../domain/types';
import { ALL_REGIONS } from '../../domain/regions';
import type { PlaceProvider } from './PlaceProvider';
import { defaultStayMinutes } from './mockData';
import { samePlaceFamily } from '../recommend/dateFit';

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
  /** 다음 블로그 검색 결과 수 (프록시가 셀 수 있었을 때만) */
  review_count?: number;
}

/** 프록시 응답 모양이 바뀔 때마다 올린다 (캐시 무효화) */
const PROXY_VERSION = '2';

/** 프록시의 검색 묶음 → 앱의 장소 종류 */
const KINDS: Array<{ kind: string; category: PlaceCategory }> = [
  { kind: 'restaurant', category: 'restaurant' },
  { kind: 'cafe', category: 'cafe' },
  { kind: 'culture', category: 'culture' },
  { kind: 'activity', category: 'activity' },
  { kind: 'leisure', category: 'activity' },
  { kind: 'walk', category: 'walk' },
  { kind: 'shop', category: 'shop' },
  { kind: 'bar', category: 'bar' },
];

/**
 * 카카오는 평점·영업시간을 주지 않는다. 그래서
 * - 평점 대신 블로그 후기 수로 인기 점수를 매기고 (후기 수를 모르면 카카오 검색 순위로)
 * - 영업시간은 종류별로 흔한 시간으로 가정한다 (실제와 다를 수 있음 → 화면에 안내)
 */
const ASSUMED_HOURS: Record<PlaceCategory, [number, number]> = {
  restaurant: [11 * 60, 22 * 60],
  cafe: [10 * 60, 22 * 60],
  culture: [10 * 60, 18 * 60],
  activity: [11 * 60, 22 * 60],
  walk: [0, 24 * 60],
  shop: [11 * 60, 21 * 60],
  bar: [18 * 60, 26 * 60],
};

/** 주제와 상관없는데 검색에 섞여 들어오는 곳 (종류별). 이름이나 카카오 분류에 이 말이 있으면 뺀다. */
const EXCLUDE: Partial<Record<PlaceCategory, RegExp>> = {
  culture: /화방|화랑|공예|학원|영화관|CGV|롯데시네마|메가박스|교육|사무소|협회/,
  cafe: /만화카페|스터디카페|키즈카페|PC방|보드카페|룸카페|무인/,
  activity: /학원|재료|도매|자동차|정비|부동산|교습|화랑|화방|즉석사진|사진관/,
  walk: /명예도로|상점가|푸드트럭|먹자골목|주차장/,
  shop: /인테리어|가구|철물|도매|부동산|공구|자재|생활용품|마트|슈퍼|다이소|약국/,
};

/** 어느 종류든 데이트 코스로는 안 맞는 곳 (주차장, 아이용 시설 등) */
const EXCLUDE_ALL = /주차장|화장실|매표소|어린이|키즈|유아|근린공원|소공원|놀이터|수영장|눈썰매|물놀이|체육센터|체육관|문화센터|주민센터|복지관|청년|상담|마음센터|센터 \d|놀숲|벌툰|캣툰|만화/;

/** 후기가 이보다 적으면 (같은 종류에 다른 후보가 충분할 때) 뺀다 */
const MIN_REVIEWS = 10;

/** 카카오 분류 → 앱의 장소 종류 */
export function categoryOf(doc: KakaoDoc, hint?: PlaceCategory): PlaceCategory {
  const name = doc.category_name;
  // '○○카페거리'·'○○길'은 가게가 아니라 걸어 다니는 거리다
  if (/(거리|골목|단길)$/.test(doc.place_name.trim()) && !['FD6', 'CE7'].includes(doc.category_group_code)) return 'walk';
  if (/술집|와인|칵테일|바$|호프|이자카야|포장마차/.test(name)) return 'bar';
  // '방탈출카페'·'보드카페'는 카카오에서 카페로도 분류되지만 앱에서는 놀거리다
  if (/방탈출|보드카페|보드게임|VR/.test(`${name} ${doc.place_name}`)) return 'activity';
  if (doc.category_group_code === 'CE7' || /카페|디저트|제과|베이커리|간식|아이스크림|도넛|젤라또|빙수/.test(name)) return 'cafe';
  if (doc.category_group_code === 'FD6') return 'restaurant';
  if (/미술관|박물관|전시|공연|영화|기념관/.test(name)) return 'culture';
  if (/테마파크|놀이|아쿠아리움|동물원|공방|방탈출|보드게임|볼링|오락|체험|스포츠|레저|클라이밍/.test(name)) return 'activity';
  if (doc.category_group_code === 'CT1') return 'culture';
  if (doc.category_group_code === 'AT4' || /공원|산책|관광|명소/.test(name)) return 'walk';
  if (/소품|잡화|쇼핑|패션|팝업|백화점/.test(name)) return 'shop';
  return hint ?? 'activity';
}

/** 블로그 후기 수 → 0~5 점수 (10곳 3.9 · 100곳 4.25 · 1천 4.6 · 1만 5.0) */
export function popularityScore(reviews: number): number {
  return Math.min(5, 3.5 + Math.log10(reviews + 1) * 0.375);
}

export function toPlace(doc: KakaoDoc, regionId: string, rank: number, hint?: PlaceCategory): Place {
  const category = categoryOf(doc, hint);
  const parts = doc.category_name.split('>').map((s) => s.trim()).filter(Boolean);
  const [open, close] = ASSUMED_HOURS[category];
  const reviews = typeof doc.review_count === 'number' ? doc.review_count : undefined;
  return {
    id: `kakao-${doc.id}`,
    name: doc.place_name,
    regionId,
    category,
    location: { lat: Number(doc.y), lng: Number(doc.x) },
    rating: reviews !== undefined ? popularityScore(reviews) : Math.max(3.8, 4.6 - rank * 0.05),
    reviewCount: reviews,
    openMinute: open,
    closeMinute: close,
    stayMinutes: defaultStayMinutes(category),
    tags: parts.slice(1),
    description: [parts[parts.length - 1], doc.road_address_name || doc.address_name].filter(Boolean).join(' · '),
    url: doc.place_url || undefined,
  };
}

/** 주제와 상관없는 곳을 빼고, 후기가 너무 적은 곳은 (대신할 곳이 있으면) 뺀다 */
export function curate(places: Place[]): Place[] {
  const relevant = places.filter((p) => {
    const text = `${p.name} ${p.tags.join(' ')}`;
    if (EXCLUDE_ALL.test(p.name)) return false;
    if (p.category === 'shop' && /소품|잡화|선물|편집|팝업|문구/.test(text)) return true; // 생활용품점으로 분류된 소품샵은 살린다
    return !EXCLUDE[p.category]?.test(text);
  });
  const out: Place[] = [];
  for (const category of new Set(relevant.map((p) => p.category))) {
    const group = relevant.filter((p) => p.category === category);
    const popular = group.filter((p) => p.reviewCount === undefined || p.reviewCount >= MIN_REVIEWS);
    out.push(...(popular.length >= 5 ? popular : group));
  }
  return out.sort((a, b) => b.rating - a.rating);
}

/** 블로그·사진 검색에 쓸 이름: 가게 이름 + 동 이름 (같은 이름의 다른 지점과 헷갈리지 않게) */
export function lookupName(place: Place): string {
  const address = place.description.split(' · ').pop() ?? '';
  const parts = address.split(' ');
  const area = parts.find((p, i) => i >= 1 && /[동읍면가]$|구$/.test(p)) ?? '';
  return `${place.name} ${area}`.trim();
}

/** 프록시를 거쳐 카카오 로컬 API로 실제 장소를 가져온다. 지역별로 한 번 가져와서 기억해 둔다. */
export class KakaoPlaceProvider implements PlaceProvider {
  readonly name = 'kakao';
  private readonly cache = new Map<string, Promise<Place[]>>();
  /** 직접 입력한 주제로 검색해서 찾은 곳 (그 지역 후보에 더한다) */
  private readonly extras = new Map<string, Place[]>();
  private readonly photos = new Map<string, Promise<PhotoResult | undefined>>();

  constructor(
    private readonly proxyUrl: string,
    private readonly regions: Region[] = ALL_REGIONS,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async getJson<T>(path: string, params: Record<string, string>): Promise<T> {
    // v: 프록시가 바뀌면 올린다. 예전 프록시의 캐시(하루)를 안 쓰게 하려고.
    const url = `${this.proxyUrl.replace(/\/$/, '')}${path}?${new URLSearchParams({ ...params, v: PROXY_VERSION })}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`장소 서버 오류 (${res.status})`);
    return (await res.json()) as T;
  }

  private async get(path: string, params: Record<string, string>): Promise<KakaoDoc[]> {
    return (await this.getJson<{ documents?: KakaoDoc[] }>(path, params)).documents ?? [];
  }

  async listRegions(): Promise<Region[]> {
    return this.regions;
  }

  async listPlaces(regionId: string): Promise<Place[]> {
    let task = this.cache.get(regionId);
    if (!task) {
      task = this.load(regionId);
      this.cache.set(regionId, task);
      task.catch(() => this.cache.delete(regionId)); // 실패하면 다음에 다시 시도
    }
    const base = await task;
    const extra = this.extras.get(regionId) ?? [];
    if (!extra.length) return base;
    const seen = new Set(base.map((p) => p.id));
    return [...base, ...extra.filter((p) => !seen.has(p.id))];
  }

  private async load(regionId: string): Promise<Place[]> {
    const region = this.regions.find((r) => r.id === regionId);
    if (!region) throw new Error(`unknown region: ${regionId}`);
    // 한 종류가 실패해도(예: 예전 프록시가 모르는 종류) 나머지로 코스를 짠다
    const lists = await Promise.allSettled(
      KINDS.map(async ({ kind, category }) => {
        const docs = await this.get('/places', {
          kind,
          x: String(region.center.lng),
          y: String(region.center.lat),
          radius: String(region.radius ?? 1500),
        });
        return docs.map((d, i) => toPlace(d, regionId, i, category));
      }),
    );
    const ok = lists.filter((l): l is PromiseFulfilledResult<Place[]> => l.status === 'fulfilled');
    if (!ok.length) throw (lists[0] as PromiseRejectedResult).reason;
    const seen = new Set<string>();
    const base = curate(ok.flatMap((l) => l.value).filter((p) => !seen.has(p.id) && seen.add(p.id)));
    return withPicks(base, await this.findPicks(region));
  }

  /** 동네별 데이트 명소를 이름으로 찾는다 (못 찾거나 실패하면 빼고) */
  private async findPicks(region: Region): Promise<Place[]> {
    const max = (region.radius ?? 1500) * 2.5;
    const found = await Promise.allSettled(
      (region.picks ?? []).map(async (name) => {
        const docs = await this.get('/search', { q: name, x: String(region.center.lng), y: String(region.center.lat) });
        const want = squash(name);
        const doc = docs.find((d) => {
          const got = squash(d.place_name);
          return (got.includes(want) || want.includes(got)) && meters({ lat: Number(d.y), lng: Number(d.x) }, region.center) <= max;
        });
        return doc ? { ...toPlace(doc, region.id, 0), pick: true } : undefined;
      }),
    );
    return found.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  }

  async searchPlaces(query: string, regionId?: string): Promise<Place[]> {
    const region = this.regions.find((r) => r.id === regionId);
    if (!query.trim()) return region ? this.listPlaces(region.id) : [];
    const params: Record<string, string> = { q: query.trim() };
    if (region) Object.assign(params, { x: String(region.center.lng), y: String(region.center.lat) });
    const docs = await this.get('/search', params);
    return docs.map((d, i) => toPlace(d, region?.id ?? 'search', i));
  }

  /** 하고 싶은 것(직접 입력)으로 검색한 곳 중 지역 안에 있는 곳을 그 지역 후보에 더한다 */
  async addWishPlaces(query: string, regionId: string): Promise<Place[]> {
    const region = this.regions.find((r) => r.id === regionId);
    if (!region) return [];
    const max = (region.radius ?? 1500) * 2;
    const found = (await this.searchPlaces(query, regionId)).filter((p) => meters(p.location, region.center) <= max);
    this.extras.set(regionId, [...(this.extras.get(regionId) ?? []), ...found]);
    return found;
  }

  /** 장소 사진 한 장 (블로그 썸네일, 작은 목록용). 없거나 실패하면 undefined */
  async photoOf(place: Place): Promise<string | undefined> {
    return (await this.photoResult(place))?.url;
  }

  /** 큰 카드용: 같은 글의 원본 사진(고화질) → 썸네일 순서 */
  async photosOf(place: Place): Promise<string[]> {
    return sources(await this.photoResult(place));
  }

  async photoFor(query: string, name?: string): Promise<string | undefined> {
    return (await this.queryResult(query, name))?.url;
  }

  async photosFor(query: string, name?: string): Promise<string[]> {
    return sources(await this.queryResult(query, name));
  }

  private photoResult(place: Place): Promise<PhotoResult | undefined> {
    if (!place.id.startsWith('kakao-')) return Promise.resolve(undefined);
    return this.cachedPhoto(place.id, { q: lookupName(place), name: place.name });
  }

  private queryResult(query: string, name?: string): Promise<PhotoResult | undefined> {
    return this.cachedPhoto(`q:${query}`, name ? { q: query, name } : { q: query });
  }

  private cachedPhoto(key: string, params: Record<string, string>): Promise<PhotoResult | undefined> {
    let task = this.photos.get(key);
    if (!task) {
      task = this.getJson<{ url?: string | null; large?: string | null }>('/photo', { ...params, v: PHOTO_VERSION })
        .then((r) => (r.url ? { url: r.url, large: r.large ?? undefined } : undefined))
        .catch(() => undefined);
      this.photos.set(key, task);
    }
    return task;
  }
}

/** Worker의 사진 찾는 방식이 바뀌면 올린다 (중간 캐시에 남은 예전 답을 쓰지 않게) */
const PHOTO_VERSION = '3';

interface PhotoResult {
  url: string;
  large?: string;
}

function sources(r: PhotoResult | undefined): string[] {
  if (!r) return [];
  return r.large ? [r.large, r.url] : [r.url];
}

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 명소를 후보에 더한다. 이미 있는 곳이면 그 자리에 표시만 (후기 수는 그대로 쓴다) */
export function withPicks(base: Place[], picks: Place[]): Place[] {
  const byId = new Map(picks.map((p) => [p.id, p]));
  const out = base.map((p) => (byId.has(p.id) ? { ...p, pick: true } : p));
  const have = new Set(base.map((p) => p.id));
  return oneOfEachFamily([...out, ...picks.filter((p) => !have.has(p.id) && have.add(p.id))]);
}

/**
 * 같은 곳의 일부·지점은 하나만 남긴다 (예: '롯데월드 어드벤처'와 그 안의 '롯데월드 월드모노레일',
 * '지구별방탈출 ○○점'들). 명소로 고른 곳 → 후기 많은 곳 순으로 남긴다. 종류가 다르면 따로 본다.
 */
export function oneOfEachFamily(places: Place[]): Place[] {
  const rank = (p: Place) => (p.pick ? 1e9 : 0) + (p.reviewCount ?? 0);
  const kept: Place[] = [];
  for (const p of [...places].sort((a, b) => rank(b) - rank(a))) {
    if (!kept.some((k) => k.category === p.category && samePlaceFamily(k, p))) kept.push(p);
  }
  const keep = new Set(kept.map((p) => p.id));
  return places.filter((p) => keep.has(p.id));
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * 111_000;
  const dx = (a.lng - b.lng) * 88_000;
  return Math.sqrt(dx * dx + dy * dy);
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
  async addWishPlaces(query: string, regionId: string): Promise<Place[]> {
    try {
      return (await this.primary.addWishPlaces?.(query, regionId)) ?? [];
    } catch {
      return [];
    }
  }
  photoOf(place: Place): Promise<string | undefined> {
    return this.primary.photoOf?.(place) ?? Promise.resolve(undefined);
  }
  photoFor(query: string, name?: string): Promise<string | undefined> {
    return this.primary.photoFor?.(query, name) ?? Promise.resolve(undefined);
  }
  photosOf(place: Place): Promise<string[]> {
    return this.primary.photosOf?.(place) ?? Promise.resolve([]);
  }
  photosFor(query: string, name?: string): Promise<string[]> {
    return this.primary.photosFor?.(query, name) ?? Promise.resolve([]);
  }
}
