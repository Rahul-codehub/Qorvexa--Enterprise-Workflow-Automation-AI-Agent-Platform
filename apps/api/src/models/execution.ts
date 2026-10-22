
import { Schema, model } from 'mongoose';
import type { WorkflowGraph } from '@qorvexa/shared';
const executionStepSchema = new Schema(
    {
        nodeId: { type: String, required: true },
        nodeType: { type: String, required: true },
        status: {
            type: String,
            enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
            default: 'pending',
            required: true
        },
        input: { type: Schema.Types.Mixed, default: {} },
        output: { type: Schema.Types.Mixed, default: null },
        error: { type: String, default: null },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null }
    },
    { _id: false }
);

const executionSchema = new Schema(
    {
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: 'Organization',
            required: true,
            index: true
        },
        workflowId: {
            type: Schema.Types.ObjectId,
            ref: 'Workflow',
            required: true,
            index: true
        },
        workflowVersion: {
            type: Number,
            required: true,
            min: 1
        },
        workflowSnapshot: {
            type: Schema.Types.Mixed,
            required: true
        },
        triggeredBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        status: {
            type: String,
            enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
            default: 'queued',
            required: true,
            index: true
        },
        input: {
            type: Schema.Types.Mixed,
            default: {}
        },
        output: {
            type: Schema.Types.Mixed,
            default: null
        },
        steps: {
            type: [executionStepSchema],
            default: []
        },
        error: {
            type: String,
            default: null
        },
        queuedAt: {
            type: Date,
            default: Date.now,
            required: true
        },
        startedAt: {
            type: Date,
            default: null
        },
        completedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

executionSchema.index({ organizationId: 1, createdAt: -1 });
executionSchema.index({ workflowId: 1, createdAt: -1 });

export const Execution = model('Execution', executionSchema);
