/**
 * 오늘어디가 장소 프록시 (Cloudflare Workers 무료 플랜).
 *
 * - 카카오 REST API 키는 앱이 아니라 여기(Worker의 비밀값 KAKAO_REST_KEY)에만 둔다.
 * - 앱은 정해진 모양의 요청만 보낼 수 있다: /places (종류별 주변 장소), /search (이름 검색).
 * - 같은 요청은 하루 동안 캐시해서 카카오 무료 쿼터를 아낀다.
 */

const KAKAO = 'https://dapi.kakao.com/v2/local/search';

/** 앱의 장소 종류 → 카카오 검색 (카테고리 코드 또는 키워드) */
export const KINDS = {
  restaurant: [{ category: 'FD6' }],
  cafe: [{ category: 'CE7' }],
  culture: [{ category: 'CT1' }, { query: '전시' }],
  activity: [{ query: '공방' }, { query: '방탈출' }, { query: '보드게임카페' }],
  walk: [{ category: 'AT4' }, { query: '공원' }],
  shop: [{ query: '소품샵' }],
  bar: [{ query: '와인바' }, { query: '칵테일바' }],
};

const FIELDS = ['id', 'place_name', 'category_name', 'category_group_code', 'address_name', 'road_address_name', 'x', 'y', 'place_url', 'phone'];
const DAY = 60 * 60 * 24;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...extra,
    },
  });
}

/** 한국 안의 좌표만 받는다 */
function coord(url) {
  const x = Number(url.searchParams.get('x'));
  const y = Number(url.searchParams.get('y'));
  if (!(x >= 124 && x <= 132 && y >= 33 && y <= 39)) return null;
  return { x: x.toFixed(5), y: y.toFixed(5) };
}

async function kakao(env, kind, params) {
  const res = await fetch(`${KAKAO}/${kind}.json?${new URLSearchParams(params)}`, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
  });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const data = await res.json();
  return (data.documents ?? []).map((d) => Object.fromEntries(FIELDS.map((f) => [f, d[f] ?? ''])));
}

async function handle(url, env) {
  if (url.pathname === '/places') {
    const c = coord(url);
    const kind = url.searchParams.get('kind');
    if (!c || !KINDS[kind]) return json({ error: 'bad request' }, 400);
    const radius = String(Math.min(5000, Math.max(200, Number(url.searchParams.get('radius')) || 1500)));
    const lists = await Promise.all(
      KINDS[kind].map((q) =>
        q.category
          ? kakao(env, 'category', { category_group_code: q.category, x: c.x, y: c.y, radius, sort: 'accuracy', size: '15' })
          : kakao(env, 'keyword', { query: q.query, x: c.x, y: c.y, radius, sort: 'accuracy', size: '15' }),
      ),
    );
    const seen = new Set();
    const documents = lists.flat().filter((d) => !seen.has(d.id) && seen.add(d.id));
    return json({ kind, documents }, 200, { 'Cache-Control': `public, max-age=${DAY}` });
  }
  if (url.pathname === '/search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q || q.length > 40) return json({ error: 'bad request' }, 400);
    const params = { query: q, size: '15' };
    const c = coord(url);
    if (c) Object.assign(params, { x: c.x, y: c.y, sort: 'accuracy' });
    const documents = await kakao(env, 'keyword', params);
    return json({ documents }, 200, { 'Cache-Control': `public, max-age=${DAY}` });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return json(null, 204);
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    if (!env.KAKAO_REST_KEY) return json({ error: 'KAKAO_REST_KEY is not set' }, 500);
    const url = new URL(request.url);
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(url.toString());
    const hit = cache && (await cache.match(key));
    if (hit) return hit;
    try {
      const res = await handle(url, env);
      if (cache && res.status === 200) ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return json({ error: String(e.message ?? e) }, 502);
    }
  },
};
