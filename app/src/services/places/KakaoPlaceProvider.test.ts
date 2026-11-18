import { describe, expect, it, vi } from 'vitest';
import { FallbackPlaceProvider, KakaoPlaceProvider, categoryOf, type KakaoDoc } from './KakaoPlaceProvider';
import { MockPlaceProvider } from './MockPlaceProvider';
import { StraightLineRouteProvider } from './StraightLineRouteProvider';
import { RuleBasedRecommender } from '../recommend/RuleBasedRecommender';

const doc = (id: string, name: string, category_name: string, group: string, dx = 0): KakaoDoc => ({
  id, place_name: name, category_name, category_group_code: group,
  address_name: '서울 성동구 성수동', road_address_name: '서울 성동구 연무장길 1',
  x: String(127.056 + dx), y: '37.5445', place_url: `http://place.map.kakao.com/${id}`, phone: '',
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
    expect(places).toHaveLength(10);
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
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(7);
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
