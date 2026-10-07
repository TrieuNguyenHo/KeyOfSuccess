import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import RequirementDetail from './RequirementDetail.jsx';
import { tr } from '../../i18n.js';

// Full page for one requirement, opened from a task or from the Requirements tab.
export default function RequirementPage({ projectId, requirementId, refreshKey, onBack, onOpenTask, onOpenProject, onShowOnBoard }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(
    () =>
      api(`/projects/${projectId}`)
        .then(setData)
        .catch((e) => setError(e.message)),
    [projectId]
  );

  // refreshKey changes when the task panel edits something.
  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const back = (
    <button className="link-btn" onClick={onBack}>
      {tr('← Quay lại')}
    </button>
  );
  if (!data) {
    return (
      <div className="task-page">
        {back}
        <p className="muted">{error || tr('Đang tải…')}</p>
      </div>
    );
  }

  const { project, tasks, requirements } = data;
  const requirement = requirements.find((r) => r.id === requirementId);
  if (!requirement) {
    return (
      <div className="task-page">
        {back}
        <p className="muted">{tr('Requirement này không còn tồn tại.')}</p>
      </div>
    );
  }

  return (
    <div className="task-page">
      <div className="page-top">
        {back}
        <div className="detail-project">
          <span className="dot" style={{ background: project.color }} />
          <button className="crumb" onClick={() => onOpenProject(project.id)} title={tr('Mở project')}>
            {project.name}
          </button>
          <span aria-hidden="true">›</span>
          <span>Requirement</span>
        </div>
      </div>
      <div className="requirement-page">
        <RequirementDetail
          requirement={requirement}
          tasks={tasks}
          // Same rule as the Requirements tab: owner, a Leader of the project's teams, or any Manager.
          canEdit={project.can_edit_requirements}
          onChanged={reload}
          onOpenTask={onOpenTask}
          onShowOnBoard={onShowOnBoard}
          onDeleted={onBack}
        />
      </div>
    </div>
  );
}
