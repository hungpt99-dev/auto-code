import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TaskDetail from './components/TaskDetail';
import ResultScreen from './components/ResultScreen';
import Settings from './components/Settings';
import GitPanel from './components/GitPanel';
import AiPanel from './components/AiPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { loadSettings } from './store/settingsSlice';

export default function App() {
  const dispatch = useDispatch();

  // Load persisted settings from electron-store on startup
  useEffect(() => {
    dispatch(loadSettings());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="issue/:key" element={<TaskDetail />} />
            <Route path="issue/:key/result" element={<ResultScreen />} />
            <Route path="git" element={<GitPanel />} />
            <Route path="ai" element={<AiPanel />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </HashRouter>
  );
}
