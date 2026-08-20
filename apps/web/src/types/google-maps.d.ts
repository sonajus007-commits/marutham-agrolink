// Minimal ambient types for the slice of the Google Maps JS SDK the live-tracking
// map uses — just enough surface to type OrderMap without pulling in the full
// @types/google.maps package (and without an `any`). The SDK is loaded from the CDN
// at runtime by lib/googleMaps.ts, and is absent entirely when no API key is set.

interface GMapsLatLngLiteral {
  lat: number;
  lng: number;
}

interface GMapsMapOptions {
  center?: GMapsLatLngLiteral;
  zoom?: number;
  disableDefaultUI?: boolean;
  mapTypeControl?: boolean;
  streetViewControl?: boolean;
  fullscreenControl?: boolean;
  clickableIcons?: boolean;
}

interface GMapsMap {
  fitBounds(bounds: GMapsLatLngBounds, padding?: number): void;
  setCenter(c: GMapsLatLngLiteral): void;
  setZoom(z: number): void;
}

interface GMapsSymbol {
  path: number;
  scale?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
}

interface GMapsMarkerOptions {
  position: GMapsLatLngLiteral;
  map?: GMapsMap | null;
  title?: string;
  label?: string | { text: string; fontSize?: string; color?: string };
  icon?: GMapsSymbol | string;
  zIndex?: number;
}

interface GMapsMarker {
  setPosition(p: GMapsLatLngLiteral): void;
  setMap(m: GMapsMap | null): void;
}

interface GMapsPolylineOptions {
  path: GMapsLatLngLiteral[];
  map?: GMapsMap | null;
  geodesic?: boolean;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
}

interface GMapsPolyline {
  setMap(m: GMapsMap | null): void;
  setPath(path: GMapsLatLngLiteral[]): void;
}

interface GMapsLatLngBounds {
  extend(p: GMapsLatLngLiteral): void;
  isEmpty(): boolean;
}

interface GMapsDirectionsRequest {
  origin: GMapsLatLngLiteral;
  destination: GMapsLatLngLiteral;
  travelMode: string;
}

/** A leg's `distance`/`duration`: `text` is human-readable ("18 mins"), `value` is
 *  the raw number (metres / seconds). */
interface GMapsDirectionsMetric {
  text: string;
  value: number;
}

interface GMapsDirectionsLeg {
  distance?: GMapsDirectionsMetric;
  duration?: GMapsDirectionsMetric;
}

interface GMapsDirectionsRoute {
  legs: GMapsDirectionsLeg[];
}

interface GMapsDirectionsResult {
  routes: GMapsDirectionsRoute[];
}

interface GMapsDirectionsService {
  // The modern SDK returns a Promise; it rejects when no route is found.
  route(request: GMapsDirectionsRequest): Promise<GMapsDirectionsResult>;
}

interface GMapsDirectionsRendererOptions {
  map?: GMapsMap | null;
  suppressMarkers?: boolean;
  preserveViewport?: boolean;
  polylineOptions?: {
    strokeColor?: string;
    strokeOpacity?: number;
    strokeWeight?: number;
  };
}

interface GMapsDirectionsRenderer {
  setDirections(result: GMapsDirectionsResult): void;
  setMap(map: GMapsMap | null): void;
}

interface GMapsApi {
  Map: new (el: HTMLElement, opts?: GMapsMapOptions) => GMapsMap;
  Marker: new (opts: GMapsMarkerOptions) => GMapsMarker;
  Polyline: new (opts: GMapsPolylineOptions) => GMapsPolyline;
  LatLngBounds: new () => GMapsLatLngBounds;
  DirectionsService: new () => GMapsDirectionsService;
  DirectionsRenderer: new (opts?: GMapsDirectionsRendererOptions) => GMapsDirectionsRenderer;
  SymbolPath: { CIRCLE: number; FORWARD_CLOSED_ARROW: number };
  TravelMode: { DRIVING: string };
}

interface Window {
  google?: { maps: GMapsApi };
}
