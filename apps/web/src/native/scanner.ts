/* Native QR scanning for the Capacitor shell. A no-op in the browser, where
 * ScanSheet keeps the typed-code field only.
 *
 * Two readers, best first:
 *  1. Google's code scanner — a live full-screen camera that needs no camera
 *     permission, but lives in Play services and must be downloaded first. Phones
 *     can go a long time without fetching it (no data, low storage, or simply not
 *     yet), so it is never the only way in.
 *  2. A photo of the QR, decoded on the phone by the ML Kit model bundled in the
 *     APK. Works offline on any phone with a camera.
 * When (1) is missing we start its download in the background and use (2) now.
 *
 * The order QR encodes the bare order code (backend routes/orders.js), which is
 * exactly what POST /orders/:id/scan accepts. */
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

/** True only on a device, where the camera scanner can open. */
export const scannerAvailable = (): boolean => Capacitor.isNativePlatform();

export type ScanOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'cancelled' }
  /** A photo was taken but held no readable QR. */
  | { kind: 'unreadable' }
  | { kind: 'failed' };

const QR = [BarcodeFormat.QrCode];
const isCancel = (e: unknown) => /cancel/i.test(e instanceof Error ? e.message : String(e));
const firstCode = (barcodes: { rawValue?: string }[]) => barcodes[0]?.rawValue?.trim() || '';

/** Is Google's live scanner ready? On Android, start fetching it when it isn't. */
async function liveScannerReady(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android') return true;
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
    return available;
  } catch {
    return false;
  }
}

async function scanFromPhoto(): Promise<ScanOutcome> {
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 90,
      correctOrientation: true,
    });
    if (!photo.path) return { kind: 'failed' };
    const { barcodes } = await BarcodeScanner.readBarcodesFromImage({
      path: photo.path,
      formats: QR,
    });
    const code = firstCode(barcodes);
    return code ? { kind: 'code', code } : { kind: 'unreadable' };
  } catch (e) {
    // getPhoto rejects on cancel and on a denied camera permission alike.
    return isCancel(e) ? { kind: 'cancelled' } : { kind: 'failed' };
  }
}

/** Read one order QR with the camera. */
export async function scanQrCode(): Promise<ScanOutcome> {
  if (!Capacitor.isNativePlatform()) return { kind: 'failed' };
  if (await liveScannerReady()) {
    try {
      const { barcodes } = await BarcodeScanner.scan({ formats: QR });
      const code = firstCode(barcodes);
      return code ? { kind: 'code', code } : { kind: 'cancelled' };
    } catch (e) {
      if (isCancel(e)) return { kind: 'cancelled' };
      // The live scanner refused (e.g. its module went missing) — use a photo.
    }
  }
  return scanFromPhoto();
}
