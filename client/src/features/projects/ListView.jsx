import { AddTaskInline, CheckButton, DueDate, PriorityTag, SectionHeader, TaskTags } from '../../components/TaskParts.jsx';
import { Avatar } from '../../components/Avatar.jsx';
import { tr } from '../../i18n.js';
import { formatDate } from '../../utils.js';

export default function ListView({
  sections,
  tasks,
  onOpen,
  onToggle,
  onAddTask,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  readOnly,
  canManageSections,
  canEditTask,
  requirements,
  defaultRequirementId,
  onOpenRequirements,
}) {
  return (
    <div className="list">
      <div className="list-row with-start list-head">
        <span>{tr('Tên task')}</span>
        <span>{tr('Người làm')}</span>
        <span>{tr('Ngày bắt đầu')}</span>
        <span>{tr('Hạn chót')}</span>
        <span>{tr('Ưu tiên')}</span>
      </div>
      {sections.map((section) => {
        const rows = tasks.filter((t) => t.section_id === section.id);
        return (
          <section key={section.id} className="list-section">
            <SectionHeader
              section={section}
              count={rows.length}
              onRename={onRenameSection}
              onDelete={onDeleteSection}
              readOnly={!canManageSections}
            />
            {rows.map((task) => (
              <div key={task.id} className="list-row with-start" onClick={() => onOpen(task.id)}>
                <span className={`list-title ${task.completed ? 'done' : ''}`}>
                  <CheckButton checked={Boolean(task.completed)} disabled={!canEditTask(task)} onClick={() => onToggle(task)} />
                  <span className="ellipsis">{task.title}</span>
                  <TaskTags task={task} requirements={requirements} />
                  {task.subtask_count > 0 && (
                    <small className="muted">
                      ☑ {task.subtask_done}/{task.subtask_count}
                    </small>
                  )}
                  {task.comment_count > 0 && <small className="muted">💬 {task.comment_count}</small>}
                </span>
                <span className="cell">
                  {task.assignee_name ? (
                    <>
                      <Avatar name={task.assignee_name} userId={task.assignee_id} small />
                      <span className="ellipsis">{task.assignee_name}</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
                <span>{task.start_date ? formatDate(task.start_date) : <span className="muted">—</span>}</span>
                <span>
                  <DueDate task={task} empty="—" />
                </span>
                <span>
                  <PriorityTag value={task.priority} />
                </span>
              </div>
            ))}
            {!readOnly && (
              <div className="list-add">
                <AddTaskInline
                  onAdd={(title, requirementId) => onAddTask(section.id, title, requirementId)}
                  requirements={requirements}
                  defaultRequirementId={defaultRequirementId}
                  onOpenRequirements={onOpenRequirements}
                />
              </div>
            )}
          </section>
        );
      })}
      {canManageSections && (
        <button className="add-section-btn" onClick={onAddSection}>
          {tr('+ Thêm trạng thái')}
        </button>
      )}
    </div>
  );
}
