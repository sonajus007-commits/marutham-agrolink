/* "Permission denied" for device features (camera, location).
 *
 * The capture helpers stay best-effort — they still return null / 'failed' and the
 * caller carries on — but a DENIED permission is different from a cancel: retrying
 * will never work until the user changes a setting. So when a helper sees a denial
 * it reports it here, and <PermissionNotice> (mounted once in App) tells the user
 * what is blocked and where to turn it back on. */
import { Capacitor } from '@capacitor/core';

export type DeviceFeature = 'camera' | 'location';

const listeners = new Set<(feature: DeviceFeature) => void>();

export function onPermissionDenied(fn: (feature: DeviceFeature) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reportPermissionDenied(feature: DeviceFeature): void {
  listeners.forEach((fn) => fn(feature));
}

/** A Capacitor permission state that means "the OS will not ask again on its own". */
export function isDeniedState(state: string | undefined): boolean {
  return state === 'denied';
}

/** Where the user re-enables a permission: the phone's app settings, or the browser's site settings. */
export const deniedWhere = (): 'device' | 'browser' =>
  Capacitor.isNativePlatform() ? 'device' : 'browser';
