import { Platform, Text as RNText, type TextProps } from 'react-native';

/** 한글이 단어(어절) 중간에서 끊기지 않게 하는 Text. 앱 전체에서 react-native의 Text 대신 쓴다. */
const webKeepAll = Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as object) : undefined;

export default function Text({ style, ...props }: TextProps) {
  return <RNText lineBreakStrategyIOS="hangul-word" textBreakStrategy="simple" style={webKeepAll ? [webKeepAll, style] : style} {...props} />;
}
