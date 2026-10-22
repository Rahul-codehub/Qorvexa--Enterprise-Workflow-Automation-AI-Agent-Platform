
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
  const configuredDatabase = new URL(env.MONGODB_URI).pathname.slice(1);

  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(
    configuredDatabase,
    TEST_DATABASE_NAME,
    `Refusing to run tests against "${configuredDatabase}".`
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
      id: 'end-1',
      type: 'end' as const,
      label: 'End',
      config: {}
    }
  ],
  edges: []
};

describe('Workflow mutation integration tests', () => {
  let server: Server;
  let baseUrl: string;
  let ownerToken: string;
  let memberToken: string;
  let otherOwnerToken: string;
  let organizationId: mongoose.Types.ObjectId;
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
      name: 'Mutation Test Organization',
      slug: 'qorvexa-mutation-test'
    });

    const otherOrganization = await Organization.create({
      name: 'Other Mutation Test Organization',
      slug: 'qorvexa-other-mutation-test'
    });

    organizationId = organization._id;
    otherOrganizationId = otherOrganization._id;

    const [owner, member, otherOwner] = await Promise.all([
      User.create({
        organizationId,
        name: 'Mutation Test Owner',
        email: 'mutation-owner@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'owner'
      }),
      User.create({
        organizationId,
        name: 'Mutation Test Member',
        email: 'mutation-member@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'member'
      }),
      User.create({
        organizationId: otherOrganizationId,
        name: 'Other Mutation Test Owner',
        email: 'mutation-other-owner@qorvexa-integration.test',
        passwordHash: 'not-used-by-token-auth-tests',
        role: 'owner'
      })
    ]);

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
        createdBy: owner._id,
        name: 'Mutation Test Workflow',
        description: 'Original description',
        graph,
        version: 1
      }),
      Workflow.create({
        organizationId: otherOrganizationId,
        createdBy: otherOwner._id,
        name: 'Other Organization Workflow',
        graph,
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
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }

    if (mongoose.connection.readyState === 1) {
      await Promise.all([
        Workflow.deleteMany({}),
        User.deleteMany({}),
        Organization.deleteMany({})
      ]);

      await mongoose.disconnect();
    }

    await closeWorkflowExecutionsQueue();
  });

  it('allows an owner to update a workflow and increments its version', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Updated Mutation Workflow',
          description: 'Updated description'
        })
      }
    );

    assert.equal(response.status, 200);

    const body = await response.json() as {
      data: {
        id: string;
        name: string;
        description: string;
        version: number;
      };
    };

    assert.equal(body.data.id, workflowId);
    assert.equal(body.data.name, 'Updated Mutation Workflow');
    assert.equal(body.data.description, 'Updated description');
    assert.equal(body.data.version, 2);
  });

  it('rejects an empty update request', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    );

    assert.equal(response.status, 400);
  });

  it('rejects an invalid graph update', async () => {
    const invalidGraph = {
      nodes: [
        {
          id: 'end-only',
          type: 'end',
          label: 'End',
          config: {}
        }
      ],
      edges: []
    };

    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ graph: invalidGraph })
      }
    );

    assert.equal(response.status, 422);
  });

  it('forbids a member from updating a workflow', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${memberToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Unauthorized update' })
      }
    );

    assert.equal(response.status, 403);
  });

  it('hides another organization workflow from update requests', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${otherWorkflowId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Cross-organization update' })
      }
    );

    assert.equal(response.status, 404);
  });

  it('forbids a member from deleting a workflow', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${memberToken}`
        }
      }
    );

    assert.equal(response.status, 403);
  });

  it('hides another organization workflow from delete requests', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${otherWorkflowId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 404);

    const stillExists = await Workflow.findById(otherWorkflowId);
    assert.ok(stillExists);
  });

  it('rejects invalid workflow IDs for update and delete', async () => {
    const patchResponse = await fetch(
      `${baseUrl}/api/v1/workflows/not-a-valid-id`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Invalid ID update' })
      }
    );

    const deleteResponse = await fetch(
      `${baseUrl}/api/v1/workflows/not-a-valid-id`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(patchResponse.status, 400);
    assert.equal(deleteResponse.status, 400);
  });

  it('allows an owner to delete a workflow in their organization', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 204);

    const deletedWorkflow = await Workflow.findOne({
      _id: workflowId,
      organizationId
    });

    assert.equal(deletedWorkflow, null);
  });

  it('returns not found when deleting a workflow that no longer exists', async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/workflows/${workflowId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`
        }
      }
    );

    assert.equal(response.status, 404);
  });
});
