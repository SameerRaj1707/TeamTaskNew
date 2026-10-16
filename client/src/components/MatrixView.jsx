import React from 'react';
import { getEisenhowerQuadrant } from '../utils.js';

export default function MatrixView({ tasks, renderCard }) {
  const q1 = tasks.filter((t) => t.status !== 'done' && getEisenhowerQuadrant(t) === 'q1');
  const q2 = tasks.filter((t) => t.status !== 'done' && getEisenhowerQuadrant(t) === 'q2');
  const q3 = tasks.filter((t) => t.status !== 'done' && getEisenhowerQuadrant(t) === 'q3');
  const q4 = tasks.filter((t) => t.status !== 'done' && getEisenhowerQuadrant(t) === 'q4');

  const quadrants = [
    {
      id: 'q1',
      title: '🚨 DO FIRST (Urgent & Important)',
      desc: 'Immediate deadlines, critical bugs & customer-blocking issues',
      items: q1,
      theme: 'quad-q1',
    },
    {
      id: 'q2',
      title: '🎯 SCHEDULE (Important, Not Urgent)',
      desc: 'Strategic architecture, roadmap features & proactive improvements',
      items: q2,
      theme: 'quad-q2',
    },
    {
      id: 'q3',
      title: '⚡ DELEGATE (Urgent, Lower Impact)',
      desc: 'Quick requests, repetitive tasks or non-core handoffs',
      items: q3,
      theme: 'quad-q3',
    },
    {
      id: 'q4',
      title: '🗄️ BACKLOG / DROP (Neither)',
      desc: 'Low priority ideas, nice-to-haves & low ROI items',
      items: q4,
      theme: 'quad-q4',
    },
  ];

  return (
    <div className="matrix-container">
      <div className="matrix-info-banner">
        <span>
          💡 <b>Eisenhower Prioritization Matrix</b>: Eliminates "Everything is Urgent" fatigue by sorting tasks on true business impact versus immediate deadlines.
        </span>
      </div>

      <div className="matrix-grid">
        {quadrants.map((q) => (
          <div key={q.id} className={`matrix-quadrant ${q.theme}`}>
            <div className="quadrant-header">
              <div className="quadrant-title-group">
                <h3>{q.title}</h3>
                <span className="count">{q.items.length}</span>
              </div>
              <p className="quadrant-desc">{q.desc}</p>
            </div>
            <div className="quadrant-items">
              {q.items.length === 0 ? (
                <p className="muted small-t center pad">No tasks in this quadrant</p>
              ) : (
                q.items.map(renderCard)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
