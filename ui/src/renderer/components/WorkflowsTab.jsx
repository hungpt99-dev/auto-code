import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { TASK_TYPES } from '../constants/taskTypes';

const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t]));

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ step, index, total, onEdit, onDelete, onMove }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(step.prompt);

  const save = () => {
    onEdit(step.id, { prompt: draft, label: step.label });
    setEditing(false);
  };

  return (
    <div className={`wf-step-card${step.editable === false ? ' wf-step-card--locked' : ''}`}>
      <div className="wf-step-header">
        <div className="wf-step-left">
          <span className="wf-step-num">{index + 1}</span>
          <span className="wf-step-label">{step.label}</span>
          {step.editable === false && <span className="wf-step-lock-badge">locked</span>}
        </div>
        <div className="wf-step-actions">
          {index > 0 && (
            <button className="icon-btn" title="Move up" onClick={() => onMove(step.id, 'up')}>↑</button>
          )}
          {index < total - 1 && (
            <button className="icon-btn" title="Move down" onClick={() => onMove(step.id, 'down')}>↓</button>
          )}
          {step.editable !== false && (
            <>
              <button className="icon-btn" title="Edit" onClick={() => { setDraft(step.prompt); setEditing(!editing); }}>✎</button>
              <button className="icon-btn icon-btn--danger" title="Delete" onClick={() => onDelete(step.id)}>✕</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="wf-step-edit">
          <input
            className="form-input wf-step-label-input"
            value={step.label}
            onChange={(e) => onEdit(step.id, { label: e.target.value })}
            placeholder="Step name…"
          />
          <textarea
            className="form-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Enter the AI prompt for this step…"
          />
          <div className="wf-step-edit-btns">
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="wf-step-prompt">{step.prompt || <em>No prompt — click ✎ to edit</em>}</div>
      )}
    </div>
  );
}

// ─── Workflow card ─────────────────────────────────────────────────────────────
function WorkflowCard({ workflow, selected, onToggleActive, onDelete, onSelect }) {
  const tt = TASK_TYPE_MAP[workflow.taskType];
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
          {tt?.icon ?? '⬡'}
        </div>
        <div className="wf-card-info">
          <div className="wf-card-name">{workflow.name}</div>
          <div className="wf-card-meta">{workflow.steps.length} steps · {tt?.label ?? workflow.taskType}</div>
        </div>
        <div className="wf-card-controls" onClick={(e) => e.stopPropagation()}>
          <label className="toggle-switch" title={workflow.active ? 'Deactivate' : 'Activate'}>
            <input type="checkbox" checked={workflow.active} onChange={(e) => onToggleActive(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </label>
          <button className="icon-btn icon-btn--danger" title="Delete workflow" onClick={() => onDelete(workflow.id)}>🗑</button>
        </div>
      </div>
      {workflow.description && (
        <div className="wf-card-desc">{workflow.description}</div>
      )}
      <div className="wf-card-steps-preview">
        {workflow.steps.slice(0, 4).map((s, i) => (
          <span key={s.id} className="wf-step-chip">{i + 1}. {s.label}</span>
        ))}
        {workflow.steps.length > 4 && (
          <span className="wf-step-chip wf-step-chip--more">+{workflow.steps.length - 4} more</span>
        )}
      </div>
    </div>
  );
}

// ─── Add workflow modal ───────────────────────────────────────────────────────
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
        { id: `s-${ts}-1`, order: 0, label: 'Fetch Jira issue', prompt: 'Fetch all details of the Jira issue including acceptance criteria and linked items.', editable: false },
        { id: `s-${ts}-2`, order: 1, label: 'Process & generate', prompt: 'Process the requirements and generate the output following best practices.', editable: true },
      ],
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Workflow</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
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
            placeholder="Brief description…"
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

// ─── WorkflowsTab ─────────────────────────────────────────────────────────────
export default function WorkflowsTab() {
  const { workflows, addWorkflow, updateWorkflow, deleteWorkflow, addStep, updateStep, deleteStep, moveStep } =
    useAppStore();
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd,    setShowAdd]    = useState(false);

  const active = workflows.find((w) => w.id === selectedId);

  const handleAddStep = () => {
    if (!active) return;
    const ts = Date.now();
    addStep(active.id, {
      id:       `s-${ts}`,
      order:    active.steps.length,
      label:    'New Step',
      prompt:   '',
      editable: true,
    });
  };

  return (
    <div className="workflows-page">
      <div className="page-header-bar">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-subtitle">Configure AI generation workflows per task type</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ New Workflow</button>
      </div>

      <div className="workflows-layout">
        {/* ── Workflow list ── */}
        <div className="workflows-list-col">
          {workflows.length === 0 ? (
            <div className="wf-empty-state">
              <div className="empty-icon-lg">⬡</div>
              <h3>No workflows yet</h3>
              <p>Create a workflow to customise how AI generates code for each task type.</p>
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Create Workflow</button>
            </div>
          ) : (
            workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                workflow={wf}
                selected={wf.id === selectedId}
                onToggleActive={(active) => updateWorkflow(wf.id, { active })}
                onDelete={(id) => {
                  deleteWorkflow(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                onSelect={() => setSelectedId(wf.id === selectedId ? null : wf.id)}
              />
            ))
          )}
        </div>

        {/* ── Step editor ── */}
        {active && (
          <div className="wf-editor-col">
            <div className="wf-editor-header">
              <div>
                <h3 className="wf-editor-title">{active.name}</h3>
                <span className="wf-editor-meta">{active.steps.length} steps</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={handleAddStep}>+ Add Step</button>
                <button className="icon-btn" onClick={() => setSelectedId(null)}>✕</button>
              </div>
            </div>

            {/* Webhook URL override */}
            <div className="wf-webhook-row">
              <label className="form-label">Webhook URL override (leave blank to use global)</label>
              <input
                className="form-input"
                value={active.webhookUrl ?? ''}
                onChange={(e) => updateWorkflow(active.id, { webhookUrl: e.target.value })}
                placeholder="https://your-n8n.instance/webhook/…"
              />
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
