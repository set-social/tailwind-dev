import Geolocation from "@react-native-community/geolocation";

export interface Coords {
  latitude: number;
  longitude: number;
}

export type LocationResult = { status: "ok"; coords: Coords } | { status: "denied" } | { status: "unavailable" };

/**
 * Requests location permission (iOS prompts on first call, via the
 * NSLocationWhenInUseUsageDescription string in Info.plist) and gets a
 * single current fix. Never throws — callers get a typed result instead,
 * so a denied/unavailable location degrades a screen rather than crashing
 * it.
 */
export function getCurrentLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    Geolocation.requestAuthorization(
      () => {
        Geolocation.getCurrentPosition(
          (pos) => resolve({ status: "ok", coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } }),
          (err) => {
            // Expected/handled (e.g. no simulated location in the iOS
            // Simulator, or a real device with GPS off) — the caller
            // already renders a proper "unavailable, try again" state for
            // this, so console.error's intrusive red LogBox screen would
            // be misleading here. warn keeps it visible without that.
            console.warn("getCurrentPosition failed:", err.message);
            resolve(err.code === err.PERMISSION_DENIED ? { status: "denied" } : { status: "unavailable" });
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
        );
      },
      (err) => {
        console.warn("requestAuthorization failed:", err.message);
        resolve({ status: "denied" });
      },
    );
  });
}
