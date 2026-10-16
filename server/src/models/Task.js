const mongoose = require('mongoose');

const RANK = { low: 1, medium: 2, high: 3, urgent: 4 };

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    done: { type: Boolean, default: false },
  },
  { _id: true }
);

const commentSchema = new mongoose.Schema(
  {
    author: { type: String, default: 'Team Member', maxlength: 60 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const activitySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, maxlength: 100 },
    detail: { type: String, default: '', maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    project: { type: String, default: '', trim: true, maxlength: 60, index: true },
    assignee: { type: String, default: '', trim: true, maxlength: 60, index: true },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    priorityRank: { type: Number, default: 2 },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    subtasks: { type: [subtaskSchema], default: [] },
    acceptanceCriteria: { type: [String], default: [] },
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
    estimateMinutes: { type: Number, default: null, min: 0 },
    loggedMinutes: { type: Number, default: 0, min: 0 },
    comments: { type: [commentSchema], default: [] },
    activityLog: { type: [activitySchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ user: 1, status: 1, dueDate: 1 });
taskSchema.index({ user: 1, project: 1 });
taskSchema.index({ user: 1, assignee: 1 });
taskSchema.index({ user: 1, createdAt: -1 });

taskSchema.pre('validate', function (next) {
  this.priorityRank = RANK[this.priority] || 2;
  if (this.isNew || this.isModified('status')) {
    this.completedAt = this.status === 'done' ? this.completedAt || new Date() : null;
  }
  next();
});

taskSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.user;
    delete ret.priorityRank;
    return ret;
  },
});

module.exports = mongoose.model('Task', taskSchema);
