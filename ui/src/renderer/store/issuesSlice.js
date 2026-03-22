import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchIssues = createAsyncThunk(
  'issues/fetchList',
  async (params, { rejectWithValue }) => {
    const result = await window.electronAPI.fetchJiraIssues(params);
    if (!result.success) return rejectWithValue(result.error);
    return result.data.issues;
  }
);

export const fetchIssueDetail = createAsyncThunk(
  'issues/fetchDetail',
  async (params, { rejectWithValue }) => {
    const result = await window.electronAPI.fetchJiraIssue(params);
    if (!result.success) return rejectWithValue(result.error);
    return result.data;
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const issuesSlice = createSlice({
  name: 'issues',
  initialState: {
    /** @type {Array} */
    list: [],
    /** @type {object|null} Full Jira issue object */
    selectedIssue: null,
    /** @type {object|null} AI-generated result { summary, files, patch } */
    generationResult: null,
    listLoading: false,
    detailLoading: false,
    error: null,
  },
  reducers: {
    setGenerationResult(state, action) {
      state.generationResult = action.payload;
    },
    clearGenerationResult(state) {
      state.generationResult = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Issue list ──
      .addCase(fetchIssues.pending, (state) => {
        state.listLoading = true;
        state.error = null;
      })
      .addCase(fetchIssues.fulfilled, (state, action) => {
        state.listLoading = false;
        state.list = action.payload;
      })
      .addCase(fetchIssues.rejected, (state, action) => {
        state.listLoading = false;
        state.error = action.payload || 'Failed to fetch issues';
      })
      // ── Issue detail ──
      .addCase(fetchIssueDetail.pending, (state) => {
        state.detailLoading = true;
        state.error = null;
      })
      .addCase(fetchIssueDetail.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.selectedIssue = action.payload;
      })
      .addCase(fetchIssueDetail.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload || 'Failed to fetch issue detail';
      });
  },
});

export const { setGenerationResult, clearGenerationResult, clearError } = issuesSlice.actions;
export default issuesSlice.reducer;
