import { Schema, model } from 'mongoose';

const workflowSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
  graph: { type: Schema.Types.Mixed, required: true },
  version: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

export const Workflow = model('Workflow', workflowSchema);
