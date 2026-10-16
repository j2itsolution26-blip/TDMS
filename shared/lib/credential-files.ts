/**
 * Soft copies of a student's credentials — the rules shared by the server,
 * which enforces them (storage.checkUpload with these types), and the upload
 * dialog, which checks the same before sending anything.
 *
 * Scans and photos of documents: PDF, JPG/JPEG or PNG, at most
 * CREDENTIAL_UPLOAD_MAX_BYTES, the content matching the extension. An upload
 * never verifies anything: it is Pending Review until a verifier verifies or
 * rejects it.
 */

export const CREDENTIAL_UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const CREDENTIAL_UPLOAD_ACCEPT = Object.keys(CREDENTIAL_UPLOAD_TYPES).map((e) => `.${e}`).join(',');
export const CREDENTIAL_UPLOAD_LABEL = 'PDF, JPG or PNG';
/**
 * The size limit, in one place (server check, dialog check, the page's wording).
 * Uploads pass through the API, and Vercel refuses a function request body
 * over about 4.5 MB — so 4 MB is the most this route can take there. A larger
 * limit needs direct-to-storage uploads first.
 */
export const CREDENTIAL_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const CREDENTIAL_UPLOAD_MAX_LABEL = `${CREDENTIAL_UPLOAD_MAX_BYTES / (1024 * 1024)} MB`;

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** The browser's pre-check — the server checks again, and the content too. */
export function precheckCredentialFile(file: { name: string; size: number }): string | null {
  if (!CREDENTIAL_UPLOAD_TYPES[extOf(file.name)]) return `Upload a ${CREDENTIAL_UPLOAD_LABEL} file.`;
  if (file.size === 0) return 'The file is empty.';
  if (file.size > CREDENTIAL_UPLOAD_MAX_BYTES) return `The file is larger than ${CREDENTIAL_UPLOAD_MAX_LABEL}.`;
  return null;
}

export function isPreviewable(type: string | null | undefined): boolean {
  return Boolean(type && (type === 'application/pdf' || type.startsWith('image/')));
}

/**
 * What to call a credential's file: the name it was uploaded with, or — for a
 * file from before names were kept (or carried over from an application) —
 * the requirement and version, with the stored file's extension.
 */
export function credentialFileLabel(c: { fileName: string | null; filePath: string | null; requirementName: string; version: number }): string | null {
  if (!c.filePath) return null;
  if (c.fileName) return c.fileName;
  const ext = extOf(c.filePath);
  return `${c.requirementName} (v${c.version})${ext ? `.${ext}` : ''}`;
}

/** A short name for a stored type: PDF, JPG, PNG. */
export function fileTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  if (type === 'application/pdf') return 'PDF';
  if (type === 'image/jpeg') return 'JPG';
  if (type === 'image/png') return 'PNG';
  return type.split('/').pop()!.toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
