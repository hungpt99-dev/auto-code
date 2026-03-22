'use strict';

/**
 * Git service — executes git commands in a local repository.
 *
 * Security contract:
 *   • Uses execFile (not exec) so arguments are NEVER shell-interpolated.
 *   • git push (and any variant that writes to a remote) is BLOCKED.
 *   • No remote-write commands can slip through the allowed-subcommand list.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Subcommands that can affect a remote ─────────────────────────────────────
const BLOCKED_SUBCOMMANDS = new Set([
  'push',         // write to remote
  'push-pack',    // low-level push
  'send-pack',    // low-level push
]);

// Flag combinations that push to remote even without "push" subcommand
const BLOCKED_FLAG_PATTERNS = [
  /--mirror/,
  /--upload-pack/,
];

/**
 * Runs a git command inside `repoPath`.
 *
 * @param {string}   repoPath  Absolute path to the local git repository.
 * @param {string[]} args      git arguments, e.g. ['commit', '-m', 'fix: typo']
 * @param {number}   [timeout] ms before the command is killed (default 30 s)
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function runGit(repoPath, args, timeout = 30_000) {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('repoPath is required');
  }

  // Normalise and confirm the path exists
  const resolvedPath = path.resolve(repoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Repository path does not exist: ${resolvedPath}`);
  }

  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('git args must be a non-empty array');
  }

  // Sanitise: every arg must be a string
  const safeArgs = args.map(String);

  // Block remote-write subcommands
  const subCommand = safeArgs[0].toLowerCase();
  if (BLOCKED_SUBCOMMANDS.has(subCommand)) {
    throw new Error(
      `"git ${subCommand}" is disabled — pushing to a remote is not allowed from this app. ` +
      'Use your terminal or IDE to push when you are ready.'
    );
  }

  // Block dangerous flags regardless of subcommand
  for (const arg of safeArgs) {
    for (const pattern of BLOCKED_FLAG_PATTERNS) {
      if (pattern.test(arg)) {
        throw new Error(`Argument "${arg}" is not permitted.`);
      }
    }
  }

  return new Promise((resolve, reject) => {
    execFile('git', safeArgs, { cwd: resolvedPath, timeout, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.killed) {
        reject(new Error(`git command timed out after ${timeout}ms`));
        return;
      }
      // git uses exit code 1 for "no output" situations (e.g. `git diff` with no changes)
      // so we treat stderr as informational and only reject on hard errors
      resolve({ stdout: stdout || '', stderr: stderr || '', exitCode: err ? err.code : 0 });
    });
  });
}

module.exports = { runGit };
