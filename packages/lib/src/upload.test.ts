import { describe, it, expect } from 'vitest';
import { formatBytes, matchesAccept, fileKey, validateFiles, type FileLike } from './upload';

const f = (name: string, size: number, type: string): FileLike => ({ name, size, type });

describe('formatBytes', () => {
  it('scales through the units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
  it('drops the decimal above 10', () => {
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes(1024 * 1024 * 1.2)).toBe('1.2 MB');
  });
  it('guards against nonsense', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('matchesAccept', () => {
  it('accepts everything when empty', () => {
    expect(matchesAccept(f('a.exe', 1, 'application/octet-stream'), '')).toBe(true);
    expect(matchesAccept(f('a.exe', 1, ''), undefined)).toBe(true);
  });
  it('matches an extension case-insensitively', () => {
    expect(matchesAccept(f('report.PDF', 1, ''), '.pdf')).toBe(true);
    expect(matchesAccept(f('report.pdf', 1, ''), '.pdf,.doc')).toBe(true);
    expect(matchesAccept(f('report.png', 1, 'image/png'), '.pdf')).toBe(false);
  });
  it('matches a wildcard MIME', () => {
    expect(matchesAccept(f('p.png', 1, 'image/png'), 'image/*')).toBe(true);
    expect(matchesAccept(f('p.pdf', 1, 'application/pdf'), 'image/*')).toBe(false);
  });
  it('matches an exact MIME', () => {
    expect(matchesAccept(f('p.png', 1, 'image/png'), 'image/png')).toBe(true);
    expect(matchesAccept(f('p.gif', 1, 'image/gif'), 'image/png')).toBe(false);
  });
  it('accepts if any token matches', () => {
    expect(matchesAccept(f('p.png', 1, 'image/png'), '.pdf,image/*')).toBe(true);
  });
  it('does not let a wildcard match an empty type', () => {
    // A file with no MIME type must not slip through image/*.
    expect(matchesAccept(f('mystery', 1, ''), 'image/*')).toBe(false);
  });
});

describe('validateFiles', () => {
  it('accepts everything within an empty spec', () => {
    const r = validateFiles([f('a.png', 10, 'image/png'), f('b.pdf', 20, 'application/pdf')], []);
    expect(r.accepted).toHaveLength(2);
    expect(r.rejected).toHaveLength(0);
  });

  it('rejects the wrong type', () => {
    const r = validateFiles([f('a.exe', 10, 'application/x-msdownload')], [], {
      accept: 'image/*',
    });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]).toMatchObject({ reason: 'type' });
  });

  it('rejects oversize files', () => {
    const r = validateFiles([f('big.png', 5_000, 'image/png')], [], { maxSize: 1_000 });
    expect(r.rejected[0]).toMatchObject({ reason: 'size' });
    // On the boundary is fine.
    expect(
      validateFiles([f('ok.png', 1_000, 'image/png')], [], { maxSize: 1_000 }).accepted,
    ).toHaveLength(1);
  });

  it('caps the total against the existing selection', () => {
    const existing = [f('a.png', 1, 'image/png')];
    const r = validateFiles([f('b.png', 2, 'image/png'), f('c.png', 3, 'image/png')], existing, {
      maxFiles: 2,
    });
    expect(r.accepted).toHaveLength(1); // one slot left
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ reason: 'count' });
  });

  it('de-duplicates against existing and within the batch', () => {
    const existing = [f('a.png', 100, 'image/png')];
    const r = validateFiles(
      [f('a.png', 100, 'image/png'), f('b.png', 200, 'image/png'), f('b.png', 200, 'image/png')],
      existing,
    );
    expect(r.accepted.map((x) => x.name)).toEqual(['b.png']);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected.every((x) => x.reason === 'duplicate')).toBe(true);
  });

  it('reports the most specific reason first (type before count)', () => {
    // Selection already full AND the file is the wrong type — say "type".
    const existing = [f('a.png', 1, 'image/png')];
    const r = validateFiles([f('x.exe', 1, 'application/x-msdownload')], existing, {
      accept: 'image/*',
      maxFiles: 1,
    });
    expect(r.rejected[0]).toMatchObject({ reason: 'type' });
  });

  it('treats maxFiles already met as zero slots', () => {
    const existing = [f('a.png', 1, 'image/png'), f('b.png', 2, 'image/png')];
    const r = validateFiles([f('c.png', 3, 'image/png')], existing, { maxFiles: 2 });
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0]).toMatchObject({ reason: 'count' });
  });
});

describe('fileKey', () => {
  it('is name + size', () => {
    expect(fileKey(f('a.png', 100, 'image/png'))).toBe('a.png::100');
    expect(fileKey(f('a.png', 101, 'image/png'))).not.toBe(fileKey(f('a.png', 100, 'image/png')));
  });
});
