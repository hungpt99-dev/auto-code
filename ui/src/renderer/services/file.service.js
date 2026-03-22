/**
 * File service — handles ZIP generation and PATCH saving via the
 * Electron main process (which opens native Save dialogs).
 */
import JSZip from 'jszip';

/**
 * Bundles all generated files into a ZIP archive and triggers a native Save dialog.
 *
 * @param {Array<{name: string, content: string}>} files
 * @param {string} issueKey  Used for the default file name
 * @returns {Promise<{success: boolean, filePath?: string, cancelled?: boolean}>}
 */
export async function downloadZip(files, issueKey) {
  const zip = new JSZip();

  for (const { name, content } of files) {
    // Preserve sub-directories (e.g. "src/main/OrderController.java")
    zip.file(name, content);
  }

  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  // Uint8Array → plain Array so it can be serialised over IPC (structuredClone)
  const zipBuffer = Array.from(new Uint8Array(arrayBuffer));

  return window.electronAPI.saveZip({
    zipBuffer,
    defaultName: `${issueKey}-generated-code.zip`,
  });
}

/**
 * Saves the unified diff string to a .diff file via a native Save dialog.
 *
 * @param {string} patch   Unified diff content
 * @param {string} issueKey
 * @returns {Promise<{success: boolean, filePath?: string, cancelled?: boolean}>}
 */
export async function downloadPatch(patch, issueKey) {
  return window.electronAPI.savePatch({
    content: patch,
    defaultName: `${issueKey}.diff`,
  });
}
