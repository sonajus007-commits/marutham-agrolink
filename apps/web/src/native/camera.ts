/* Native camera/gallery capture for the Capacitor shell. A no-op in the browser,
 * where ImagePicker falls back to <input type="file">. Returns a raw JPEG data URL;
 * the caller still downscales it to the stored size, so the backend sees the same
 * shape whichever path a photo came in through. */
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isDeniedState, reportPermissionDenied } from './permissions';

/** True only on a device, where the native camera prompt is available. */
export const cameraAvailable = (): boolean => Capacitor.isNativePlatform();

/** Open the native "Camera or Photos" prompt and return the picked image as a data
 *  URL, or null when we're in a browser or the user cancelled / denied permission. */
export async function capturePhoto(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // let the farmer choose take-photo vs pick-from-gallery
      quality: 80,
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  } catch {
    // getPhoto rejects on cancel and on a denied permission alike. A cancel needs
    // no message; a denial does, because retrying can never work until the user
    // re-allows the camera.
    await reportIfCameraDenied();
    return null;
  }
}

/** After a failed capture: if the camera permission is blocked, say so. */
export async function reportIfCameraDenied(): Promise<boolean> {
  try {
    const perm = await Camera.checkPermissions();
    if (isDeniedState(perm.camera)) {
      reportPermissionDenied('camera');
      return true;
    }
  } catch {
    /* can't tell — stay quiet */
  }
  return false;
}
