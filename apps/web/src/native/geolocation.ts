/* Shared current-location helper — the reusable foundation for every geolocation
 * feature (phase 1: delivery capture; later: farmer farm pin, consumer address,
 * hubs, VCO, geofencing). Uses @capacitor/geolocation on a device and the browser
 * Geolocation API otherwise.
 *
 * BEST-EFFORT BY DESIGN: returns null on denial, timeout, or an unsupported context,
 * and never throws. Location is always optional — a caller must be able to complete
 * its action (delivering an order, saving a profile) without it. */
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface Coords {
  lat: number;
  lng: number;
  /** Reported accuracy radius in metres, when the platform provides it. */
  accuracy?: number;
}

/** Read the current position, or null if it can't be obtained within `timeoutMs`.
 *  Native path prompts for permission via the Geolocation plugin; browser path via
 *  navigator.geolocation. */
export async function getCurrentPosition(timeoutMs = 10_000): Promise<Coords | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return await new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => resolve(null), // denied / unavailable / timed out — all mean "no fix"
        { enableHighAccuracy: true, timeout: timeoutMs },
      );
    });
  } catch {
    return null;
  }
}
