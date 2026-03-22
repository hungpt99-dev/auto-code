import { configureStore } from '@reduxjs/toolkit';
import issuesReducer from './issuesSlice';
import settingsReducer from './settingsSlice';
import gitReducer from './gitSlice';
import aiReducer from './aiSlice';

export const store = configureStore({
  reducer: {
    issues: issuesReducer,
    settings: settingsReducer,
    git: gitReducer,
    ai: aiReducer,
  },
});
