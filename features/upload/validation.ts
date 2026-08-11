/**
 * Client-side upload validation rules.
 *
 * These mirror the Supabase Storage bucket configuration (25 MiB limit,
 * restricted MIME types) so users get immediate, friendly feedback instead
 * of raw Storage errors. The bucket and RLS policies remain the actual
 * enforcement layer.
 */

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".docx",
  ".txt",
] as const;

/** Value for the file input `accept` attribute (convenience only; not relied on for validation). */
export const FILE_INPUT_ACCEPT = [...ALLOWED_EXTENSIONS, ...ALLOWED_MIME_TYPES].join(",");

const ALLOWED_MIME_TYPE_SET = new Set<string>(ALLOWED_MIME_TYPES);
const ALLOWED_EXTENSION_SET = new Set<string>(ALLOWED_EXTENSIONS);

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return "";
  return fileName.slice(lastDot).toLowerCase();
}

/**
 * Validates a candidate file before upload.
 * Returns a safe, user-facing error message, or `null` when the file is valid.
 */
export function validateFile(file: File): string | null {
  if (file.size === 0) {
    return "This file is empty. Please choose a file with content.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "This file is larger than the 25 MB limit. Please choose a smaller file.";
  }

  const extension = getExtension(file.name);
  if (!ALLOWED_EXTENSION_SET.has(extension)) {
    return "This file type isn't supported. Allowed types: PDF, JPG, PNG, WebP, DOCX, and TXT.";
  }

  if (!ALLOWED_MIME_TYPE_SET.has(file.type)) {
    return "This file type isn't supported. Allowed types: PDF, JPG, PNG, WebP, DOCX, and TXT.";
  }

  return null;
}

/**
 * Produces a filename that is safe to embed in a Storage object path.
 *
 * - keeps only the final path segment (strips directories)
 * - removes control characters and characters unsafe in object keys
 * - collapses dot runs so "../" style sequences cannot survive
 * - trims leading dots/spaces so the name cannot start a hidden/relative path
 * - preserves the (lowercased) extension and caps overall length
 */
export function sanitizeFileName(originalName: string): string {
  const lastSegment = originalName.split(/[/\\]/).pop() ?? "";

  const cleaned = lastSegment
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*#%{}^~[\]`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/^[. ]+/, "")
    .trim();

  const lastDot = cleaned.lastIndexOf(".");
  const hasExtension = lastDot > 0;
  const extension = hasExtension ? cleaned.slice(lastDot).toLowerCase() : "";
  let stem = hasExtension ? cleaned.slice(0, lastDot) : cleaned;

  stem = stem.slice(0, 120).trim();
  if (stem.length === 0) {
    stem = "document";
  }

  return `${stem}${extension}`;
}
