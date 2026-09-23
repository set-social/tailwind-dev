import { useContext, useEffect, useRef, type ReactNode } from "react";
import {
  Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text,
  View, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, font, levelColor, radius, stageColor, type Stage } from "@/theme";
import type { Level } from "@/lib/types";

/** Typography hierarchy — Sora (thin, wide numerals) for display, Manrope for reading. */
const variants = {
  display: { fontFamily: font.displayLight, fontSize: 30, lineHeight: 36, letterSpacing: -0.9, color: c.text },
  title: { fontFamily: font.displayRegular, fontSize: 22, lineHeight: 28, letterSpacing: -0.5, color: c.text },
  heading: { fontFamily: font.sansSemi, fontSize: 17, lineHeight: 23, color: c.text },
  body: { fontFamily: font.sans, fontSize: 14.5, lineHeight: 21, color: c.text2 },
  label: { fontFamily: font.sansMedium, fontSize: 14.5, lineHeight: 20, color: c.text },
  caption: { fontFamily: font.sans, fontSize: 12.5, lineHeight: 18, color: c.text3 },
  eyebrow: { fontFamily: font.sansSemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, textTransform: "uppercase", color: c.text3 },
  mono: { fontFamily: font.mono, fontSize: 14, lineHeight: 18, color: c.text },
} as const;

export function T({ v = "body", color, size, style, ...p }: TextProps & { v?: keyof typeof variants; color?: string; size?: number }) {
  return <Text {...p} style={[variants[v] as object, color ? { color } : null, size ? { fontSize: size } : null, style]} />;
}

/**
 * Full-bleed background: the plain indigo-black ground. Inside the tab
 * navigator the floating tab bar reports its height, and the content
 * scrolls clear of it; on stack screens it just clears the home indicator.
 */
export function Screen({ children, bottomInset = false, topPad, contentStyle }: { children: ReactNode; bottomInset?: boolean; topPad?: number; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const paddingBottom = tabBarHeight ? tabBarHeight + 24 : (bottomInset ? insets.bottom : 0) + 40;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: topPad ?? insets.top + 12, paddingBottom, paddingHorizontal: 24 }, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: 24 }}>
      {eyebrow && <T v="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</T>}
      <T v="display" accessibilityRole="header">{title}</T>
      {subtitle && <T style={{ marginTop: 8 }}>{subtitle}</T>}
    </View>
  );
}

export function SectionHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <View>
        {eyebrow && <T v="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</T>}
        <T v="heading">{title}</T>
      </View>
      {action}
    </View>
  );
}

export const Divider = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.hairline }, style]} />
);

/** A hairline that fades out at both ends — the Horizon section rule. */
export const FadeRule = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <LinearGradient
    colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
    style={[{ height: 1 }, style]}
  />
);

// Layout props that belong on the outer wrapper of a panel; everything else (padding, alignment, gaps) goes on the inner surface.
const OUTER = new Set([
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical",
  "flex", "flexGrow", "flexShrink", "flexBasis", "width", "height", "minWidth", "maxWidth", "alignSelf",
  "position", "top", "left", "right", "bottom", "opacity", "zIndex",
]);

function splitStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (OUTER.has(k) ? outer : inner)[k] = flat[k];
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

/**
 * A surface with a 1px gradient edge, built from layers so that padding never
 * sits on a gradient view. (React Native insets absolutely-positioned children
 * by their parent's padding, so putting padding on a LinearGradient shifts its
 * gradient layer and leaves a thick, mis-sized rim, which is what the first
 * version of GlassCard did on a real device.) Layers, back to front: the edge
 * gradient fills the box; the fill sits 1px inside it; the content flows on
 * top and is the only thing that sizes the box, so `contentStyle` may carry
 * any padding. `fill` must be opaque, or the edge colours show through it.
 */
export function EdgedSurface({ edge, edgeEnd = { x: 1, y: 1 }, fill, radius: r, style, contentStyle, children }: {
  edge: string[]; edgeEnd?: { x: number; y: number }; fill: [string, string]; radius: number;
  style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  return (
    <View style={[{ borderRadius: r, overflow: "hidden" }, style]}>
      <LinearGradient colors={edge} start={{ x: 0, y: 0 }} end={edgeEnd} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={fill} style={{ position: "absolute", top: 1, left: 1, right: 1, bottom: 1, borderRadius: r - 1 }} />
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

/**
 * The Horizon surface: an opaque dark panel with a one-pixel gradient edge
 * (bright at the top-left, violet at the bottom-right). Replaces the old
 * frosted-glass card — no blur, no glow, just a lit edge. Name kept so
 * every existing screen picks it up. `tint` is accepted and ignored.
 */
export function GlassCard({ children, style, live = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: "dark" | "light"; live?: boolean }) {
  const { outer, inner } = splitStyle(style);
  return (
    <EdgedSurface edge={live ? c.edgeLive : c.edge} fill={["#111225", "#0c0d1c"]} radius={radius.lg} style={outer} contentStyle={inner}>
      {children}
    </EdgedSurface>
  );
}

/** A flatter surface for dense list rows. */
export const Surface = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: radius.md }, style]}>{children}</View>
);

