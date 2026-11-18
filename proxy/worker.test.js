import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

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

  it('reports a missing key and Kakao errors clearly', async () => {
    const res = await worker.fetch(new Request('https://proxy.test/search?q=카페'), {}, ctx);
    expect(res.status).toBe(500);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    const bad = await call('/search?q=카페');
    expect(bad.status).toBe(502);
    expect((await bad.json()).error).toContain('401');
  });
});
