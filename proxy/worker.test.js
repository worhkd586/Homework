import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { lookupName, MAX_REVIEW_LOOKUPS } from './worker.js';

const env = { KAKAO_REST_KEY: 'test-key' };
const ctx = { waitUntil: () => {} };
const doc = (id, name, group = 'CE7') => ({
  id, place_name: name, category_name: '음식점 > 카페', category_group_code: group,
  address_name: '서울 성동구', road_address_name: '서울 성동구 연무장길 1', x: '127.056', y: '37.5445',
  place_url: `http://place.map.kakao.com/${id}`, phone: '', distance: '120', extra: 'dropped',
});
const call = (path) => worker.fetch(new Request(`https://proxy.test${path}`), env, ctx);

afterEach(() => vi.unstubAllGlobals());

describe('proxy', () => {
  it('sends the key only to Kakao and returns trimmed documents', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ documents: [doc('1', '카페 A')] })));
    vi.stubGlobal('fetch', fetchMock);
    const res = await call('/places?kind=cafe&x=127.056&y=37.5445');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents[0].place_name).toBe('카페 A');
    expect(body.documents[0].extra).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('dapi.kakao.com/v2/local/search/category.json');
    expect(url).toContain('category_group_code=CE7');
    expect(init.headers.Authorization).toBe('KakaoAK test-key');
  });

  it('merges keyword searches and removes duplicates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ documents: [doc('7', '공방'), doc('8', '방탈출')] }))));
    const body = await (await call('/places?kind=activity&x=127.0&y=37.5')).json();
    expect(body.documents.map((d) => d.id)).toEqual(['7', '8']);
  });

  it('rejects odd requests without calling Kakao', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await call('/places?kind=casino&x=127&y=37.5')).status).toBe(400);
    expect((await call('/places?kind=cafe&x=0&y=0')).status).toBe(400);
    expect((await call('/search?q=')).status).toBe(400);
    expect((await call('/anything')).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds blog review counts and keeps going when that lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/search/blog')) {
        if (url.includes(encodeURIComponent('카페 B').replace(/%20/g, '+'))) return new Response('no', { status: 500 });
        return new Response(JSON.stringify({ meta: { total_count: 321 } }));
      }
      return new Response(JSON.stringify({ documents: [doc('1', '카페 A'), doc('2', '카페 B')] }));
    }));
    const body = await (await call('/places?kind=cafe&x=127.056&y=37.5445')).json();
    expect(body.documents[0].review_count).toBe(321);
    expect(body.documents[1].review_count).toBeUndefined();
  });

  it('stays under the free plan limit of 50 outside calls', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      n++;
      if (url.includes('/search/blog')) return new Response(JSON.stringify({ meta: { total_count: 1 } }));
      return new Response(JSON.stringify({ documents: Array.from({ length: 15 }, (_, i) => doc(`${url.length}-${i}`, `곳 ${i}`)) }));
    }));
    const body = await (await call('/places?kind=activity&x=127.056&y=37.5445')).json();
    expect(body.documents.length).toBe(MAX_REVIEW_LOOKUPS);
    expect(n).toBeLessThan(50);
  });

  it('returns one https photo for a place', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ documents: [
      { thumbnail_url: 'http://insecure/1.jpg', doc_url: 'a' },
      { thumbnail_url: 'https://search1.kakaocdn.net/thumb.jpg', doc_url: 'https://blog/1' },
    ] })));
    vi.stubGlobal('fetch', fetchMock);
    const body = await (await call('/photo?q=' + encodeURIComponent('국립중앙박물관 용산동6가'))).json();
    expect(body.url).toBe('https://search1.kakaocdn.net/thumb.jpg');
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/search/image');
  });

  it('names a place with its neighbourhood for lookups', () => {
    expect(lookupName({ place_name: '우란문화재단', address_name: '서울 성동구 성수동2가 273-13' })).toBe('우란문화재단 성수동2가');
    expect(lookupName({ place_name: '화성행궁', address_name: '경기 수원시 팔달구 남창동 6-2' })).toBe('화성행궁 남창동');
  });

  it('reports a missing key and Kakao errors clearly', async () => {
    const res = await worker.fetch(new Request('https://proxy.test/search?q=카페'), {}, ctx);
    expect(res.status).toBe(500);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    const bad = await call('/search?q=카페');
    expect(bad.status).toBe(502);
    expect((await bad.json()).error).toContain('401');
  });
});
