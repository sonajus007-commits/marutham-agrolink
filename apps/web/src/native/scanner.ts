/* Native QR scanning for the Capacitor shell, via Google's code scanner (ML Kit).
 * It opens its own full-screen camera UI and hands back the decoded text, so the
 * app needs no camera preview of its own and no runtime camera prompt. A no-op in
 * the browser, where ScanSheet keeps the typed-code field only.
 *
 * The order QR encodes the bare order code (backend routes/orders.js), which is
 * exactly what POST /orders/:id/scan accepts. */
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';

/** True only on a device, where the camera scanner can open. */
export const scannerAvailable = (): boolean => Capacitor.isNativePlatform();

export type ScanOutcome =
  | { kind: 'code'; code: string }
  | { kind: 'cancelled' }
  /** Play services is still downloading the scanner; retry shortly. */
  | { kind: 'installing' }
  | { kind: 'failed' };

/** Open the camera scanner and return the first QR code it reads. */
export async function scanQrCode(): Promise<ScanOutcome> {
  if (!Capacitor.isNativePlatform()) return { kind: 'failed' };
  try {
    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        // Normally fetched at install (manifest meta-data); this covers a device
        // that skipped it. The download runs in the background.
        await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
        return { kind: 'installing' };
      }
    }
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    const code = barcodes[0]?.rawValue?.trim();
    return code ? { kind: 'code', code } : { kind: 'cancelled' };
  } catch (e) {
    // The plugin rejects when the person backs out of the scanner.
    const msg = e instanceof Error ? e.message : String(e);
    return /cancel/i.test(msg) ? { kind: 'cancelled' } : { kind: 'failed' };
  }
}
