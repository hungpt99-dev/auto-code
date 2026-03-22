import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const loadSettings = createAsyncThunk('settings/load', async () => {
  return await window.electronAPI.getSettings();
});

export const saveSettings = createAsyncThunk('settings/save', async (settings) => {
  await window.electronAPI.saveSettings(settings);
  return settings;
});

// ─── Slice ────────────────────────────────────────────────────────────────────

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    jiraUrl: '',
    jiraEmail: '',
    jiraToken: '',
    openaiKey: '',
    claudeKey: '',
    geminiKey: '',
    aiProvider: 'openai',
    aiModel: '',
    n8nUrl: 'http://localhost:5678',
    repoPath: '',
    repos: [],
    loaded: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.fulfilled, (state, action) => {
        const loaded = action.payload || {};
        // Migrate legacy single repoPath → repos array
        let repos = Array.isArray(loaded.repos) ? loaded.repos : [];
        if (repos.length === 0 && loaded.repoPath) {
          repos = [{ id: '1', name: 'Main Repo', path: loaded.repoPath }];
        }
        return { ...state, ...loaded, repos, loaded: true };
      })
      .addCase(loadSettings.rejected, (state) => ({
        ...state,
        loaded: true,
      }))
      .addCase(saveSettings.fulfilled, (state, action) => ({
        ...state,
        ...action.payload,
      }));
  },
});

export default settingsSlice.reducer;
