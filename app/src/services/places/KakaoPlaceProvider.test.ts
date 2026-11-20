import { describe, expect, it, vi } from 'vitest';
import { FallbackPlaceProvider, KakaoPlaceProvider, buzzKey, categoryOf, withBuzz, type KakaoDoc } from './KakaoPlaceProvider';
import { ALL_REGIONS, hashtagsOf } from '../../domain/regions';
import { MockPlaceProvider } from './MockPlaceProvider';
import { StraightLineRouteProvider } from './StraightLineRouteProvider';
import { RuleBasedRecommender } from '../recommend/RuleBasedRecommender';

const doc = (id: string, name: string, category_name: string, group: string, dx = 0): KakaoDoc => ({
  id, place_name: name, category_name, category_group_code: group,
  address_name: '서울 성동구 성수동', road_address_name: '서울 성동구 연무장길 1',
  x: String(127.056 + dx), y: '37.5445', place_url: `http://place.map.kakao.com/${id}`, phone: '', review_count: 1000,
});

/** 프록시 응답 흉내: 종류마다 2곳씩 */
const SAMPLE: Record<string, KakaoDoc[]> = {
  restaurant: [doc('r1', '성수 파스타', '음식점 > 양식 > 이탈리안', 'FD6'), doc('r2', '성수 고기', '음식점 > 한식 > 육류,고기', 'FD6', 0.002)],
  cafe: [doc('c1', '성수 로스터스', '음식점 > 카페', 'CE7', 0.001), doc('c2', '디저트 하우스', '음식점 > 카페 > 디저트카페', 'CE7', 0.003)],
  culture: [doc('g1', '성수 갤러리', '문화,예술 > 문화시설 > 미술관', 'CT1', -0.002)],
  activity: [doc('a1', '향수 공방', '가정,생활 > 공방', '', 0.004)],
  walk: [doc('w1', '서울숲', '여행 > 공원', 'AT4', -0.008)],
  shop: [doc('s1', '소품샵 모모', '가정,생활 > 생활용품 > 소품', '', 0.002)],
  bar: [doc('b1', '와인 한잔', '음식점 > 술집 > 와인바', 'FD6', -0.001), doc('b2', '칵테일 성수', '음식점 > 술집 > 칵테일바', 'FD6')],
};

function fakeProxy() {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const docs = u.pathname.endsWith('/places') ? SAMPLE[u.searchParams.get('kind')!] ?? [] : [doc('q1', `${u.searchParams.get('q')} 검색결과`, '음식점 > 카페', 'CE7')];
    return new Response(JSON.stringify({ documents: docs }));
  }) as unknown as typeof fetch;
}

describe('KakaoPlaceProvider', () => {
  it('turns Kakao results into places with kinds, links and assumed hours', async () => {
    const provider = new KakaoPlaceProvider('https://proxy.test/', undefined, fakeProxy());
    const places = await provider.listPlaces('seongsu');
    // 종류별 10곳 + 동네 명소(이름 검색) 1곳 (가짜 검색은 늘 같은 곳을 돌려줘서 하나로 합쳐진다)
    expect(places).toHaveLength(11);
    expect(places.filter((p) => p.pick)).toHaveLength(1);
    const wine = places.find((p) => p.name === '와인 한잔')!;
    expect(wine.category).toBe('bar');
    expect(wine.url).toBe('http://place.map.kakao.com/b1');
    expect(wine.openMinute).toBe(18 * 60);
    expect(places.find((p) => p.name === '향수 공방')!.category).toBe('activity');
    expect(places.find((p) => p.name === '서울숲')!.category).toBe('walk');
  });

  it('calls the proxy once per region (cached)', async () => {
    const f = fakeProxy();
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, f);
    await provider.listPlaces('seongsu');
    await provider.listPlaces('seongsu');
    const seongsu = ALL_REGIONS.find((r) => r.id === 'seongsu')!;
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(8 + seongsu.picks!.length + hashtagsOf(seongsu).length);
  });

  it('builds a full course from real-shaped data', async () => {
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, fakeProxy());
    const recommender = new RuleBasedRecommender(provider, new StraightLineRouteProvider());
    const course = await recommender.recommend({ regionId: 'seongsu', slotId: 'evening', date: 'x', startMinute: 17 * 60, endMinute: 22 * 60, pins: [], preferences: [] });
    expect(course.stops.length).toBeGreaterThanOrEqual(3);
    expect(course.stops.every((s) => s.place.id.startsWith('kakao-'))).toBe(true);
  });

  it('searches by name through the proxy', async () => {
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, fakeProxy());
    const found = await provider.searchPlaces('어니언', 'seongsu');
    expect(found[0].name).toBe('어니언 검색결과');
  });

  it('maps Kakao categories', () => {
    expect(categoryOf(doc('1', 'x', '음식점 > 술집 > 호프,요리주점', 'FD6'))).toBe('bar');
    expect(categoryOf(doc('1', 'x', '음식점 > 한식', 'FD6'))).toBe('restaurant');
    expect(categoryOf(doc('1', 'x', '문화,예술 > 영화,영화관', 'CT1'))).toBe('culture');
    expect(categoryOf(doc('1', 'x', '스포츠,레저 > 볼링장', ''))).toBe('activity');
  });
});

