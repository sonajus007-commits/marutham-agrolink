/* Native camera/gallery capture for the Capacitor shell. A no-op in the browser,
 * where ImagePicker falls back to <input type="file">. Returns a raw JPEG data URL;
 * the caller still downscales it to the stored size, so the backend sees the same
 * shape whichever path a photo came in through. */
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

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
    // getPhoto rejects on cancel and on a denied permission alike; both mean
    // "no photo this time", so there is nothing to surface — the farmer can retry.
    return null;
  }
}
