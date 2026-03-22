import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import KanbanBoard from './components/KanbanBoard';
import WorkflowsTab from './components/WorkflowsTab';
import HistoryTab from './components/HistoryTab';
import Settings from './components/Settings';
import ResultScreen from './components/ResultScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { loadSettings } from './store/settingsSlice';

export default function App() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(loadSettings());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <HashRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="kanban" element={<KanbanBoard />} />
            <Route path="workflows" element={<WorkflowsTab />} />
            <Route path="history" element={<HistoryTab />} />
            <Route path="settings" element={<Settings />} />
            <Route path="issue/:key/result" element={<ResultScreen />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </HashRouter>
  );
}
