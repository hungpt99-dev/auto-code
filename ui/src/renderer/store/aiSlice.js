import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { GENERATION_STEPS, STEP_TIMINGS_MS } from '../constants/aiProviders';
import { setGenerationResult } from './issuesSlice';

// ─── Thunk: full code generation via n8n ─────────────────────────────────────

export const startGeneration = createAsyncThunk(
  'ai/startGeneration',
  async ({ issueKey, settings, language = 'javascript' }, { dispatch, rejectWithValue }) => {
    // Simulate step-by-step progress while the real n8n call is in-flight.
    // Each timer fires at the cumulative delay defined in STEP_TIMINGS_MS.
    const timers = STEP_TIMINGS_MS.slice(0, GENERATION_STEPS.length - 1).map((delay, idx) =>
      setTimeout(() => dispatch(aiSlice.actions._tickStep(idx)), delay)
    );

    const clearAll = () => timers.forEach(clearTimeout);

    try {
      const response = await axios.post(
        `${settings.n8nUrl}/webhook/generate`,
        {
          issueKey,
          jiraUrl:    settings.jiraUrl,
          jiraEmail:  settings.jiraEmail,
          jiraToken:  settings.jiraToken,
          // ── Multi-provider fields ────────────────────────────────────────
          provider:   settings.aiProvider  || 'openai',
          model:      settings.aiModel     || null,
          openaiKey:  settings.openaiKey   || '',
          claudeKey:  settings.claudeKey   || '',
          geminiKey:  settings.geminiKey   || '',
          language,
        },
        { timeout: 180_000, headers: { 'Content-Type': 'application/json' } }
      );

      const raw    = response.data;
      const result = Array.isArray(raw) ? raw[0] : raw;

      if (!result || typeof result !== 'object') {
        throw new Error('Unexpected response format from n8n');
      }

      const payload = {
        summary: result.summary ?? '',
        files:   Array.isArray(result.files) ? result.files : [],
        patch:   result.patch ?? '',
      };

      clearAll();
      dispatch(aiSlice.actions._allStepsDone());
      dispatch(setGenerationResult(payload));
      return payload;
    } catch (err) {
      clearAll();
      const message =
        err.response?.data?.message ||
        err.message ||
        'Code generation failed. Is n8n running and the workflow active?';
      return rejectWithValue(message);
    }
  }
);

// ─── Thunk: quick AI ask — direct API call (no n8n overhead) ─────────────────

export const quickAsk = createAsyncThunk(
  'ai/quickAsk',
  async ({ question, provider, model, openaiKey, claudeKey, geminiKey }, { rejectWithValue }) => {
    const result = await window.electronAPI.aiQuickAsk({
      question, provider, model, openaiKey, claudeKey, geminiKey,
    });
    if (!result.success) return rejectWithValue(result.error);
    return result.answer;
  }
);

// ─── Thunk: GitHub Copilot CLI ────────────────────────────────────────────────

export const runCopilotCli = createAsyncThunk(
  'ai/copilotCli',
  async ({ subcommand, prompt, type }, { rejectWithValue }) => {
    const result = await window.electronAPI.cliRun({
      tool: 'gh',
      args: ['copilot', subcommand, ...(type ? ['-t', type] : []), prompt].filter(Boolean),
    });
    if (result.timedOut) return rejectWithValue('Command timed out');
    return result;
  }
);

// ─── Slice ────────────────────────────────────────────────────────────────────

const IDLE = {
  // Code generation state
  generating:     false,
  completedSteps: [],   // indices of GENERATION_STEPS that have "ticked"
  genError:       null,
  // Quick-ask state
  asking:         false,
  answer:         null,
  askError:       null,
  // Copilot CLI state
  cliRunning:     false,
  cliHistory:     [],  // [{ id, args, stdout, stderr, exitCode, timestamp }]
  cliError:       null,
};

const aiSlice = createSlice({
  name: 'ai',
  initialState: IDLE,
  reducers: {
    resetGeneration(state) {
      state.generating     = false;
      state.completedSteps = [];
      state.genError       = null;
    },
    clearAnswer(state) {
      state.answer   = null;
      state.askError = null;
    },
    clearCli(state) {
      state.cliHistory = [];
      state.cliError   = null;
    },
    // Internal — called by the step timers
    _tickStep(state, { payload: idx }) {
      if (!state.completedSteps.includes(idx)) state.completedSteps.push(idx);
    },
    _allStepsDone(state) {
      state.completedSteps = GENERATION_STEPS.map((_, i) => i);
    },
  },
  extraReducers: (builder) => {
    builder
      // ── startGeneration ──────────────────────────────────────────────────
      .addCase(startGeneration.pending, (state) => {
        state.generating     = true;
        state.completedSteps = [];
        state.genError       = null;
      })
      .addCase(startGeneration.fulfilled, (state) => { state.generating = false; })
      .addCase(startGeneration.rejected,  (state, { payload }) => {
        state.generating = false;
        state.genError   = payload;
      })
      // ── quickAsk ─────────────────────────────────────────────────────────
      .addCase(quickAsk.pending,    (state) => { state.asking = true;  state.askError = null; state.answer = null; })
      .addCase(quickAsk.fulfilled,  (state, { payload }) => { state.asking = false; state.answer = payload; })
      .addCase(quickAsk.rejected,   (state, { payload }) => { state.asking = false; state.askError = payload; })
      // ── runCopilotCli ────────────────────────────────────────────────────
      .addCase(runCopilotCli.pending,   (state) => { state.cliRunning = true; state.cliError = null; })
      .addCase(runCopilotCli.fulfilled, (state, { payload, meta }) => {
        state.cliRunning = false;
        state.cliHistory.unshift({
          id:        Date.now(),
          args:      meta.arg,
          stdout:    payload.stdout,
          stderr:    payload.stderr,
          exitCode:  payload.exitCode,
          timestamp: new Date().toLocaleTimeString(),
        });
      })
      .addCase(runCopilotCli.rejected, (state, { payload }) => {
        state.cliRunning = false;
        state.cliError   = payload;
      });
  },
});

export const { resetGeneration, clearAnswer, clearCli } = aiSlice.actions;

// Internal actions exported only so the thunk can dispatch them
export const _aiSliceInternals = aiSlice.actions;

export default aiSlice.reducer;
