import { Platform } from "react-native";
import type { Level } from "@/lib/types";

/**
 * FlightIQ design tokens — "Horizon" direction.
 * Same indigo-black ground and violet/cyan palette as before. The difference
 * is restraint: no frosted glass or glow washes, just a hairline gradient
 * edge on surfaces, thin Sora numerals, and a planet-limb hero (see
 * components/horizon.tsx) that carries the brand.
 */
export const c = {
  bg: "#0a0b14",
  bgGradient: ["#1a1338", "#0a0b14"] as const,

  // Surfaces — an opaque dark panel with a gradient hairline edge (see GlassCard).
  panel: "rgba(16,16,34,0.9)",
  panelSolid: "#101022",
  glass: "rgba(255,255,255,0.055)",
  glassBorder: "rgba(255,255,255,0.1)",
  surface: "rgba(255,255,255,0.045)",
  surfaceBorder: "rgba(255,255,255,0.08)",
  hairline: "rgba(255,255,255,0.08)",
  /** Gradient hairline stops used on panels, pills and the tab bar. */
  edge: ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.05)", "rgba(139,107,255,0.3)"],
  edgeLive: ["rgba(255,255,255,0.28)", "rgba(255,255,255,0.05)", "rgba(79,227,255,0.3)"],

  text: "#f2f3fb",
  text2: "#a7acc9",
  // Was #6d7396 — lightened one step so 11–12px labels clear 4.5:1 on the ground.
  text3: "#8489ad",

  accent: "#8b6bff", // violet — primary accent
  accentBright: "#c2b6ff",
  accentSoft: "rgba(139,107,255,0.14)",
  accentPill: "rgba(139,107,255,0.2)",
  accentPillBorder: "rgba(194,182,255,0.25)",
  cyan: "#4fe3ff", // secondary accent — live/tracking data

  ok: "#34e0a1",
  okSoft: "rgba(52,224,161,0.14)",
  watch: "#ffb454",
  watchSoft: "rgba(255,180,84,0.14)",
  risk: "#ff5470",
  riskSoft: "rgba(255,84,112,0.14)",

  white: "#ffffff",
};

export const radius = { sm: 12, md: 16, lg: 22, xl: 26, pill: 999 };

/**
 * Sora carries all display type and numerals (ExtraLight → SemiBold);
 * Manrope carries everything you read. `mono` now maps to Sora too, so the
 * older screens that still say `font.monoBold` for airport codes pick up
 * the new look without being touched one by one.
 */
export const font = {
  displayThin: "Sora-ExtraLight",
  displayLight: "Sora-Light",
  display: "Sora-Bold",
  displaySemi: "Sora-SemiBold",
  displayMedium: "Sora-Medium",
  displayRegular: "Sora-Regular",
  sans: "Manrope-Regular",
  sansMedium: "Manrope-Medium",
  sansSemi: "Manrope-SemiBold",
  mono: "Sora-Regular",
  monoBold: "Sora-Medium",
};

export const glow = {
  accent: Platform.select({
    ios: { shadowColor: c.accent, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
    default: { elevation: 10 },
  }),
  cyan: Platform.select({
    ios: { shadowColor: c.cyan, shadowOpacity: 0.3, shadowRadius: 26, shadowOffset: { width: 0, height: 12 } },
    default: { elevation: 8 },
  }),
  card: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
    default: { elevation: 6 },
  }),
};

export const levelColor: Record<Level, { text: string; soft: string; solid: string }> = {
  good: { text: c.ok, soft: c.okSoft, solid: c.ok },
  watch: { text: c.watch, soft: c.watchSoft, solid: c.watch },
  risk: { text: c.risk, soft: c.riskSoft, solid: c.risk },
  neutral: { text: c.text2, soft: c.surface, solid: c.text3 },
};

/** The Sense → Predict → Decide → Act loop from the product blueprint. */
export type Stage = "sense" | "predict" | "decide" | "act";
export const stageColor: Record<Stage, { text: string; soft: string }> = {
  sense: { text: c.accentBright, soft: c.accentSoft },
  predict: { text: c.watch, soft: c.watchSoft },
  decide: { text: c.ok, soft: c.okSoft },
  act: { text: c.risk, soft: c.riskSoft },
};