/** Status as a dot + coloured text — no filled pill. */
export function StatusPill({ level, children }: { level: Level; children: ReactNode }) {
  const st = levelColor[level];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.solid }} />
      <Text style={{ fontFamily: font.sansMedium, fontSize: 12.5, color: st.text }}>{children}</Text>
    </View>
  );
}

/** Tags a module with its stage in the product's Sense → Predict → Decide → Act loop. */
export function StageTag({ stage }: { stage: Stage }) {
  const st = stageColor[stage];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: st.soft, borderRadius: 5, paddingVertical: 3, paddingHorizontal: 7, marginBottom: 10 }}>
      <Text style={{ fontFamily: font.sansSemi, fontSize: 9.5, letterSpacing: 0.8, color: st.text }}>{stage.toUpperCase()}</Text>
    </View>
  );
}

export function Press({ children, onPress, style, label, hitSlop = 6 }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string; hitSlop?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The three Horizon button treatments. `light` is the primary action (ivory
 * pill), `violet` is the loud one (used sparingly), `outline` is the quiet
 * one with a violet-to-cyan hairline edge.
 */
export function Button({ label, onPress, variant = "outline", icon, disabled, style, textStyle }: {
  label: string; onPress?: () => void; variant?: "light" | "violet" | "outline"; icon?: ReactNode; disabled?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>;
}) {
  const ink = variant !== "outline";
  const row: ViewStyle = { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 };
  const text = <Text style={[{ fontFamily: font.sansSemi, fontSize: 15, color: ink ? c.bg : c.text }, textStyle]}>{label}</Text>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, style]}
    >
      {variant === "outline" ? (
        <EdgedSurface edge={["rgba(139,107,255,0.75)", "rgba(79,227,255,0.75)"]} edgeEnd={{ x: 1, y: 0 }} fill={["#10101f", "#10101f"]} radius={27} contentStyle={{ ...row, height: 54 }}>
          {icon}{text}
        </EdgedSurface>
      ) : variant === "violet" ? (
        <LinearGradient colors={["#9b81ff", c.accent]} style={{ ...row, height: 54, borderRadius: 27 }}>{icon}{text}</LinearGradient>
      ) : (
        <View style={{ ...row, height: 54, borderRadius: 27, backgroundColor: c.text }}>{icon}{text}</View>
      )}
    </Pressable>
  );
}

/** A pill-shaped input well with the same gradient hairline as every other Horizon surface. Put icons, a TextInput and any trailing button inside. */
export function FieldBox({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <EdgedSurface edge={c.edge} fill={["#0e0f1e", "#0e0f1e"]} radius={27} style={style} contentStyle={{ height: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18 }}>
      {children}
    </EdgedSurface>
  );
}

/** A selectable pill — date picker, suggestions. On = the violet tab-bar pill treatment. */
export function Chip({ label, on = false, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Press
      label={label} onPress={onPress} hitSlop={4}
      style={{ minHeight: 38, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.accentPill : c.surface, borderWidth: 1, borderColor: on ? c.accentPillBorder : c.surfaceBorder }}
    >
      <Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: on ? c.accentBright : c.text2 }}>{label}</Text>
    </Press>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { id: K; label: string }[]; value: K; onChange: (v: K) => void }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: radius.pill, padding: 3 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Press
            key={o.id} onPress={() => onChange(o.id)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: on ? c.accentPill : "transparent", borderWidth: 1, borderColor: on ? c.accentPillBorder : "transparent", alignItems: "center" }}
          >
            <Text style={{ fontFamily: font.sansSemi, fontSize: 13, color: on ? c.accentBright : c.text2 }}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
  <Switch
    accessibilityLabel={label}
    value={value}
    onValueChange={onChange}
    trackColor={{ false: c.surfaceBorder, true: c.accent }}
    thumbColor={c.white}
  />
);

export function Stepper({ value, onChange, min, max, step = 1, format, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string; label: string }) {
  const btn: ViewStyle = { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, alignItems: "center", justifyContent: "center" };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Press label={`Decrease ${label}`} style={btn} onPress={() => onChange(Math.max(min, value - step))}><T v="heading">−</T></Press>
      <T v="mono" style={{ minWidth: 56, textAlign: "center" }}>{format ? format(value) : value}</T>
      <Press label={`Increase ${label}`} style={btn} onPress={() => onChange(Math.min(max, value + step))}><T v="heading">+</T></Press>
    </View>
  );
}

/** Fade + rise on mount, staggered by `index`. */
export function Reveal({ children, index = 0, style }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 450, delay: 80 + index * 70, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [v, index]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

export function Skeleton({ w, h }: { w: number | `${number}%`; h: number }) {
  const v = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 0.9, duration: 700, useNativeDriver: true }), Animated.timing(v, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    a.start(); return () => a.stop();
  }, [v]);
  return <Animated.View style={{ width: w, height: h, borderRadius: 6, backgroundColor: c.surface, opacity: v }} />;
}
