import { Image } from "react-native";

const WORDMARK = require("../../assets/logo/flightIqWordmark.png");
/** Source art (trimmed of its transparent margin) is 1853 x 382. */
const WORDMARK_RATIO = 382 / 1853;

/**
 * The FlightIQ wordmark: the wing mark, "Flight" in white and "IQ" in blue,
 * on a transparent background so it sits directly on the app's dark ground.
 * No halo or glow behind it — the planet-limb art provides the atmosphere.
 */
export function Wordmark({ width = 170 }: { width?: number }) {
  return <Image source={WORDMARK} resizeMode="contain" accessibilityLabel="FlightIQ" style={{ width, height: width * WORDMARK_RATIO }} />;
}
