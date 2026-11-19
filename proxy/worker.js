/**
 * 오늘어디가 장소 프록시 (Cloudflare Workers 무료 플랜).
 *
 * - 카카오 REST API 키는 앱이 아니라 여기(Worker의 비밀값 KAKAO_REST_KEY)에만 둔다.
 * - 앱은 정해진 모양의 요청만 보낼 수 있다:
 *   /places (종류별 주변 장소 + 블로그 후기 수 · 최근 3개월 글 수), /search (이름 검색), /pick (명소 하나 + 후기 수),
 *   /photo (장소 사진 한 장),
 *   /img (/photo가 고른 원본 사진을 대신 받아 줌)
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

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** /img가 받아 줄 주소: http(s)이고, 내부망·IP 주소가 아닌 공개 도메인만 */
export function safeImageUrl(raw) {
  if (!raw || raw.length > 1000) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname;
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)localhost$|\.local$|\.internal$/.test(host)) return null;
  return u.toString();
}

/** 블로그 주소 비교용 (m.blog / blog, http / https, 끝의 / 차이 무시) */
export function samePost(a, b) {
  const norm = (x) => String(x ?? '').replace(/^https?:\/\//, '').replace(/^m\./, '').replace(/\/$/, '');
  return !!a && !!b && norm(a) === norm(b);
}

/** 그 글에서 나온 가로 400px 이상 원본 사진 */
export async function findOriginal(env, query, postUrl) {
  const data = await kakaoGet(env, `${DAUM}/image?${new URLSearchParams({ query, size: '30', sort: 'accuracy' })}`);
  const docs = (data.documents ?? []).filter((d) => samePost(d.doc_url, postUrl) && /^https?:\/\//.test(d.image_url ?? ''));
  const best = docs.find((d) => (d.width ?? 0) >= 400) ?? null;
  return best?.image_url ?? null;
}

/** 글 페이지 주소 (네이버 블로그는 사진 정보가 있는 모바일 페이지로) */
export function postPageUrl(postUrl) {
  const safe = safeImageUrl(postUrl);
  if (!safe) return null;
  const m = safe.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([\w-]+)\/(\d+)/);
  return m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : safe;
}

/** HTML에서 og:image 주소를 꺼낸다 (링크 미리보기용으로 글쓴이가 공개한 대표 사진) */
export function ogImage(html) {
  const tag = String(html ?? '').match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0];
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
  if (!content) return null;
  return safeImageUrl(content.replace(/&amp;/g, '&'));
}

/**
 * 네이버 블로그 사진은 og:image(blogthumb 등)로는 작게 오거나 크기 지정이 안 먹는다.
 * 같은 경로를 postfiles 서버에서 가로 966으로 받으면 원본에 가까운 크기로 온다
 */
export function upsize(url) {
  const u = new URL(url);
  if (!/^(blogthumb|postfiles|mblogthumb-phinf)\.pstatic\.net$/.test(u.hostname)) return url;
  u.hostname = 'postfiles.pstatic.net';
  u.search = '?type=w966';
  return u.toString();
}

/** 이미지 검색에 원본이 없을 때: 그 글 페이지의 og:image */
export async function findOgImage(postUrl) {
  const page = postPageUrl(postUrl);
  if (!page) return null;
  try {
    const res = await fetch(page, {
      headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const found = ogImage((await res.text()).slice(0, 300000));
    return found ? upsize(found) : null;
  } catch {
    return null;
  }
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

/** 최근 이 기간 안에 쓴 블로그 글을 '요즘 인기'로 센다 */
export const RECENT_DAYS = 90;

/**
 * 블로그 후기 수와 최근 글 수 (실패하면 null).
 * 최신순으로 50개를 받아서, 전체 글 수(total_count)와 그 50개 중 최근 RECENT_DAYS일 안의 글 수를 함께 센다.
 * 바깥 호출은 예전(후기 수만)과 똑같이 한 곳에 한 번이다.
 */
export async function blogStats(env, doc, now = Date.now()) {
  try {
    const data = await kakaoGet(env, `${DAUM}/blog?${new URLSearchParams({ query: lookupName(doc), size: '50', sort: 'recency' })}`);
    return { total: data.meta?.total_count ?? 0, recent: countRecent(data.documents ?? [], now) };
  } catch {
    return null;
  }
}

export function countRecent(docs, now = Date.now()) {
  const since = now - RECENT_DAYS * DAY * 1000;
  return docs.filter((d) => Date.parse(d.datetime ?? '') >= since).length;
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
    const stats = await Promise.all(documents.map((d) => blogStats(env, d)));
    documents.forEach((d, i) => {
      if (stats[i]) Object.assign(d, { review_count: stats[i].total, recent_count: stats[i].recent });
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
  if (url.pathname === '/pick') {
    // 골라 둔 명소 하나: 이름으로 찾아서 가장 비슷한 곳 하나 + 후기 수 · 최근 글 수
    const q = (url.searchParams.get('q') ?? '').trim();
    const c = coord(url);
    if (!q || q.length > 40 || !c) return json({ error: 'bad request' }, 400);
    const docs = await local(env, 'keyword', { query: q, x: c.x, y: c.y, sort: 'accuracy', size: '5' });
    const want = squash(q);
    const doc = docs.find((d) => squash(d.place_name).includes(want) || want.includes(squash(d.place_name)));
    if (doc) {
      const stats = await blogStats(env, doc);
      if (stats) Object.assign(doc, { review_count: stats.total, recent_count: stats.recent });
    }
    return json({ documents: doc ? [doc] : [] }, 200, { 'Cache-Control': `public, max-age=${DAY}` });
  }
  if (url.pathname === '/photo') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q || q.length > 60) return json({ error: 'bad request' }, 400);
    // 이미지 검색은 제목이 없어서 엉뚱한 사진이 자주 붙는다. 블로그·카페 글 중 제목에 장소 이름이 들어간
    // 글의 대표 사진만 쓰고, 그런 글이 없으면 사진을 주지 않는다 (앱은 종류별 기본 그림을 보여 준다)
    const name = (url.searchParams.get('name') ?? q.split(' ').slice(0, -1).join(' ') ?? q).trim() || q;
    const doc = await findPhoto(env, q, name);
    // 고화질: 같은 글에서 나온 원본 사진을 이미지 검색에서 찾아 /img로 대신 받아 준다
    const original = doc ? ((await findOriginal(env, q, doc.url)) ?? (await findOgImage(doc.url))) : null;
    const large = original ? `${url.origin}/img?u=${encodeURIComponent(original)}` : null;
    return json({ url: doc?.thumbnail ?? null, large, source: doc?.url ?? null }, 200, { 'Cache-Control': `public, max-age=${DAY * 7}` });
  }
  if (url.pathname === '/img') {
    // 블로그 원본 사진은 다른 앱에서 바로 열면 막히는 경우가 많아서 Worker가 대신 받아 준다
    const target = safeImageUrl(url.searchParams.get('u'));
    if (!target) return json({ error: 'bad request' }, 400);
    const res = await fetch(target, { headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (date-course-proxy)' } });
    const type = res.headers.get('Content-Type') ?? '';
    const size = Number(res.headers.get('Content-Length') ?? '0');
    if (!res.ok || !type.startsWith('image/') || size > MAX_IMAGE_BYTES) return json({ error: 'image unavailable' }, 404);
    return new Response(res.body, {
      status: 200,
      headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': `public, max-age=${DAY * 7}` },
    });
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
