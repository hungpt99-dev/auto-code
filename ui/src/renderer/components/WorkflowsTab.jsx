import { useState, useCallback, useRef } from 'react';
import { useAppStore, STEP_TYPES, STEP_TYPE_MAP } from '../store/appStore';
import { TASK_TYPES } from '../constants/taskTypes';

const TASK_TYPE_MAP_LOCAL = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t]));

// â”€â”€â”€ Step Config form per type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StepConfigFields({ type, config, onChange }) {
  switch (type) {
    case 'AI_ANALYZE':
    case 'AI_GENERATE':
      return (
        <>
          <label className="form-label">Prompt template</label>
          <textarea
            className="form-textarea"
            value={config.promptTemplate || ''}
            rows={3}
            onChange={(e) => onChange({ ...config, promptTemplate: e.target.value })}
            placeholder="Describe what the AI should do in this stepâ€¦"
          />
          <label className="form-label" style={{ marginTop: 8 }}>Max tokens</label>
          <input
            type="number"
            className="form-input"
            value={config.maxTokens || 4096}
            min={256}
            max={16384}
            onChange={(e) => onChange({ ...config, maxTokens: Number(e.target.value) })}
          />
        </>
      );
    case 'GIT_COMMIT':
      return (
        <>
          <label className="form-label">Commit message template</label>
          <input
            className="form-input"
            value={config.message || 'feat: {{issueKey}} - {{summary}}'}
            onChange={(e) => onChange({ ...config, message: e.target.value })}
            placeholder="Use {{issueKey}} and {{summary}} as placeholders"
          />
        </>
      );
    case 'CUSTOM':
      return (
        <>
          <label className="form-label">Endpoint URL</label>
          <input
            className="form-input"
            value={config.url || ''}
            onChange={(e) => onChange({ ...config, url: e.target.value })}
            placeholder="https://api.example.com/endpoint"
          />
          <label className="form-label" style={{ marginTop: 8 }}>HTTP method</label>
          <select
            className="form-select"
            value={config.method || 'POST'}
            onChange={(e) => onChange({ ...config, method: e.target.value })}
          >
            {['POST', 'GET', 'PUT', 'PATCH'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </>
      );
    case 'APPLY_PATCH':
    case 'GIT_STATUS':
    case 'FETCH_JIRA':
    default:
      return <p className="wf-config-note">No additional configuration required for this step type.</p>;
  }
}

// â”€â”€â”€ Step card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StepCard({ step, index, total, onEdit, onDelete, onMove, isDragging, onDragStart, onDragOver, onDragEnd, onDrop }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STEP_TYPE_MAP[step.type] || STEP_TYPE_MAP['CUSTOM'];

  return (
    <div
      className={`wf-step-card${step.editable === false ? ' wf-step-card--locked' : ''}${isDragging ? ' wf-step-card--dragging' : ''}`}
      draggable={step.editable !== false}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
    >
      <div className="wf-step-header">
        <div className="wf-step-left">
          {step.editable !== false && <span className="wf-step-drag-handle" title="Drag to reorder">â ¿</span>}
          <span className="wf-step-num">{index + 1}</span>
          <span className="wf-step-type-dot" style={{ background: meta?.color || '#6366f1' }} title={meta?.label} />
          <span className="wf-step-label">{step.label || meta?.label}</span>
          <span className="wf-step-type-chip" style={{ color: meta?.color, borderColor: (meta?.color || '#6366f1') + '44' }}>
            {meta?.icon} {meta?.label}
          </span>
          {step.editable === false && <span className="wf-step-lock-badge">locked</span>}
        </div>
        <div className="wf-step-actions">
          {index > 0 && (
            <button className="icon-btn" title="Move up" onClick={() => onMove(step.id, 'up')}>â†‘</button>
          )}
          {index < total - 1 && (
            <button className="icon-btn" title="Move down" onClick={() => onMove(step.id, 'down')}>â†“</button>
          )}
          {step.editable !== false && (
            <>
              <button className="icon-btn" title={expanded ? 'Collapse' : 'Configure'} onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'â–´' : 'âœŽ'}
              </button>
              <button className="icon-btn icon-btn--danger" title="Delete step" onClick={() => onDelete(step.id)}>âœ•</button>
            </>
          )}
        </div>
      </div>

      {expanded && step.editable !== false && (
        <div className="wf-step-config">
          <div className="wf-step-config-row">
            <div style={{ flex: 1 }}>
              <label className="form-label">Step name</label>
              <input
                className="form-input"
                value={step.label}
                onChange={(e) => onEdit(step.id, { label: e.target.value })}
                placeholder="Step nameâ€¦"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Step type</label>
              <select
                className="form-select"
                value={step.type}
                onChange={(e) => onEdit(step.id, { type: e.target.value, config: {} })}
              >
                {STEP_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="wf-step-config-fields" style={{ marginTop: 10 }}>
            <StepConfigFields
              type={step.type}
              config={step.config || {}}
              onChange={(cfg) => onEdit(step.id, { config: cfg })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Workflow card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WorkflowCard({ workflow, selected, onToggleActive, onDelete, onSelect }) {
  const tt = TASK_TYPE_MAP_LOCAL[workflow.taskType];
  return (
    <div
      className={`wf-card${selected ? ' wf-card--selected' : ''}${!workflow.active ? ' wf-card--inactive' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <div className="wf-card-top">
        <div className="wf-card-icon" style={{ background: (tt?.color ?? '#6366f1') + '22', color: tt?.color ?? '#6366f1' }}>
          {tt?.icon ?? 'â¬¡'}
        </div>
        <div className="wf-card-info">
          <div className="wf-card-name">{workflow.name}</div>
          <div className="wf-card-meta">{workflow.steps.length} steps Â· {tt?.label ?? workflow.taskType}</div>
        </div>
        <div className="wf-card-controls" onClick={(e) => e.stopPropagation()}>
          <label className="toggle-switch" title={workflow.active ? 'Deactivate' : 'Activate'}>
            <input type="checkbox" checked={workflow.active} onChange={(e) => onToggleActive(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
          <button className="icon-btn icon-btn--danger" title="Delete workflow" onClick={() => onDelete(workflow.id)}>ðŸ—‘</button>
        </div>
      </div>
      {workflow.description && (
        <div className="wf-card-desc">{workflow.description}</div>
      )}
      <div className="wf-card-steps-preview">
        {workflow.steps.slice(0, 4).map((s) => {
          const m = STEP_TYPE_MAP[s.type] || {};
          return (
            <span key={s.id} className="wf-step-chip" style={{ borderColor: (m.color || '#6366f1') + '55', color: m.color || '#a5b4fc' }}>
              {m.icon} {s.label}
            </span>
          );
        })}
        {workflow.steps.length > 4 && (
          <span className="wf-step-chip wf-step-chip--more">+{workflow.steps.length - 4} more</span>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Add workflow modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AddModal({ onClose, onAdd }) {
  const [name,     setName]     = useState('');
  const [taskType, setTaskType] = useState('code');
  const [desc,     setDesc]     = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const ts = Date.now();
    onAdd({
      id:          `wf-${ts}`,
      taskType,
      name:        name.trim(),
      description: desc.trim(),
      active:      true,
      webhookUrl:  '',
      steps: [
        { id: `s-${ts}-1`, order: 0, type: 'FETCH_JIRA',  label: 'Fetch Jira issue', config: {}, editable: false },
        { id: `s-${ts}-2`, order: 1, type: 'AI_GENERATE', label: 'Generate output',  config: { promptTemplate: 'Process the requirements and generate the output.', maxTokens: 4096 }, editable: true },
      ],
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Workflow</span>
          <button className="icon-btn" onClick={onClose}>âœ•</button>
        </div>
        <div className="modal-body">
          <label className="form-label">Name *</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Custom Review"
            autoFocus
          />

          <label className="form-label" style={{ marginTop: 14 }}>Task Type</label>
          <select className="form-select" value={taskType} onChange={(e) => setTaskType(e.target.value)}>
            {TASK_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>

          <label className="form-label" style={{ marginTop: 14 }}>Description</label>
          <input
            className="form-input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Brief descriptionâ€¦"
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>Create</button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ WorkflowsTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function WorkflowsTab() {
  const { workflows, addWorkflow, updateWorkflow, deleteWorkflow, addStep, updateStep, deleteStep, moveStep } =
    useAppStore();
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);

  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const active = workflows.find((w) => w.id === selectedId);

  const handleAddStep = () => {
    if (!active) return;
    const ts = Date.now();
    addStep(active.id, {
      id:       `s-${ts}`,
      order:    active.steps.length,
      type:     'AI_GENERATE',
      label:    'New Step',
      config:   { promptTemplate: '', maxTokens: 4096 },
      editable: true,
    });
  };

  const handleDrop = useCallback(() => {
    if (!active || dragItem.current === null || dragOver.current === null) return;
    if (dragItem.current === dragOver.current) return;
    const steps = [...active.steps];
    const fromIdx = steps.findIndex((s) => s.id === dragItem.current);
    const toIdx   = steps.findIndex((s) => s.id === dragOver.current);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = steps.splice(fromIdx, 1);
    steps.splice(toIdx, 0, moved);
    updateWorkflow(active.id, { steps: steps.map((s, i) => ({ ...s, order: i })) });
    dragItem.current = null;
    dragOver.current = null;
  }, [active, updateWorkflow]);

  return (
    <div className="workflows-page">
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">Define n8n-executed workflows â€” each step maps to an n8n execution node</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Workflow</button>
      </div>

      <div className="workflows-layout">
        {/* â”€â”€ Workflow list â”€â”€ */}
        <div className="workflows-list-col">
          {workflows.length === 0 ? (
            <div className="wf-empty-state">
              <div className="empty-icon-lg">â¬¡</div>
              <h3>No workflows yet</h3>
              <p>Create a workflow to customise how n8n executes AI steps for each task type.</p>
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Create Workflow</button>
            </div>
          ) : (
            workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                selected={wf.id === selectedId}
                onToggleActive={(isActive) => updateWorkflow(wf.id, { active: isActive })}
                onDelete={(id) => {
                  deleteWorkflow(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                onSelect={() => setSelectedId(wf.id === selectedId ? null : wf.id)}
              />
            ))
          )}
        </div>

        {/* â”€â”€ Step editor â”€â”€ */}
        {active && (
          <div className="wf-editor-col">
            <div className="wf-editor-header">
              <div>
                <h3 className="wf-editor-title">{active.name}</h3>
                <span className="wf-editor-meta">{active.steps.length} steps Â· drag to reorder</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={handleAddStep}>+ Add Step</button>
                <button className="icon-btn" onClick={() => setSelectedId(null)}>âœ•</button>
              </div>
            </div>

            {/* n8n Webhook URL override */}
            <div className="wf-webhook-row">
              <label className="form-label">n8n Webhook URL override (leave blank to use default <code>execute-workflow</code> endpoint)</label>
              <input
                className="form-input"
                value={active.webhookUrl ?? ''}
                onChange={(e) => updateWorkflow(active.id, { webhookUrl: e.target.value })}
                placeholder="http://localhost:5678/webhook/execute-workflow"
              />
            </div>

            {/* Step type legend */}
            <div className="wf-step-legend">
              {STEP_TYPES.map((t) => (
                <span key={t.id} className="wf-legend-chip" title={t.description} style={{ borderColor: t.color + '55', color: t.color }}>
                  {t.icon} {t.label}
                </span>
              ))}
            </div>

            {/* Steps */}
            <div className="wf-steps-list">
              {active.steps.length === 0 ? (
                <div className="wf-steps-empty">No steps yet. Click "+ Add Step" to begin.</div>
              ) : (
                active.steps.map((step, i) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={i}
                    total={active.steps.length}
                    onEdit={(stepId, changes) => updateStep(active.id, stepId, changes)}
                    onDelete={(stepId) => deleteStep(active.id, stepId)}
                    onMove={(stepId, dir) => moveStep(active.id, stepId, dir)}
                    isDragging={dragItem.current === step.id}
                    onDragStart={() => { dragItem.current = step.id; }}
                    onDragOver={() => { dragOver.current = step.id; }}
                    onDragEnd={handleDrop}
                    onDrop={handleDrop}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={addWorkflow} />}
    </div>
  );
}
