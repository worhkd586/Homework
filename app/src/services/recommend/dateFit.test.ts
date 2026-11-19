import { describe, expect, it } from 'vitest';
import type { Place } from '../../domain/types';
import { dateFit, isChain, isGenericName, samePlaceFamily, trustedReviews } from './dateFit';

const place = (name: string, tags: string[], category: Place['category'] = 'restaurant', reviewCount?: number): Place => ({
  id: name, name, regionId: 'seongsu', category, location: { lat: 0, lng: 0 }, rating: 4, reviewCount, openMinute: 0, closeMinute: 1440, tags, description: '',
});

describe('dateFit', () => {
  it('spots franchise branches', () => {
    expect(isChain(place('설빙 성수점', ['카페', '설빙'], 'cafe'))).toBe(true);
    expect(isChain(place('밥플러스 성수역점', ['한식', '밥플러스'], 'restaurant'))).toBe(true);
    expect(isChain(place('소문난성수감자탕', ['한식', '감자탕']))).toBe(false);
    expect(isChain(place('지금이밤 성수본점', ['술집', '일본식주점'], 'bar'))).toBe(false);
  });

  it('does not trust blog counts for names made of common words', () => {
    expect(isGenericName(place('더까페', ['카페'], 'cafe'))).toBe(true);
    expect(isGenericName(place('카페 산책', ['카페'], 'cafe'))).toBe(true);
    expect(isGenericName(place('어니언 성수', ['카페'], 'cafe'))).toBe(false);
    expect(trustedReviews(place('본카페', ['카페'], 'cafe', 80000))).toBe(300);
    expect(trustedReviews(place('어니언 성수', ['카페'], 'cafe', 3275))).toBe(3275);
  });

  it('prefers date-like meals over plain ones, unless the budget is cheap', () => {
    const pasta = dateFit(place('스케줄 성수', ['양식'])).score;
    const stew = dateFit(place('소문난성수감자탕', ['한식', '감자탕'])).score;
    expect(pasta).toBeGreaterThan(stew);
    expect(dateFit(place('소문난성수감자탕', ['한식', '감자탕']), { budget: 'cheap' }).score).toBe(0);
  });

  it('boosts neighborhood picks', () => {
    expect(dateFit({ ...place('서울숲', ['공원'], 'walk'), pick: true }).reasons).toContain('데이트 명소');
  });

  it('groups parts of the same place', () => {
    expect(samePlaceFamily(place('롯데월드 어드벤처', []), place('롯데월드 월드모노레일', []))).toBe(true);
    expect(samePlaceFamily(place('석촌호수 서호', []), place('석촌호수길 카페거리', []))).toBe(true);
    expect(samePlaceFamily(place('국립중앙박물관', []), place('국립한글박물관', []))).toBe(false);
  });
});

describe('isGenericName with neighborhood words', () => {
  it('ignores the dong name and the branch suffix', () => {
    expect(isGenericName(place('익선동 고기집', ['한식']))).toBe(true);
    expect(isGenericName(place('어니언 성수점', ['카페'], 'cafe'))).toBe(false);
  });
});