describe('FallbackPlaceProvider', () => {
  it('uses mock data when the proxy fails, and says why', async () => {
    const broken = new KakaoPlaceProvider('https://proxy.test', undefined, (async () => new Response('x', { status: 502 })) as unknown as typeof fetch);
    const provider = new FallbackPlaceProvider(broken, new MockPlaceProvider());
    const places = await provider.listPlaces('seongsu');
    expect(places.length).toBeGreaterThan(0);
    expect(places[0].id.startsWith('kakao-')).toBe(false);
    expect(provider.lastError).toContain('502');
  });
});

describe('popularity, relevance and photos', () => {
  const museumDocs: KakaoDoc[] = [
    { ...doc('m1', '국립중앙박물관', '문화,예술 > 문화시설 > 박물관', 'CT1'), review_count: 52000 },
    { ...doc('m2', '동네 미술관', '문화,예술 > 문화시설 > 미술관', 'CT1'), review_count: 40 },
    { ...doc('m3', '호미화방', '문화,예술 > 미술,공예 > 화방', ''), review_count: 900 },
    { ...doc('m4', 'CGV 성수', '문화,예술 > 영화,영상 > 영화관 > CGV', 'CT1'), review_count: 3000 },
  ];
  const proxy = (overrides: Record<string, KakaoDoc[] | 'fail'> = {}) =>
    vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/photo')) return new Response(JSON.stringify({ url: `https://img.test/${encodeURIComponent(u.searchParams.get('q')!)}` }));
      const kind = u.searchParams.get('kind')!;
      const o = overrides[kind];
      if (o === 'fail') return new Response('{"error":"bad request"}', { status: 400 });
      return new Response(JSON.stringify({ documents: o ?? SAMPLE[kind] ?? [] }));
    }) as unknown as typeof fetch;

  it('ranks by blog reviews and drops off-theme places', async () => {
    const docs = [...museumDocs, { ...doc('m5', '성수 미술관', '문화,예술 > 문화시설 > 미술관', 'CT1'), review_count: 800 }];
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, proxy({ culture: docs }));
    const culture = (await provider.listPlaces('seongsu')).filter((p) => p.category === 'culture');
    expect(culture.map((p) => p.name)).toEqual(['국립중앙박물관', '성수 미술관']);
    expect(culture[0].reviewCount).toBe(52000);
    expect(culture[0].rating).toBeGreaterThan(culture[1].rating);
  });

  it('drops places with few blog reviews or unknown counts, but keeps picked spots', async () => {
    const few = { ...doc('r9', '후기 적은 집', '음식점 > 양식', 'FD6'), review_count: 5 };
    const unknown = { ...doc('r8', '모르는 집', '음식점 > 양식', 'FD6'), review_count: undefined };
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, proxy({ restaurant: [few, unknown, ...SAMPLE.restaurant] }));
    const names = (await provider.listPlaces('seongsu')).map((p) => p.name);
    expect(names).not.toContain('후기 적은 집');
    expect(names).not.toContain('모르는 집');
    expect(names).toContain('성수 파스타');
  });

  it('still works when one kind fails (older proxy)', async () => {
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, proxy({ leisure: 'fail' }));
    expect((await provider.listPlaces('seongsu')).length).toBeGreaterThan(5);
  });

  it('knows Seoul hot spots and Gyeonggi regions', async () => {
    const regions = await new KakaoPlaceProvider('https://proxy.test').listRegions();
    expect(regions.length).toBeGreaterThanOrEqual(30);
    expect(regions.filter((r) => r.group === '경기').map((r) => r.name)).toContain('수원 행궁동');
  });

  it('looks up a photo by name and neighbourhood, once per place', async () => {
    const f = proxy();
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, f);
    const [place] = await provider.listPlaces('seongsu');
    const a = await provider.photoOf(place);
    const b = await provider.photoOf(place);
    expect(a).toBe(b);
    expect(decodeURIComponent(a!)).toContain(place.name);
    const photoCalls = (f as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([u]) => u.includes('/photo'));
    expect(photoCalls).toHaveLength(1);
  });

  it('fills a museum wish only with real museums', async () => {
    const provider = new KakaoPlaceProvider('https://proxy.test', undefined, proxy({ culture: museumDocs }));
    const recommender = new RuleBasedRecommender(provider, new StraightLineRouteProvider());
    const course = await recommender.recommend({
      regionId: 'seongsu', slotId: 'afternoon', date: 'x', startMinute: 13 * 60, endMinute: 18 * 60, pins: [], preferences: [],
      flow: ['culture', 'cafe'], wishes: [{ category: 'culture', match: ['미술관', '박물관'] }],
    });
    expect(course.stops[0].place.name).toBe('국립중앙박물관');
    expect(course.stops.some((s) => /화방|CGV/.test(s.place.name))).toBe(false);
  });
});

