import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud, File as FileIcon, X, Check, AlertCircle } from 'lucide-react';
import {
  formatBytes, validateFiles, type Rejection, type FileLike,
} from '@marutham/lib';
import { cn } from './lib/cn';
import { ProgressBar } from './ProgressBar';

/* A drag-and-drop + browse file picker.
 *
 * The validation — accept-matching, size and count caps, de-duplication — lives
 * in @marutham/lib/upload, pure and unit-tested, the same split as <Table> and
 * <DatePicker>. This file is the drop zone, the native input, the file list and
 * the ARIA.
 *
 * It reports *selection*, not upload. The component picks and validates files;
 * the caller uploads them and feeds progress and errors back through each item's
 * `status` / `progress` / `error`. Keeping the transport out means one picker
 * serves base64 listing photos, multipart documents and anything later, without
 * knowing how any of them reach the server.
 *
 * Not <ImagePicker> (apps/web): that one downscales to base64 data-URIs in three
 * fixed slots and is image-only. This is the general primitive. */

export interface UploadItem {
  /** Stable identity for the list key and for the caller to correlate uploads. */
  id: string;
  file: File;
  status?: 'pending' | 'uploading' | 'done' | 'error';
  /** 0–100 while `uploading`; drives the per-file ProgressBar. */
  progress?: number;
  /** Shown under the row when `status` is 'error'. */
  error?: string;
}

export interface FileUploadProps {
  value: UploadItem[];
  onChange: (items: UploadItem[]) => void;
  /** HTML accept syntax: ".pdf,image/*". Also filters the OS file dialog. */
  accept?: string;
  /** Per-file byte ceiling. */
  maxSize?: number;
  /** Cap on the total selection. Omit for unlimited. */
  maxFiles?: number;
  /** Allow choosing more than one file at a time. Default true. */
  multiple?: boolean;
  disabled?: boolean;
  /** Called with the files a drop or pick turned away, and why. */
  onReject?: (rejections: Rejection<File>[]) => void;
  /** Prompt inside the drop zone. */
  label?: ReactNode;
  /** A line under the prompt — e.g. "PNG or JPG, up to 2 MB". */
  hint?: ReactNode;
  className?: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : // No dash: `pnpm ui:classes` reads any dashed string literal here as a class.
      'file' + Math.random().toString(36).slice(2);

export function FileUpload({
  value,
  onChange,
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  disabled = false,
  onReject,
  label = 'Drag files here, or browse',
  hint,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();

  const atCapacity = maxFiles != null && value.length >= maxFiles;
  const blocked = disabled || atCapacity;

  const add = (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const incoming = Array.from(fileList);
    const existing: FileLike[] = value.map((it) => it.file);
    // In single mode a new pick replaces; validate against an empty selection.
    const { accepted, rejected } = validateFiles(incoming, multiple ? existing : [], {
      accept,
      maxSize,
      maxFiles: multiple ? maxFiles : 1,
    });

    if (rejected.length) onReject?.(rejected);
    if (!accepted.length) return;

    const items: UploadItem[] = accepted.map((file) => ({ id: newId(), file, status: 'pending' }));
    onChange(multiple ? [...value, ...items] : items.slice(0, 1));
  };

  const remove = (id: string) => onChange(value.filter((it) => it.id !== id));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (blocked) return;
    add(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!blocked) setDragging(true);
  };

  return (
    <div className={className}>
      {/* The zone is a button so keyboard and screen-reader users reach the same
          file dialog a click opens; the real <input> is visually hidden. */}
      <button
        type="button"
        disabled={blocked}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'flex w-full cursor-pointer appearance-none flex-col items-center gap-2 rounded-md px-4 py-6',
          'border-2 border-dashed border-border-strong bg-surface text-center',
          'transition-colors duration-[var(--duration-fast)] ease-standard',
          'hover:border-primary hover:bg-surface-muted',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
          'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border-strong disabled:hover:bg-surface',
          dragging && 'border-primary bg-accent-bg',
        )}
      >
        <UploadCloud size={24} aria-hidden="true" className="text-fg-muted" />
        <span className="font-sans text-sm font-bold text-fg">
          {atCapacity ? 'File limit reached' : label}
        </span>
        {hint ? (
          <span id={hintId} className="font-sans text-xs text-fg-muted">
            {hint}
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={blocked}
        className="sr-only"
        // Clear after each pick so choosing the same file twice still fires change.
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />

      {value.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {value.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-sm border border-border-subtle bg-surface px-3 py-2"
            >
              <FileIcon size={18} aria-hidden="true" className="shrink-0 text-fg-muted" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-sans text-sm text-fg" title={it.file.name}>
                    {it.file.name}
                  </span>
                  <span className="shrink-0 font-sans text-2xs tabular-nums text-fg-muted">
                    {formatBytes(it.file.size)}
                  </span>
                </div>

                {it.status === 'uploading' ? (
                  <div className="mt-1.5">
                    <ProgressBar
                      value={it.progress ?? 0}
                      label={'Uploading ' + it.file.name}
                      size="sm"
                    />
                  </div>
                ) : null}

                {it.status === 'error' && it.error ? (
                  <p className="mt-0.5 flex items-center gap-1 font-sans text-2xs text-danger">
                    <AlertCircle size={12} aria-hidden="true" />
                    {it.error}
                  </p>
                ) : null}
              </div>

              {it.status === 'done' ? (
                <Check size={16} aria-label="Uploaded" className="shrink-0 text-success" />
              ) : (
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  aria-label={'Remove ' + it.file.name}
                  className={cn(
                    'inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center',
                    'rounded-xs border-0 bg-transparent p-1 text-fg-muted',
                    'hover:bg-surface-muted hover:text-danger',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf',
                  )}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
