
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createServer, type Server } from 'node:http';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';

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
  const databaseName = new URL(env.MONGODB_URI).pathname.slice(1);

  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(
    databaseName,
    TEST_DATABASE_NAME,
    `Refusing to run tests against "${databaseName}".`
  );
}

const validGraph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'manualTrigger' as const,
      label: 'Manual Trigger',
      config: {}
    },
    {
      id: 'end-1',
      type: 'end' as const,
      label: 'End',
      config: {}
    }
  ],
  edges: []
};

describe('Workflow lifecycle integration tests', () => {
  let server: Server;
  let baseUrl: string;
  let ownerToken: string;
  let memberToken: string;
  let otherOwnerToken: string;
  let organizationId: mongoose.Types.ObjectId;
  let ownerId: mongoose.Types.ObjectId;
  let otherOrganizationId: mongoose.Types.ObjectId;
  let workflowId: string;
  let otherWorkflowId: string;

  before(async () => {
    assertTestDatabase();
    await mongoose.connect(env.MONGODB_URI);

    await Promise.all([
      Workflow.deleteMany({}),
      User.deleteMany({}),
      Organization.deleteMany({})
    ]);

    const organization = await Organization.create({
      name: 'Lifecycle Test Organization',
      slug: 'qorvexa-lifecycle-test'
    });

    const otherOrganization = await Organization.create({
      name: 'Other Lifecycle Test Organization',
      slug: 'qorvexa-other-lifecycle-test'
    });

    organizationId = organization._id;
    otherOrganizationId = otherOrganization._id;

    const [owner, member, otherOwner] = await Promise.all([
      User.create({
        organizationId,
        name: 'Lifecycle Owner',
        email: 'lifecycle-owner@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'owner'
      }),
      User.create({
        organizationId,
        name: 'Lifecycle Member',
        email: 'lifecycle-member@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'member'
      }),
      User.create({
        organizationId: otherOrganizationId,
        name: 'Other Lifecycle Owner',
        email: 'lifecycle-other-owner@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'owner'
      })
    ]);

    ownerId = owner._id;

    ownerToken = createAccessToken({
      sub: String(owner._id),
      organizationId: String(organizationId),
      role: 'owner'
    }, env.JWT_ACCESS_SECRET);

    memberToken = createAccessToken({
      sub: String(member._id),
      organizationId: String(organizationId),
      role: 'member'
    }, env.JWT_ACCESS_SECRET);

    otherOwnerToken = createAccessToken({
      sub: String(otherOwner._id),
      organizationId: String(otherOrganizationId),
      role: 'owner'
    }, env.JWT_ACCESS_SECRET);

    const [workflow, otherWorkflow] = await Promise.all([
      Workflow.create({
        organizationId,
        createdBy: ownerId,
        name: 'Lifecycle Draft',
        graph: validGraph,
        status: 'draft',
        version: 1
      }),
      Workflow.create({
        organizationId: otherOrganizationId,
        createdBy: otherOwner._id,
        name: 'Other Organization Draft',
        graph: validGraph,
        status: 'draft',
        version: 1
      })
    ]);

    workflowId = String(workflow._id);
    otherWorkflowId = String(otherWorkflow._id);

    server = createServer(createApp(env));

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
    try {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }

      if (mongoose.connection.readyState === 1) {
        await Promise.all([
          Workflow.deleteMany({}),
          User.deleteMany({}),
          Organization.deleteMany({})
        ]);
      }
    } finally {
      try {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect();
        }
      } finally {
        await closeWorkflowExecutionsQueue();
      }
    }
  });

  it('publishes a valid draft and increments its version', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 200);

    const body = await response.json() as {
      data: {
        id: string;
        status: string;
        version: number;
        organizationId: string;
      };
    };

    assert.equal(body.data.id, workflowId);
    assert.equal(body.data.status, 'published');
    assert.equal(body.data.version, 2);
    assert.equal(body.data.organizationId, String(organizationId));
  });

  it('rejects publishing a workflow that is already published', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 409);
  });

  it('forbids a member from publishing a workflow', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`
        }
      }
    );

    assert.equal(response.status, 403);
  });

  it('does not expose another organization workflow for publishing', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${otherWorkflowId}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 404);

    const unchanged = await Workflow.findById(otherWorkflowId);
    assert.equal(unchanged?.status, 'draft');
  });

  it('rejects an invalid workflow ID', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/not-a-valid-id/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 400);
  });

  it('rejects publishing an invalid graph', async () => {
    const invalidWorkflow = await Workflow.create({
      organizationId,
      createdBy: ownerId,
      name: 'Invalid Graph Draft',
      status: 'draft',
      version: 1,
      graph: {
        nodes: [
          {
            id: 'end-only',
            type: 'end',
            label: 'End',
            config: {}
          }
        ],
        edges: []
      }
    });

    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${invalidWorkflow._id}/publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 422);

    const unchanged = await Workflow.findById(invalidWorkflow._id);
    assert.equal(unchanged?.status, 'draft');
    assert.equal(unchanged?.version, 1);
  });


  it('archives a published workflow and increments its version', async () => {
    const publishedWorkflow = await Workflow.findById(workflowId);
    assert.ok(publishedWorkflow);
    assert.equal(publishedWorkflow.status, 'published');

    const previousVersion = publishedWorkflow.version;

    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 200);

    const body = await response.json() as {
      data: {
        id: string;
        status: string;
        version: number;
      };
    };

    assert.equal(body.data.status, 'archived');
    assert.equal(body.data.version, previousVersion + 1);

    const archivedWorkflow = await Workflow.findById(workflowId);
    assert.equal(archivedWorkflow?.status, 'archived');
    assert.equal(archivedWorkflow?.version, previousVersion + 1);
  });

  it('rejects archiving a draft workflow', async () => {
    const draftWorkflow = await Workflow.create({
      organizationId,
      createdBy: ownerId,
      name: 'Draft Workflow',
      status: 'draft',
      version: 1,
      graph: {
        nodes: [
          {
            id: 'manual-trigger',
            type: 'manualTrigger',
            label: 'Manual Trigger',
            config: {}
          },
          {
            id: 'end',
            type: 'end',
            label: 'End',
            config: {}
          }
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'manual-trigger',
            target: 'end'
          }
        ]
      }
    });

    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${draftWorkflow._id}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 409);

    const unchanged = await Workflow.findById(draftWorkflow._id);
    assert.equal(unchanged?.status, 'draft');
    assert.equal(unchanged?.version, 1);
  });

  it('rejects archiving an already archived workflow', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 409);
  });

  it('forbids a member from archiving a workflow', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${memberToken}`
        }
      }
    );

    assert.equal(response.status, 403);
  });

  it('does not expose another organization workflow for archiving', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${otherWorkflowId}/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 404);

    const unchanged = await Workflow.findById(otherWorkflowId);
    assert.equal(unchanged?.status, 'draft');
  });

  it('rejects an invalid workflow ID when archiving', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/not-a-valid-id/archive`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 400);
  });


});