describe('categoryOf: 거리는 가게가 아니다', () => {
  it('treats a cafe street as a walk, not a cafe', () => {
    expect(categoryOf(doc('x', '성수동카페거리', '여행 > 관광,명소 > 테마거리 > 카페거리', 'AT4'))).toBe('walk');
    expect(categoryOf(doc('y', '어니언 성수', '음식점 > 카페', 'CE7'))).toBe('cafe');
  });
});

describe('hashtag hot spots (블로그 글로 대신)', () => {
  const p = (name: string) => ({ id: name, name, regionId: 'suwon', category: 'cafe' as const, location: { lat: 0, lng: 0 }, rating: 4, openMinute: 0, closeMinute: 1440, tags: ['카페'], description: '' });

  it('makes neighborhood hashtags from region names', () => {
    const byId = (id: string) => ALL_REGIONS.find((r) => r.id === id)!;
    expect(hashtagsOf(byId('hongdae'))).toEqual(['홍대', '연남']);
    expect(hashtagsOf(byId('suwon'))).toContain('행궁동');
    expect(hashtagsOf(byId('paju'))).toEqual(['헤이리']);
  });

  it('counts posts that mention a place, ignoring branch suffixes and too-common names', () => {
    expect(buzzKey(p('정지영커피로스터즈 행궁점'))).toBe('정지영커피로스터즈');
    expect(buzzKey(p('식물'))).toBeUndefined();
    const posts = ['행궁동 데이트 정지영커피로스터즈 갔다가 화성행궁 산책', '행궁동 핫플 정지영 커피로스터즈', '행궁동 맛집 식물 카페'];
    const [a, b] = withBuzz([p('정지영커피로스터즈 행궁점'), p('식물')], [{ tag: '행궁동', posts }]);
    expect(a.buzz).toBe(2);
    expect(a.buzzTag).toBe('행궁동');
    expect(b.buzz).toBeUndefined();
  });

  it('counts Blue Ribbon posts separately', () => {
    const [a] = withBuzz([p('정지영커피로스터즈 행궁점')], [{ tag: '행궁동', posts: [], ribbon: ['행궁동 블루리본 정지영커피로스터즈', '블루리본 서베이 정지영커피로스터즈'] }]);
    expect(a.ribbon).toBe(2);
    expect(a.buzz).toBeUndefined();
  });
});
