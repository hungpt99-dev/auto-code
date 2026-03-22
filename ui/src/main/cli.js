'use strict';

/**
 * CLI runner — executes whitelisted external CLI tools.
 *
 * Security:
 *   • Uses execFile (never shell exec) so args are never interpolated.
 *   • Tool whitelist is hard-coded; callers cannot override it.
 */

const { execFile } = require('child_process');

const ALLOWED_TOOLS = new Set(['gh']);

/**
 * @param {string}   tool     CLI binary name, e.g. 'gh'
 * @param {string[]} args     Array of arguments
 * @param {object}   [opts]
 * @param {string}   [opts.cwd]       Working directory
 * @param {number}   [opts.timeout]   ms before kill (default 60 s)
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
 */
async function runCli(tool, args = [], { cwd, timeout = 60_000 } = {}) {
  if (!ALLOWED_TOOLS.has(tool)) {
    throw new Error(
      `CLI tool "${tool}" is not allowed. Allowed: ${[...ALLOWED_TOOLS].join(', ')}`
    );
  }

  const safeArgs = args.map(String);

  return new Promise((resolve) => {
    execFile(
      tool,
      safeArgs,
      { cwd, timeout, maxBuffer: 5 * 1024 * 1024, env: { ...process.env } },
      (err, stdout, stderr) => {
        resolve({
          stdout:   stdout   || '',
          stderr:   stderr   || '',
          exitCode: err ? (err.code  ?? 1)       : 0,
          timedOut: err ? (err.killed ?? false)   : false,
        });
      }
    );
  });
}

module.exports = { runCli };
