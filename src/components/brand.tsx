import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Platform, View, type ViewStyle } from "react-native";
import { c } from "@/theme";

const WORDMARK = require("../../assets/logo/wordmark.png");
const WORDMARK_RATIO = 793 / 1983; // source art is 1983x793

const glowLayer = (color: string, size: number, shadowRadius: number, shadowOpacity: number): ViewStyle => ({
  position: "absolute",
  width: size,
  height: size,
  borderRadius: size / 2,
  backgroundColor: "transparent",
  ...Platform.select({
    ios: { shadowColor: color, shadowOpacity, shadowRadius, shadowOffset: { width: 0, height: 0 } },
    default: {},
  }),
});

/**
 * The wordmark on its own reads as flat against the app's violet-toned
 * background glow — this gives it a brighter, tighter bloom (cyan core inside
 * a wider violet halo) so it separates from the ambient gradient instead of
 * blending into it. `pulse` drives the loading-screen variant; sign-in uses
 * the same halo static.
 */
export function BrandHalo({ width = 185, pulse = false }: { width?: number; pulse?: boolean }) {
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, beat]);

  const scale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const opacity = beat.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });
  const animatedStyle = pulse ? { opacity, transform: [{ scale }] } : null;

  const height = width * WORDMARK_RATIO;

  return (
    <View style={{ width: width * 1.35, height: width * 0.85, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[glowLayer(c.accent, width * 1.35, 52, 0.45), animatedStyle]} />
      <Animated.View style={[glowLayer(c.cyan, width * 0.85, 34, 0.4), animatedStyle]} />
      <Image source={WORDMARK} resizeMode="contain" style={{ width, height }} />
    </View>
  );
}

/** The wordmark on its own — no halo. Horizon relies on the planet-limb art for atmosphere, not a glow behind the logo. */
export function Wordmark({ width = 170 }: { width?: number }) {
  return <Image source={WORDMARK} resizeMode="contain" accessibilityLabel="TailWind" style={{ width, height: width * WORDMARK_RATIO }} />;
}
