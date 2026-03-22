import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

/**
 * Run any local git command.
 * args: string[] — e.g. ['status'], ['commit', '-m', 'fix: order api'], ['log', '--oneline', '-20']
 */
export const runGitCommand = createAsyncThunk(
  'git/run',
  async ({ repoPath, args }, { rejectWithValue }) => {
    if (!repoPath) return rejectWithValue('No repository path configured. Set it in Settings.');
    const result = await window.electronAPI.gitRun({ repoPath, args });
    if (!result.success) return rejectWithValue(result.error);
    return { args, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }
);

const gitSlice = createSlice({
  name: 'git',
  initialState: {
    /** Array of { id, args, stdout, stderr, exitCode, timestamp } */
    history: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearHistory(state) {
      state.history = [];
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runGitCommand.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(runGitCommand.fulfilled, (state, action) => {
        state.loading = false;
        state.history.unshift({
          id: Date.now(),
          args: action.payload.args,
          stdout: action.payload.stdout,
          stderr: action.payload.stderr,
          exitCode: action.payload.exitCode,
          timestamp: new Date().toLocaleTimeString(),
        });
      })
      .addCase(runGitCommand.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Git command failed';
        // Also push error into history for visibility
        state.history.unshift({
          id: Date.now(),
          args: action.meta.arg?.args ?? [],
          stdout: '',
          stderr: action.payload || 'Unknown error',
          exitCode: 1,
          timestamp: new Date().toLocaleTimeString(),
        });
      });
  },
});

export const { clearHistory, clearError } = gitSlice.actions;
export default gitSlice.reducer;
