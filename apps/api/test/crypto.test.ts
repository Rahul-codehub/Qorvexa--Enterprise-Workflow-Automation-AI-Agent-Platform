import { requireRole } from '../src/middleware/require-role.js';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';


import assert from 'node:assert/strict';
import {
  createAccessToken,
  verifyAccessToken,
  hashPassword,
  verifyPassword
} from '../src/auth/crypto.js';

const secret = 'test-access-secret-that-is-at-least-32-characters-long';

const validPayload = {
  sub: '507f1f77bcf86cd799439011',
  organizationId: '507f191e810c19729de860ea',
  role: 'owner' as const
};

function createExpiredToken() {
  
  const body = Buffer.from(
    JSON.stringify({
      ...validPayload,
      exp: Math.floor(Date.now() / 1000) - 60
    })
  ).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

describe('Access token verification', () => {
  it('accepts a valid access token', () => {
    const token = createAccessToken(validPayload, secret);
    const result = verifyAccessToken(token, secret);

assert.notEqual(result, null, 'Expected a valid token payload');

if (result === null) {
  throw new Error('Expected a valid token payload');
}

assert.equal(result.sub, validPayload.sub);
assert.equal(result.organizationId, validPayload.organizationId);
assert.equal(result.role, 'owner');
  });

  it('rejects a token signed with a different secret', () => {
    const token = createAccessToken(validPayload, secret);

    assert.equal(
      verifyAccessToken(token, 'a-different-secret-that-is-long-enough'),
      null
    );
  });

  it('rejects a tampered token', () => {
    const token = createAccessToken(validPayload, secret);
    const tampered = `${token.slice(0, -1)}x`;

    assert.equal(verifyAccessToken(tampered, secret), null);
  });

  it('rejects malformed tokens', () => {
    assert.equal(verifyAccessToken('not-a-token', secret), null);
    assert.equal(verifyAccessToken('one.two.three', secret), null);
    assert.equal(verifyAccessToken('', secret), null);
  });

  it('rejects expired tokens', () => {
    assert.equal(verifyAccessToken(createExpiredToken(), secret), null);
  });
});

describe('Password hashing', () => {
  it('verifies the correct password', async () => {
    const password = 'Test-password-123!';
    const hash = await hashPassword(password);

    assert.notEqual(hash, password);
    assert.equal(await verifyPassword(password, hash), true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Correct-password-123!');

    assert.equal(await verifyPassword('Wrong-password-123!', hash), false);
  });

  it('rejects malformed stored hashes', async () => {
    assert.equal(await verifyPassword('some-password', 'invalid'), false);
  });
});


describe('Role-based access control', () => {
  function createMockContext(principal?: { role: string }) {
    let statusCode = 200;
    let responseBody: unknown;
    let nextCalled = false;

    const request = {} as Parameters<ReturnType<typeof requireRole>>[0];

    const response = {
      locals: { principal },
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        responseBody = body;
        return this;
      }
    } as unknown as Parameters<ReturnType<typeof requireRole>>[1];

    const next = (() => {
      nextCalled = true;
    }) as Parameters<ReturnType<typeof requireRole>>[2];

    return {
      request,
      response,
      next,
      getStatus: () => statusCode,
      getBody: () => responseBody,
      wasNextCalled: () => nextCalled
    };
  }

  it('returns 401 when no principal exists', () => {
    const context = createMockContext();
    const middleware = requireRole('owner', 'admin');

    middleware(context.request, context.response, context.next);

    assert.equal(context.getStatus(), 401);
    assert.equal(context.wasNextCalled(), false);
  });

  it('returns 403 when the role is not allowed', () => {
    const context = createMockContext({ role: 'member' });
    const middleware = requireRole('owner', 'admin');

    middleware(context.request, context.response, context.next);

    assert.equal(context.getStatus(), 403);
    assert.equal(context.wasNextCalled(), false);
  });

  it('calls next for an allowed role', () => {
    const context = createMockContext({ role: 'owner' });
    const middleware = requireRole('owner', 'admin');

    middleware(context.request, context.response, context.next);

    assert.equal(context.getStatus(), 200);
    assert.equal(context.wasNextCalled(), true);
  });
});
