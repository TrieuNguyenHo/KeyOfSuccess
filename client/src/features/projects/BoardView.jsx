import { useState } from 'react';
import { coarsePointer, useTouchDrag } from '../../touchDrag.js';
import { AddTaskInline, CheckButton, SectionHeader, TaskMeta, TaskTags } from '../../components/TaskParts.jsx';
import { tr } from '../../i18n.js';

export default function BoardView({
  sections,
  tasks,
  onOpen,
  onToggle,
  onMove,
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
  const [dragId, setDragId] = useState(null);
  const [overSection, setOverSection] = useState(null);
  // Finger drag (iPad): dropped on a card it lands before that card, elsewhere in a column at its end.
  const touch = useTouchDrag((taskId, target) => {
    const column = target?.closest('[data-section]');
    if (!column) return;
    const card = target.closest('[data-task]');
    onMove(taskId, Number(column.dataset.section), card ? Number(card.dataset.task) : null);
  });
  const touchSection = touch.dragId != null ? Number(touch.overElement?.closest('[data-section]')?.dataset.section) : null;
  const coarse = coarsePointer();

  const drop = (sectionId, beforeId) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragId != null) onMove(dragId, sectionId, beforeId);
    setDragId(null);
    setOverSection(null);
  };

  return (
    <div className="board" data-touch-scroll>
      {sections.map((section) => {
        const column = tasks.filter((t) => t.section_id === section.id);
        return (
          <div
            key={section.id}
            data-section={section.id}
            className={`column ${overSection === section.id || touchSection === section.id ? 'drag-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverSection(section.id);
            }}
            onDrop={drop(section.id, null)}
          >
            <SectionHeader
              section={section}
              count={column.length}
              onRename={onRenameSection}
              onDelete={onDeleteSection}
              readOnly={!canManageSections}
            />
            <div className="cards">
              {column.map((task) => (
                <div
                  key={task.id}
                  data-task={task.id}
                  className={`card ${task.completed ? 'done' : ''} ${dragId === task.id || touch.dragId === task.id ? 'dragging' : ''}`}
                  draggable={canEditTask(task) && !coarse}
                  {...touch.bind(task.id, canEditTask(task))}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(task.id));
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(task.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverSection(null);
                  }}
                  onDrop={drop(section.id, task.id)}
                  onClick={() => onOpen(task.id)}
                >
                  <TaskTags task={task} requirements={requirements} />
                  <div className="card-title">
                    <CheckButton checked={Boolean(task.completed)} disabled={!canEditTask(task)} onClick={() => onToggle(task)} />
                    <span>{task.title}</span>
                  </div>
                  <TaskMeta task={task} />
                </div>
              ))}
            </div>
            {!readOnly && (
              <AddTaskInline
                onAdd={(title, requirementId) => onAddTask(section.id, title, requirementId)}
                requirements={requirements}
                defaultRequirementId={defaultRequirementId}
                onOpenRequirements={onOpenRequirements}
              />
            )}
          </div>
        );
      })}
      {canManageSections && (
        <button className="add-column" onClick={onAddSection}>
          {tr('+ Thêm trạng thái')}
        </button>
      )}
    </div>
  );
}
