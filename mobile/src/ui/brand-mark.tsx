import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RADII, TOKENS } from '@/theme/tokens';

export const BrandMark = ({ size = 56 }: { size?: number }) => (
  <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.28 }]}>
    <Svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5}>
      <Path d="M12 3.2 20.2 7.4 12 11.6 3.8 7.4 12 3.2Z" fill={TOKENS.white} opacity={0.95} />
      <Path
        d="M4.6 11.4 11.4 14.7a1.5 1.5 0 0 0 1.2 0l6.8-3.3M4.6 15.6l6.8 3.3a1.5 1.5 0 0 0 1.2 0l6.8-3.3"
        stroke={TOKENS.white}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.75}
        fill="none"
      />
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    backgroundColor: TOKENS.brand,
    justifyContent: 'center',
  },
});
