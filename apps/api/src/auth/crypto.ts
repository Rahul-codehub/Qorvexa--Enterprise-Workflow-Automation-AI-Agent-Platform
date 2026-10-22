// import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
// import { promisify } from 'node:util';

// const scrypt = promisify(scryptCallback);

// export type TokenPayload = { sub: string; organizationId: string; role: 'owner' | 'admin' | 'member'; exp: number };

// function encode(value: string) { return Buffer.from(value).toString('base64url'); }

// export async function hashPassword(password: string) {
//   const salt = randomBytes(16).toString('hex');
//   const hash = await scrypt(password, salt, 64) as Buffer;
//   return `${salt}:${hash.toString('hex')}`;
// }

// export async function verifyPassword(password: string, stored: string) {
//   const [salt, expected] = stored.split(':');
//   if (!salt || !expected) return false;
//   const actual = await scrypt(password, salt, 64) as Buffer;
//   return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
// }

// export function createAccessToken(payload: Omit<TokenPayload, 'exp'>, secret: string) {
//   const body = encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }));
//   const signature = createHmac('sha256', secret).update(body).digest('base64url');
//   return `${body}.${signature}`;
// }

// export function verifyAccessToken(token: string, secret: string): TokenPayload | null {
//   const [body, signature] = token.split('.');
//   if (!body || !signature) return null;
//   const expected = createHmac('sha256', secret).update(body).digest('base64url');
//   if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
//   try {
//     const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
//     return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
//   } catch { return null; }
// }



import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export type TokenPayload = {
  sub: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member';
  exp: number;
};

function encode(value: string) {
  return Buffer.from(value).toString('base64url');
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');

  if (
    !salt ||
    !expected ||
    !/^[a-f\d]{32}$/i.test(salt) ||
    !/^[a-f\d]{128}$/i.test(expected)
  ) {
    return false;
  }

  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expected, 'hex');

  return (
    actual.length === expectedBuffer.length &&
    timingSafeEqual(actual, expectedBuffer)
  );
}

export function createAccessToken(
  payload: Omit<TokenPayload, 'exp'>,
  secret: string
) {
  const body = encode(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
    })
  );

  const signature = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

export function verifyAccessToken(
  token: string,
  secret: string
): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;

  try {
    const expected = createHmac('sha256', secret)
      .update(body)
      .digest('base64url');

    const actualSignature = Buffer.from(signature, 'base64url');
    const expectedSignature = Buffer.from(expected, 'base64url');

    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature) ||
      actualSignature.toString('base64url') !== signature
    ) {
      return null;
    }

    const payload: unknown = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    );

    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return null;
    }

    const claims = payload as Record<string, unknown>;

    if (
      typeof claims.sub !== 'string' ||
      !/^[a-f\d]{24}$/i.test(claims.sub) ||
      typeof claims.organizationId !== 'string' ||
      !/^[a-f\d]{24}$/i.test(claims.organizationId) ||
      typeof claims.role !== 'string' ||
      !['owner', 'admin', 'member'].includes(claims.role) ||
      typeof claims.exp !== 'number' ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      sub: claims.sub,
      organizationId: claims.organizationId,
      role: claims.role as TokenPayload['role'],
      exp: claims.exp
    };
  } catch {
    return null;
  }
}
