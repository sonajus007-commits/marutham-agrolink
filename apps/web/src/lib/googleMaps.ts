/* Loads the Google Maps JS SDK once, on demand, for the live-tracking map.
 *
 * Keyed on VITE_GOOGLE_MAPS_API_KEY: with no key it never injects a script and
 * resolves null, so the app — and every consumer of the map — works without Google
 * configured. The <script> is fetched from maps.googleapis.com; this app runs no CSP
 * (helmet CSP is off), so nothing blocks it. The load promise is cached module-wide,
 * so N order sheets share ONE SDK load. */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loadPromise: Promise<GMapsApi | null> | null = null;

/** True when a Maps API key is configured. Callers use this to decide whether to
 *  render the map at all (and skip the lazy chunk entirely when it isn't). */
export function isMapsConfigured(): boolean {
  return Boolean(KEY);
}

/** Resolve the Google Maps API, loading the SDK on first call. Resolves null when
 *  no key is set or the script fails to load — never rejects. */
export function loadGoogleMaps(): Promise<GMapsApi | null> {
  if (!KEY) return Promise.resolve(null);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<GMapsApi | null>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement('script');
    // Deliberately NOT `loading=async`: the async bootstrap leaves window.google.maps
    // a stub at onload — its classes (Map, Marker, SymbolPath, …) only appear after
    // an `await google.maps.importLibrary(...)`, so calling `new google.maps.Map()`
    // straight away throws "Map is not a constructor". The classic loader has the
    // full core API ready the instant onload fires, which is all this map uses.
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(KEY);
    script.async = true;
    script.defer = true;
    // Resolve only when the API is genuinely usable (the Map constructor is present),
    // so a half-initialised SDK is treated as a failure the caller can fall back from
    // rather than a truthy object the map then crashes on.
    script.onload = () => resolve(window.google?.maps?.Map ? window.google.maps : null);
    script.onerror = () => {
      // Let a later call retry (e.g. after connectivity returns) rather than caching
      // the failure forever.
      loadPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
