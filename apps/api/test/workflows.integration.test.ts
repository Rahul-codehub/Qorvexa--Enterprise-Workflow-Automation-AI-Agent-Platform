
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';
import { Execution } from '../src/models/execution.js';

import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { createAccessToken } from '../src/auth/crypto.js';
import { Organization } from '../src/models/organization.js';
import { User } from '../src/models/user.js';
import { Workflow } from '../src/models/workflow.js';
import { closeWorkflowExecutionsQueue } from '../src/queues/workflow-executions.js';
const TEST_DATABASE_NAME = 'qorvexa_integration_test';

const env = getEnv();

function assertTestDatabase(): void {
    const configuredDatabase = new URL(env.MONGODB_URI).pathname.slice(1);

    assert.equal(
        process.env.NODE_ENV,
        'test',
        'Set NODE_ENV=test before running integration tests.'
    );

    assert.equal(
        configuredDatabase,
        TEST_DATABASE_NAME,
        `Refusing to run tests against "${configuredDatabase}". Expected "${TEST_DATABASE_NAME}".`
    );
}

const graph = {
    nodes: [
        {
            id: 'trigger-1',
            type: 'manualTrigger' as const,
            label: 'Manual Trigger',
            config: {}
        },
        {
            id: 'action-1',
            type: 'action' as const,
            label: 'Set Test Result',
            config: {
                operation: 'set',
                key: 'testResult',
                value: 'API-to-worker integration OK'
            }
        },
        {
            id: 'end-1',
            type: 'end' as const,
            label: 'End',
            config: {}
        }
    ],
    edges: [
        {
            id: 'edge-1',
            source: 'trigger-1',
            target: 'action-1'
        },
        {
            id: 'edge-2',
            source: 'action-1',
            target: 'end-1'
        }
    ]
};

