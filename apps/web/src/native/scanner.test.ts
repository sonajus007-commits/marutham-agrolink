import { describe, it, expect, vi, beforeEach } from 'vitest';

/* scanQrCode must never depend on Play services having downloaded Google's code
 * scanner: when it is missing, the QR is read from a photo by the bundled model. */

const isNativePlatform = vi.fn();
const getPlatform = vi.fn();
const isModuleAvailable = vi.fn();
const installModule = vi.fn();
const scan = vi.fn();
const readBarcodesFromImage = vi.fn();
const getPhoto = vi.fn();
const checkPermissions = vi.fn();
const reportPermissionDenied = vi.fn();
vi.mock('./permissions', () => ({
  isDeniedState: (s: string) => s === 'denied',
  reportPermissionDenied: (f: string) => reportPermissionDenied(f),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform(), getPlatform: () => getPlatform() },
}));
vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: (o: unknown) => getPhoto(o),
    checkPermissions: () => checkPermissions(),
  },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA' },
}));
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { QrCode: 'QR_CODE' },
  BarcodeScanner: {
    isGoogleBarcodeScannerModuleAvailable: () => isModuleAvailable(),
    installGoogleBarcodeScannerModule: () => installModule(),
    scan: (o: unknown) => scan(o),
    readBarcodesFromImage: (o: unknown) => readBarcodesFromImage(o),
  },
}));

const { scanQrCode } = await import('./scanner');

beforeEach(() => {
  vi.clearAllMocks();
  isNativePlatform.mockReturnValue(true);
  getPlatform.mockReturnValue('android');
  installModule.mockResolvedValue(undefined);
  getPhoto.mockResolvedValue({ path: 'file:///photo.jpg' });
  checkPermissions.mockResolvedValue({ camera: 'granted' });
});

describe('scanQrCode', () => {
  it('uses the live scanner when it is ready', async () => {
    isModuleAvailable.mockResolvedValue({ available: true });
    scan.mockResolvedValue({ barcodes: [{ rawValue: ' ORD1 ' }] });

    await expect(scanQrCode()).resolves.toEqual({ kind: 'code', code: 'ORD1' });
    expect(getPhoto).not.toHaveBeenCalled();
  });

  it('reads a photo when the live scanner is not downloaded, and starts its download', async () => {
    isModuleAvailable.mockResolvedValue({ available: false });
    readBarcodesFromImage.mockResolvedValue({ barcodes: [{ rawValue: 'ORD2' }] });

    await expect(scanQrCode()).resolves.toEqual({ kind: 'code', code: 'ORD2' });
    expect(installModule).toHaveBeenCalled();
    expect(scan).not.toHaveBeenCalled();
    expect(readBarcodesFromImage).toHaveBeenCalledWith({
      path: 'file:///photo.jpg',
      formats: ['QR_CODE'],
    });
  });

  it('falls back to a photo when the live scanner errors', async () => {
    isModuleAvailable.mockResolvedValue({ available: true });
    scan.mockRejectedValue(new Error('Waiting for the Barcode UI module to be downloaded.'));
    readBarcodesFromImage.mockResolvedValue({ barcodes: [{ rawValue: 'ORD3' }] });

    await expect(scanQrCode()).resolves.toEqual({ kind: 'code', code: 'ORD3' });
  });

  it('backing out of the live scanner is a cancel, not a photo', async () => {
    isModuleAvailable.mockResolvedValue({ available: true });
    scan.mockRejectedValue(new Error('scan canceled.'));

    await expect(scanQrCode()).resolves.toEqual({ kind: 'cancelled' });
    expect(getPhoto).not.toHaveBeenCalled();
  });

  it('a photo with no QR is unreadable', async () => {
    isModuleAvailable.mockResolvedValue({ available: false });
    readBarcodesFromImage.mockResolvedValue({ barcodes: [] });

    await expect(scanQrCode()).resolves.toEqual({ kind: 'unreadable' });
  });

  it('closing the camera without a photo is a cancel', async () => {
    isModuleAvailable.mockResolvedValue({ available: false });
    getPhoto.mockRejectedValue(new Error('User cancelled photos app'));

    await expect(scanQrCode()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('does nothing in the browser', async () => {
    isNativePlatform.mockReturnValue(false);

    await expect(scanQrCode()).resolves.toEqual({ kind: 'failed' });
    expect(isModuleAvailable).not.toHaveBeenCalled();
  });
});

describe('scanQrCode — camera permission', () => {
  it('reports a blocked camera instead of a generic failure', async () => {
    isModuleAvailable.mockResolvedValue({ available: false });
    getPhoto.mockRejectedValue(new Error('User denied access to camera'));
    checkPermissions.mockResolvedValue({ camera: 'denied' });
    await expect(scanQrCode()).resolves.toEqual({ kind: 'denied' });
    expect(reportPermissionDenied).toHaveBeenCalledWith('camera');
  });

  it('stays a plain failure when the camera is allowed', async () => {
    isModuleAvailable.mockResolvedValue({ available: false });
    getPhoto.mockRejectedValue(new Error('boom'));
    await expect(scanQrCode()).resolves.toEqual({ kind: 'failed' });
    expect(reportPermissionDenied).not.toHaveBeenCalled();
  });
});
