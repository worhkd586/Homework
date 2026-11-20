import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { coreName, lookupName, MAX_REVIEW_LOOKUPS, ogImage, postPageUrl, safeImageUrl, samePost, squash, upsize } from './worker.js';

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

  it('uses a photo only from a post whose title names the place', async () => {
    const fetchMock = vi.fn(async (u) => new Response(JSON.stringify({ documents: String(u).includes('/blog') ? [
      { title: '성수 카페 추천 <b>BEST</b> 5', thumbnail: 'https://search1.kakaocdn.net/wrong.jpg', url: 'https://blog/0' },
      { title: '<b>아키야마</b> 성수 이자카야 후기', thumbnail: 'https://search1.kakaocdn.net/right.jpg', url: 'https://blog/1' },
    ] : [] })));
    vi.stubGlobal('fetch', fetchMock);
    const body = await (await call('/photo?q=' + encodeURIComponent('아키야마 성수본점 성수동2가') + '&name=' + encodeURIComponent('아키야마 성수본점'))).json();
    expect(body.url).toBe('https://search1.kakaocdn.net/right.jpg');
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/search/blog');
  });

  it('adds a large original from the same post through /img', async () => {
    vi.stubGlobal('fetch', vi.fn(async (u) => new Response(JSON.stringify({ documents: String(u).includes('/blog') ? [
      { title: '<b>아키야마</b> 후기', thumbnail: 'https://search1.kakaocdn.net/t.jpg', url: 'https://blog.naver.com/a/1' },
    ] : [
      { doc_url: 'https://blog.naver.com/b/9', image_url: 'https://other.example.com/x.jpg', width: 1200 },
      { doc_url: 'http://m.blog.naver.com/a/1', image_url: 'https://blogfiles.example.com/small.jpg', width: 200 },
      { doc_url: 'https://blog.naver.com/a/1/', image_url: 'https://blogfiles.example.com/big.jpg', width: 900 },
    ] }))));
    const body = await (await call('/photo?q=' + encodeURIComponent('아키야마 성수본점 성수동2가') + '&name=' + encodeURIComponent('아키야마 성수본점'))).json();
    expect(body.url).toBe('https://search1.kakaocdn.net/t.jpg');
    expect(body.large).toBe('https://proxy.test/img?u=' + encodeURIComponent('https://blogfiles.example.com/big.jpg'));
  });

  it('relays only public image URLs as images', async () => {
    expect(samePost('http://m.blog.naver.com/a/1', 'https://blog.naver.com/a/1/')).toBe(true);
    expect(safeImageUrl('https://postfiles.pstatic.net/a.jpg')).toBe('https://postfiles.pstatic.net/a.jpg');
    for (const bad of ['ftp://x.com/a', 'http://127.0.0.1/a', 'http://localhost/a', 'http://intranet/a', 'https://a.internal/x', 'https://u:p@x.com/a', 'https://x.com:8443/a', null]) {
      expect(safeImageUrl(bad)).toBeNull();
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('img', { headers: { 'Content-Type': 'image/jpeg' } })));
    const ok = await call('/img?u=' + encodeURIComponent('https://blog.example.com/big.jpg'));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('image/jpeg');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } })));
    expect((await call('/img?u=' + encodeURIComponent('https://blog.example.com/page'))).status).toBe(404);
    expect((await call('/img?u=' + encodeURIComponent('http://10.0.0.1/x'))).status).toBe(400);
  });

  it('gives no photo when no post title matches the place', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ documents: [
      { title: '서울 데이트 코스 총정리', thumbnail: 'https://search1.kakaocdn.net/wrong.jpg', url: 'https://blog/0' },
    ] }))));
    const body = await (await call('/photo?q=' + encodeURIComponent('37.5시그니처 성수점 성수동2가') + '&name=' + encodeURIComponent('37.5시그니처 성수점'))).json();
    expect(body.url).toBeNull();
  });

  it('compares names without spaces, tags or branch suffixes', () => {
    expect(squash('<b>소문난 성수</b> 감자탕')).toBe('소문난성수감자탕');
    expect(coreName('아키야마 성수본점')).toBe('아키야마');
    expect(coreName('37.5시그니처 성수점')).toBe('37.5시그니처');
    expect(coreName('국립중앙박물관')).toBe('국립중앙박물관');
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

describe('og:image fallback', () => {
  it('네이버 블로그 글은 모바일 페이지에서 찾는다', () => {
    expect(postPageUrl('https://blog.naver.com/abc_1/224397706672')).toBe('https://m.blog.naver.com/abc_1/224397706672');
    expect(postPageUrl('https://foo.tistory.com/12')).toBe('https://foo.tistory.com/12');
    expect(postPageUrl('http://127.0.0.1/x')).toBeNull();
  });
  it('og:image를 꺼내고 &amp;를 푼다', () => {
    const html = '<head><meta property="og:title" content="t"><meta property="og:image" content="https://mblogthumb-phinf.pstatic.net/a/IMG.jpg?type=w2&amp;x=1"/></head>';
    expect(ogImage(html)).toBe('https://mblogthumb-phinf.pstatic.net/a/IMG.jpg?type=w2&x=1');
    expect(ogImage('<meta property="og:image" content="http://localhost/a.jpg">')).toBeNull();
    expect(ogImage('<p>no meta</p>')).toBeNull();
  });
  it('네이버 블로그 사진은 postfiles 서버에서 가로 966으로 받는다', () => {
    expect(upsize('https://blogthumb.pstatic.net/a/IMG.jpg?type=w2')).toBe('https://postfiles.pstatic.net/a/IMG.jpg?type=w966');
    expect(upsize('https://mblogthumb-phinf.pstatic.net/a/IMG.jpg?type=w800')).toBe('https://postfiles.pstatic.net/a/IMG.jpg?type=w966');
    expect(upsize('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });
});

describe('recent popularity', () => {
  it('counts blog posts from the last 90 days along with the total', async () => {
    const now = Date.now();
    const day = 86400000;
    const posts = [5, 30, 80, 120, 400].map((d) => ({ datetime: new Date(now - d * day).toISOString() }));
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/search/blog')) {
        expect(url).toContain('sort=recency');
        return new Response(JSON.stringify({ meta: { total_count: 2500 }, documents: posts }));
      }
      return new Response(JSON.stringify({ documents: [doc('1', '카페 A')] }));
    }));
    const body = await (await call('/places?kind=cafe&x=127.056&y=37.5445')).json();
    expect(body.documents[0].review_count).toBe(2500);
    expect(body.documents[0].recent_count).toBe(3);
  });

  it('/pick returns the matching place with counts, or nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/search/blog')) return new Response(JSON.stringify({ meta: { total_count: 9000 }, documents: [] }));
      return new Response(JSON.stringify({ documents: [doc('9', '다른 가게'), doc('1', '어니언 성수')] }));
    }));
    const body = await (await call('/pick?q=어니언 성수&x=127.056&y=37.5445')).json();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe('1');
    expect(body.documents[0].review_count).toBe(9000);
    const none = await (await call('/pick?q=없는곳&x=127.056&y=37.5445')).json();
    expect(none.documents).toHaveLength(0);
  });
});

describe('/buzz', () => {
  it('collects blog posts about a neighborhood like a hashtag search, without duplicates', async () => {
    const fetchMock = vi.fn(async (url) => {
      const q = new URL(url).searchParams.get('query');
      return new Response(JSON.stringify({ documents: [
        { url: 'https://b/1', title: '<b>행궁동</b> 데이트 코스', contents: '정지영커피로스터즈 들렀다가', datetime: '2026-11-01T10:00:00.000+09:00' },
        { url: `https://b/${q}`, title: q, contents: '', datetime: '2026-10-01T10:00:00.000+09:00' },
      ] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const body = await (await call('/buzz?q=행궁동')).json();
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(body.posts[0].t).toContain('행궁동 데이트 코스 정지영커피로스터즈');
    expect(body.posts.filter((p) => p.t.includes('데이트 코스') && p.w === '데이트')).toHaveLength(1);
    expect(body.posts.filter((p) => p.w === '블루리본').length).toBeGreaterThan(0);
    expect((await call('/buzz?q=')).status).toBe(400);
  });
});
