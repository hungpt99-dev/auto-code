/**
 * fileContext.service.js
 *
 * Reads real source files from local repositories via Electron IPC and
 * returns a structured context object suitable for passing to the AI.
 *
 * Architecture note:
 *   - All filesystem access happens in the main process (workfolder:readContext).
 *   - This service is a thin renderer-side wrapper that calls the IPC bridge.
 *   - No direct Node.js fs usage here — only window.electronAPI calls.
 */

/**
 * Context shape returned per repository.
 * @typedef {{ controllers: string, services: string, entities: string, configs: string }} RepoContext
 */

/**
 * Read categorised source files from a single local repo.
 *
 * Files are bucketed by filename/path patterns:
 *  - controllers: Controller | Handler | Router | Resource | Endpoint
 *  - services:    Service | UseCase | Business | Manager | Facade
 *  - entities:    Entity | Model | Domain | Schema | DTO | Types
 *  - configs:     Config | Configuration | Properties | application.yml/json | Setup
 *
 * Content is capped at maxChars total (default 20 000 chars, ~5 000 tokens).
 *
 * @param {string} repoPath       Absolute path to the repository root
 * @param {{ maxChars?: number }} [opts]
 * @returns {Promise<RepoContext | null>}  null if IPC unavailable or call failed
 */
export async function readRepoContext(repoPath, opts = {}) {
  if (!repoPath || typeof window === 'undefined' || !window.electronAPI?.readRepoContext) {
    return null;
  }
  try {
    const res = await window.electronAPI.readRepoContext(repoPath, opts);
    if (!res?.success) return null;
    return res.context ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a merged context object from multiple repositories.
 *
 * Each category is concatenated across all repos.  The total length of each
 * category is bounded by perRepoCategoryMax (default 16 000 chars).
 *
 * @param {string[]} repoPaths     Array of absolute repo paths
 * @param {{ maxCharsPerRepo?: number }} [opts]
 * @returns {Promise<RepoContext>}  Always resolves (returns empty strings on failure)
 */
export async function buildMultiRepoContext(repoPaths, opts = {}) {
  const { maxCharsPerRepo = 16000 } = opts;
  const merged = { controllers: '', services: '', entities: '', configs: '' };

  for (const rp of repoPaths) {
    const ctx = await readRepoContext(rp, { maxChars: maxCharsPerRepo });
    if (!ctx) continue;
    for (const cat of Object.keys(merged)) {
      if (ctx[cat]) merged[cat] += ctx[cat];
    }
  }

  return merged;
}

/**
 * Returns true if there is at least some useful context (any category non-empty).
 * @param {RepoContext} ctx
 */
export function hasContext(ctx) {
  return ctx && Object.values(ctx).some((v) => typeof v === 'string' && v.trim().length > 0);
}
