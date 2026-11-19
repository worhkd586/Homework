/**
 * 오늘어디가 장소 프록시 (Cloudflare Workers 무료 플랜).
 *
 * - 카카오 REST API 키는 앱이 아니라 여기(Worker의 비밀값 KAKAO_REST_KEY)에만 둔다.
 * - 앱은 정해진 모양의 요청만 보낼 수 있다:
 *   /places (종류별 주변 장소 + 블로그 후기 수), /search (이름 검색), /photo (장소 사진 한 장)
 * - 같은 요청은 캐시해서 카카오 무료 쿼터를 아낀다 (장소 하루, 사진 일주일).
 * - 무료 플랜은 요청 하나당 바깥 호출이 50번까지라서, 후기 수는 한 번에 최대 MAX_REVIEW_LOOKUPS곳만 센다.
 */

const LOCAL = 'https://dapi.kakao.com/v2/local/search';
const DAUM = 'https://dapi.kakao.com/v2/search';

/**
 * 앱의 장소 종류 → 카카오 검색 (카테고리 코드 또는 키워드).
 * wide: 큰 미술관·놀이공원처럼 드문 곳은 반경을 두 배로 넓혀 찾는다.
 */
export const KINDS = {
  restaurant: [{ category: 'FD6' }, { query: '맛집' }],
  cafe: [{ category: 'CE7' }, { query: '디저트카페' }],
  culture: [{ query: '미술관', wide: true }, { query: '박물관', wide: true }, { query: '전시관', wide: true }],
  activity: [{ query: '공방' }, { query: '원데이클래스' }, { query: '방탈출' }, { query: '보드게임카페' }],
  leisure: [{ query: '테마파크', wide: true }, { query: '볼링장' }, { query: '클라이밍' }, { query: 'VR체험' }],
  walk: [{ category: 'AT4' }, { query: '공원' }, { query: '야경' }],
  shop: [{ query: '소품샵' }, { query: '편집샵' }, { query: '팝업스토어' }],
  bar: [{ query: '와인바' }, { query: '칵테일바' }, { query: '이자카야' }],
};

const FIELDS = ['id', 'place_name', 'category_name', 'category_group_code', 'address_name', 'road_address_name', 'x', 'y', 'place_url', 'phone'];
const DAY = 60 * 60 * 24;
export const MAX_REVIEW_LOOKUPS = 40;

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

