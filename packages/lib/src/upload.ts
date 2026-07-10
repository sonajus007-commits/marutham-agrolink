/* File-selection validation for the <FileUpload> in @marutham/ui.
 *
 * Pure and DOM-free — it reads only { name, size, type }, never a browser
 * `File` — so it is testable without a filesystem and portable to a React
 * Native picker, whose asset objects carry the same three fields. The same
 * split as table.ts / calendar.ts. */

/** The metadata a validator needs; a DOM `File` already satisfies it. */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export type RejectReason = 'type' | 'size' | 'count' | 'duplicate';

export interface Rejection<F extends FileLike> {
  file: F;
  reason: RejectReason;
}

export interface ValidateOptions {
  /** HTML `accept` syntax: ".pdf,image/*,image/png". Empty accepts anything. */
  accept?: string;
  /** Per-file ceiling in bytes. */
  maxSize?: number;
  /** Cap on the total, existing selection included. */
  maxFiles?: number;
}

export interface ValidateResult<F extends FileLike> {
  accepted: F[];
  rejected: Rejection<F>[];
}

/** Human-readable size: "45 KB", "1.2 MB". Uses 1024 steps, as file managers do. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  // One decimal below 10 (1.2 MB), none above (12 MB) — the way sizes read.
  return (n < 10 ? n.toFixed(1) : Math.round(n).toString()) + ' ' + units[i];
}

/** The last `.ext` of a filename, lower-cased and dot-included; '' if none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Does a file satisfy an HTML `accept` string? A token is an extension
 * (`.pdf`), a wildcard MIME (`image/*`), or an exact MIME (`image/png`). An
 * empty or whitespace `accept` accepts everything, matching the attribute.
 */
export function matchesAccept(file: FileLike, accept?: string): boolean {
  const tokens = (accept ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;

  const type = file.type.toLowerCase();
  const ext = extensionOf(file.name);

  return tokens.some((token) => {
    if (token.startsWith('.')) return ext === token;
    if (token.endsWith('/*')) return !!type && type.startsWith(token.slice(0, -1)); // "image/"
    return type === token;
  });
}

/** Identity for de-duplication: two picks of the same file share name and size. */
export function fileKey(file: FileLike): string {
  return file.name + '::' + file.size;
}

/**
 * Split an incoming batch into what may be added and what may not, given the
 * current selection. Checks run type → size → duplicate → count so the reason
 * is the most specific and actionable one: a wrong-type file is reported as
 * such even when the selection is also full. De-duplicates within the batch as
 * well as against `existing`.
 */
export function validateFiles<F extends FileLike>(
  incoming: F[],
  existing: FileLike[],
  opts: ValidateOptions = {},
): ValidateResult<F> {
  const { accept, maxSize, maxFiles } = opts;
  const seen = new Set(existing.map(fileKey));
  const remaining = maxFiles == null ? Infinity : Math.max(0, maxFiles - existing.length);

  const accepted: F[] = [];
  const rejected: Rejection<F>[] = [];

  for (const file of incoming) {
    if (accept && !matchesAccept(file, accept)) {
      rejected.push({ file, reason: 'type' });
    } else if (maxSize != null && file.size > maxSize) {
      rejected.push({ file, reason: 'size' });
    } else if (seen.has(fileKey(file))) {
      rejected.push({ file, reason: 'duplicate' });
    } else if (accepted.length >= remaining) {
      rejected.push({ file, reason: 'count' });
    } else {
      accepted.push(file);
      seen.add(fileKey(file));
    }
  }

  return { accepted, rejected };
}
