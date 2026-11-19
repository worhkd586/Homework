/** 라벤더 구름 (Stitch 시안 B)를 정돈한 버전: 거의 흰 배경, 얇은 테두리의 흰 카드, 라일락 포인트 하나 */
export const colors = {
  bg: '#f7f6fb',
  card: '#ffffff',
  /** 카드 안의 옅은 칸 (버튼, 입력칸, 사진 자리) */
  surface: '#eeebf7',
  line: '#e7e3f2',
  text: '#1c1639',
  muted: '#6b6680',
  /** 라일락: 글씨·테두리·채운 버튼 모두 (흰 글씨 대비 6.9:1) */
  accent: '#5949c0',
  accentStrong: '#5949c0',
  accentSoft: '#efebff',
  onAccent: '#ffffff',
  disabled: '#c9c2e6',
  mint: '#d5f7ee',
  onMint: '#00594c',
  pink: '#ffe3ef',
  onPink: '#844965',
  warn: '#8a5a00',
  warnSoft: '#fff4dc',
  ok: '#00705e',
};

export const radius = { card: 16, tile: 14, pill: 999 };

/** 구름처럼 떠 있는 부드러운 그림자 */
export const softShadow = {
  shadowColor: '#5949c0',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 2,
};