/** 비교용: 공백·기호·괄호를 빼고 소문자로 */
export function squash(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, '')
    .replace(/[\s·.,!?'"()\[\]{}\-_/|~]/g, '')
    .toLowerCase();
}

/** 장소 이름에서 지점명을 뗀 핵심 이름 ("아키야마 성수본점" → "아키야마") */
export function coreName(name) {
  const words = String(name).trim().split(/\s+/);
  const core = words.filter((w, i) => i === 0 || !/(본점|점|지점|호점|센터|매장)$/.test(w)).join(' ');
  return core || name;
}

/** 제목에 장소 이름이 들어간 블로그/카페 글의 대표 사진 */
export async function findPhoto(env, query, name) {
  const want = squash(coreName(name));
  if (want.length < 2) return null;
  for (const kind of ['blog', 'cafe']) {
    const data = await kakaoGet(env, `${DAUM}/${kind}?${new URLSearchParams({ query, size: '10', sort: 'accuracy' })}`);
    const hit = (data.documents ?? []).find((d) => /^https:\/\//.test(d.thumbnail ?? '') && squash(d.title).includes(want));
    if (hit) return hit;
  }
  return null;
}

async function kakaoGet(env, url) {
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` } });
  if (!res.ok) {
    // 카카오가 알려주는 거절 이유(예: 카카오맵 서비스 꺼짐)를 그대로 전달. 키는 포함되지 않음.
    let why = '';
    try { why = ((await res.json()).message ?? '').slice(0, 200); } catch {}
    throw new Error(`kakao ${res.status}${why ? `: ${why}` : ''}`);
  }
  return res.json();
}

async function local(env, kind, params) {
  const data = await kakaoGet(env, `${LOCAL}/${kind}.json?${new URLSearchParams(params)}`);
  return (data.documents ?? []).map((d) => Object.fromEntries(FIELDS.map((f) => [f, d[f] ?? ''])));
}

/** 블로그·사진 검색에 쓸 이름: 가게 이름 + 동 이름 (같은 이름의 다른 지점과 헷갈리지 않게) */
export function lookupName(doc) {
  const parts = (doc.address_name || '').split(' ');
  const dong = parts.find((p, i) => i >= 2 && /[동읍면가로]$|\d가$/.test(p)) ?? parts[1] ?? '';
  return `${doc.place_name} ${dong}`.trim();
}

/** 다음 블로그 검색 결과 수 = 후기 수 (실패하면 모름) */
async function reviewCount(env, doc) {
  try {
    const data = await kakaoGet(env, `${DAUM}/blog?${new URLSearchParams({ query: lookupName(doc), size: '1' })}`);
    return data.meta?.total_count ?? null;
  } catch {
    return null;
  }
}

/** 검색어마다 고르게 앞에서부터 섞는다 (후기 수를 셀 곳을 한쪽에 몰지 않으려고) */
function interleave(lists) {
  const out = [];
  const seen = new Set();
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const d = l[i];
      if (d && !seen.has(d.id)) {
        seen.add(d.id);
        out.push(d);
      }
    }
  }
  return out;
}

async function handle(url, env) {
  if (url.pathname === '/places') {
    const c = coord(url);
    const kind = url.searchParams.get('kind');
    if (!c || !KINDS[kind]) return json({ error: 'bad request' }, 400);
    const radius = Math.min(5000, Math.max(200, Number(url.searchParams.get('radius')) || 1500));
    const lists = await Promise.all(
      KINDS[kind].map((q) => {
        const r = String(Math.min(q.wide ? 10000 : 5000, q.wide ? radius * 2 : radius));
        return q.category
          ? local(env, 'category', { category_group_code: q.category, x: c.x, y: c.y, radius: r, sort: 'accuracy', size: '15' })
          : local(env, 'keyword', { query: q.query, x: c.x, y: c.y, radius: r, sort: 'accuracy', size: '15' });
      }),
    );
    const documents = interleave(lists).slice(0, MAX_REVIEW_LOOKUPS);
    const counts = await Promise.all(documents.map((d) => reviewCount(env, d)));
    documents.forEach((d, i) => {
      if (counts[i] !== null) d.review_count = counts[i];
    });
    return json({ kind, documents }, 200, { 'Cache-Control': `public, max-age=${DAY}` });
  }
  if (url.pathname === '/search') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q || q.length > 40) return json({ error: 'bad request' }, 400);
    const params = { query: q, size: '15' };
    const c = coord(url);
    if (c) Object.assign(params, { x: c.x, y: c.y, sort: 'accuracy' });
    const documents = await local(env, 'keyword', params);
    return json({ documents }, 200, { 'Cache-Control': `public, max-age=${DAY}` });
  }
  if (url.pathname === '/photo') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q || q.length > 60) return json({ error: 'bad request' }, 400);
    // 이미지 검색은 제목이 없어서 엉뚱한 사진이 자주 붙는다. 블로그·카페 글 중 제목에 장소 이름이 들어간
    // 글의 대표 사진만 쓰고, 그런 글이 없으면 사진을 주지 않는다 (앱은 종류별 기본 그림을 보여 준다)
    const name = (url.searchParams.get('name') ?? q.split(' ').slice(0, -1).join(' ') ?? q).trim() || q;
    const doc = await findPhoto(env, q, name);
    return json({ url: doc?.thumbnail ?? null, source: doc?.url ?? null }, 200, { 'Cache-Control': `public, max-age=${DAY * 7}` });
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
