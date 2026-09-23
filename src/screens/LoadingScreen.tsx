import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { Wordmark } from "@/components/brand";
import { HorizonHero } from "@/components/horizon";
import { T } from "@/components/ui";
import { c } from "@/theme";

const TRACK_WIDTH = 130;
const SWEEP_WIDTH = 52;

function TrackSweep() {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [-SWEEP_WIDTH, TRACK_WIDTH] });

  return (
    <View style={{ width: TRACK_WIDTH, height: 2, borderRadius: 2, backgroundColor: c.surfaceBorder, overflow: "hidden" }}>
      <Animated.View style={{ width: SWEEP_WIDTH, height: 2, transform: [{ translateX }] }}>
        <LinearGradient
          colors={["transparent", c.cyan, c.accent, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Shown while RootNavigator is still resolving the initial session (see its
 * `!checked` gate) — a cold-start splash, not a navigable route. The wordmark
 * breathes gently over the planet limb; no glow behind it.
 */
export default function LoadingScreen() {
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);

  const opacity = beat.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 210 }}>
        <HorizonHero variant="detail" showRoute={false} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 26 }}>
        <Animated.View style={{ opacity }}><Wordmark width={250} /></Animated.View>
        <TrackSweep />
        <T v="eyebrow">Tracking the skies</T>
      </View>
    </View>
  );
}
