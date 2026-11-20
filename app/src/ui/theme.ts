/**
 * 에디토리얼 포토 (Stitch 시안 2): 흰 바탕, 검은 글씨, 큰 사진 카드.
 * 선택은 검정(accent), 주요 버튼만 딥 코랄(accentStrong).
 */
export const colors = {
  bg: '#ffffff',
  card: '#ffffff',
  /** 옅은 회색 면 (입력칸, 세그먼트 배경, 사진 자리) */
  surface: '#f4f4f5',
  line: '#ececee',
  text: '#111111',
  muted: '#6e6e73',
  /** 선택 상태 (칩·탭·테두리) */
  accent: '#111111',
  /** 채운 주요 버튼, 강조 글씨 (흰 글씨 대비 5.3:1) */
  accentStrong: '#c8332a',
  accentSoft: '#f4f4f5',
  onAccent: '#ffffff',
  disabled: '#c9c9cd',
  mint: '#e3f5ef',
  onMint: '#00594c',
  pink: '#fdeeec',
  onPink: '#a62a22',
  warn: '#8a5a00',
  warnSoft: '#fff4dc',
  ok: '#007a63',
};

export const radius = { card: 12, tile: 12, pill: 999 };

export const softShadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
};