describe('Workflow API integration tests', () => {
    let server: Server;
    let baseUrl: string;
    let ownerToken: string;
    let memberToken: string;
    let otherOrganizationOwnerToken: string;
    let ownerId: mongoose.Types.ObjectId;
    let memberId: mongoose.Types.ObjectId;
    let otherOwnerId: mongoose.Types.ObjectId;
    let organizationId: mongoose.Types.ObjectId;
    let otherOrganizationId: mongoose.Types.ObjectId;
    let createdWorkflowId: string;

    before(async () => {
        assertTestDatabase();

        await mongoose.connect(env.MONGODB_URI);

        // This database is dedicated to integration tests only.
        await Promise.all([
            Workflow.deleteMany({}),
            User.deleteMany({}),
            Organization.deleteMany({})
        ]);
        const organization = await Organization.create({
            name: 'Integration Test Organization',
            slug: 'qorvexa-integration-test'
        });

        const otherOrganization = await Organization.create({
            name: 'Other Integration Test Organization',
            slug: 'qorvexa-other-integration-test'
        });

        organizationId = organization._id;
        otherOrganizationId = otherOrganization._id;

        const owner = await User.create({
            organizationId,
            name: 'Integration Test Owner',
            email: 'owner@qorvexa-integration.test',
            passwordHash: 'not-used-by-token-auth-tests',
            role: 'owner'
        });

        const member = await User.create({
            organizationId,
            name: 'Integration Test Member',
            email: 'member@qorvexa-integration.test',
            passwordHash: 'not-used-by-token-auth-tests',
            role: 'member'
        });

        const otherOwner = await User.create({
            organizationId: otherOrganizationId,
            name: 'Other Integration Test Owner',
            email: 'other-owner@qorvexa-integration.test',
            passwordHash: 'not-used-by-token-auth-tests',
            role: 'owner'
        });

        ownerId = owner._id;
        memberId = member._id;
        otherOwnerId = otherOwner._id;

        ownerToken = createAccessToken({
            sub: String(ownerId),
            organizationId: String(organizationId),
            role: 'owner'
        }, env.JWT_ACCESS_SECRET);

        memberToken = createAccessToken({
            sub: String(memberId),
            organizationId: String(organizationId),
            role: 'member'
        }, env.JWT_ACCESS_SECRET);

        otherOrganizationOwnerToken = createAccessToken({
            sub: String(otherOwnerId),
            organizationId: String(otherOrganizationId),
            role: 'owner'
        }, env.JWT_ACCESS_SECRET);

        const app = createApp(env);
        server = createServer(app);

        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                server.removeListener('error', reject);
                resolve();
            });
        });

        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
        if (server?.listening) {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        }

        try {
            if (mongoose.connection.readyState === 1) {
                await Promise.all([
                    Workflow.deleteMany({}),
                    User.deleteMany({}),
                    Organization.deleteMany({})
                ]);
            }
        } finally {
            try {
                await mongoose.disconnect();
            } finally {
                await closeWorkflowExecutionsQueue();
            }
        }
    });

    it('rejects unauthenticated workflow listing', async () => {
        const response = await fetch(`${baseUrl}/api/v1/workflows`);

        assert.equal(response.status, 401);

        const body = await response.json() as {
            error: { code: string };
        };

        assert.equal(body.error.code, 'UNAUTHENTICATED');
    });


    it('allows an owner to create a workflow', async () => {
        const response = await fetch(`${baseUrl}/api/v1/workflows`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${ownerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Owner Integration Workflow',
                description: 'Created by an integration test',
                graph
            })
        });

        assert.equal(response.status, 201);

        const body = await response.json() as {
            data: {
                id: string;
                organizationId: string;
                createdBy: string;
            };
        };

        assert.ok(body.data.id);
        createdWorkflowId = body.data.id;
        assert.equal(body.data.organizationId, String(organizationId));
        assert.equal(body.data.createdBy, String(ownerId));
    });


    it('preserves the workflow snapshot and version when the source workflow changes', async () => {
        const publishResponse = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}/publish`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`
                }
            }
        );

        assert.equal(publishResponse.status, 200);

        const publishBody = await publishResponse.json() as {
            data: { version: number };
        };


        const storedWorkflow = await Workflow.findById(createdWorkflowId).lean();

        assert.ok(storedWorkflow);

        const originalVersion = storedWorkflow.version;
        const originalGraph = structuredClone(storedWorkflow.graph);

        const executeResponse = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}/execute`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${ownerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    input: { testRun: true }
                })
            }
        );

        assert.equal(executeResponse.status, 202);

        const executeBody = await executeResponse.json() as {
            data: { id: string; workflowVersion: number; status: string };
        };

        assert.equal(executeBody.data.workflowVersion, originalVersion);
        assert.equal(executeBody.data.status, 'queued');

        const executionId = executeBody.data.id;
        const savedExecution = await Execution.findById(executionId).lean();

        assert.ok(savedExecution);
        assert.equal(savedExecution.workflowVersion, originalVersion);
        assert.deepEqual(savedExecution.workflowSnapshot, originalGraph);


        const statusResponse = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}/executions/${executionId}`,
            {
                headers: {
                    Authorization: `Bearer ${ownerToken}`
                }
            }
        );

        assert.equal(statusResponse.status, 200);

        const statusBody = await statusResponse.json() as {
            data: {
                id: string;
                workflowId: string;
                workflowVersion: number;
                status: string;
                input: Record<string, unknown>;
                steps: unknown[];
            };
        };

        assert.equal(statusBody.data.id, executionId);
        assert.equal(statusBody.data.workflowId, createdWorkflowId);
        assert.equal(statusBody.data.workflowVersion, originalVersion);
        assert.equal(statusBody.data.status, 'queued');
        assert.deepEqual(statusBody.data.input, { testRun: true });
        assert.deepEqual(statusBody.data.steps, []);

        const crossOrganizationResponse = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}/executions/${executionId}`,
            {
                headers: {
                    Authorization: `Bearer ${otherOrganizationOwnerToken}`
                }
            }
        );

        assert.equal(crossOrganizationResponse.status, 404);


        const changedGraph = {
            nodes: [
                ...graph.nodes,
                {
                    id: 'action-after-trigger',
                    type: 'action' as const,
                    label: 'Added After Execution',
                    config: {}
                }
            ],
            edges: []
        };

        await Workflow.updateOne(
            { _id: createdWorkflowId },
            {
                $set: { graph: changedGraph },
                $inc: { version: 1 }
            }
        );

        const executionAfterUpdate = await Execution.findById(executionId).lean();

        assert.ok(executionAfterUpdate);
        assert.equal(executionAfterUpdate.workflowVersion, originalVersion);
        assert.deepEqual(executionAfterUpdate.workflowSnapshot, originalGraph);
        assert.notDeepEqual(executionAfterUpdate.workflowSnapshot, changedGraph);
    });



    it('forbids a member from creating a workflow', async () => {
        const response = await fetch(`${baseUrl}/api/v1/workflows`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${memberToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Member Forbidden Workflow',
                graph
            })
        });

        assert.equal(response.status, 403);

        const body = await response.json() as {
            error: { code: string };
        };

        assert.equal(body.error.code, 'FORBIDDEN');
    });



    it('allows an owner to retrieve a workflow in their organization', async () => {
        const response = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}`,
            {
                headers: {
                    Authorization: `Bearer ${ownerToken}`
                }
            }
        );

        assert.equal(response.status, 200);

        const body = await response.json() as {
            data: {
                id: string;
                organizationId: string;
                name: string;
            };
        };

        assert.equal(body.data.id, createdWorkflowId);
        assert.equal(body.data.organizationId, String(organizationId));
        assert.equal(body.data.name, 'Owner Integration Workflow');
    });

    it('hides another organization workflow from its owner', async () => {
        const response = await fetch(
            `${baseUrl}/api/v1/workflows/${createdWorkflowId}`,
            {
                headers: {
                    Authorization: `Bearer ${otherOrganizationOwnerToken}`
                }
            }
        );

        assert.equal(response.status, 404);

        const body = await response.json() as {
            error: { code: string };
        };

        assert.equal(body.error.code, 'WORKFLOW_NOT_FOUND');
    });

    it('rejects an invalid workflow ID', async () => {
        const response = await fetch(
            `${baseUrl}/api/v1/workflows/not-a-valid-id`,
            {
                headers: {
                    Authorization: `Bearer ${ownerToken}`
                }
            }
        );

        assert.equal(response.status, 400);

        const body = await response.json() as {
            error: { code: string };
        };

        assert.equal(body.error.code, 'INVALID_WORKFLOW_ID');
    });


    it('does not expose another organization workflows', async () => {
        const response = await fetch(`${baseUrl}/api/v1/workflows`, {
            headers: {
                Authorization: `Bearer ${otherOrganizationOwnerToken}`
            }
        });


        assert.equal(response.status, 200);

        const body = await response.json() as {
            data: Array<{ organizationId: string }>;
        };

        assert.equal(body.data.length, 0);
    });
});
