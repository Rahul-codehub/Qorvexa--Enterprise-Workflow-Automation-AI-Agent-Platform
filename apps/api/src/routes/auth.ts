

import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { createAccessToken, hashPassword, verifyPassword } from '../auth/crypto.js';
import { Organization } from '../models/organization.js';
import { User } from '../models/user.js';

const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must contain at least 2 characters.')
  .max(120, 'Name is too long.')
  .regex(
    /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u,
    'Use letters and normal name separators only.',
  )
  .refine(
    (value) => /[\p{L}\p{N}]/u.test(value),
    'Enter a valid organization name.',
  );

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'Email address is too long.');

const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Organization name must contain at least 2 characters.')
  .max(120, 'Organization name is too long.')
  .refine(
    (value) => /[\p{L}\p{N}]/u.test(value),
    'Enter a valid organization name.',
  );

const registrationSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: z.string().min(12).max(128),
  organizationName: organizationNameSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});


function slugify(name: string) { return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Math.random().toString(36).slice(2, 7)}`; }
function session(user: { _id: unknown; organizationId: unknown; role: 'owner' | 'admin' | 'member'; name: string; email: string }, env: Env) {
  return { accessToken: createAccessToken({ sub: String(user._id), organizationId: String(user.organizationId), role: user.role }, env.JWT_ACCESS_SECRET), user: { id: String(user._id), name: user.name, email: user.email, role: user.role, organizationId: String(user.organizationId) } };
}

export function authRouter(env: Env) {
  const router = Router();
  // Request a password reset.
  // The reset URL is returned only in local development.
  router.post('/forgot-password', async (request, response, next) => {
    try {
      const input = z.object({
        email: emailSchema,
      }).parse(request.body);

      // Don't expose reset tokens in environments without an email provider.
      if (env.NODE_ENV !== 'development') {
        return response.status(503).json({
          error: {
            code: 'PASSWORD_RESET_UNAVAILABLE',
            message: 'Password reset email delivery is not configured.',
          },
        });
      }

      const genericMessage =
        'If an account exists for that email, a reset link is available in development mode.';

      const user = await User.findOne({
        email: input.email,
      });

      // Use the same response message for known and unknown email addresses.
      if (!user) {
        return response.json({ message: genericMessage });
      }

      const resetToken = randomBytes(32).toString('hex');
      const resetTokenHash = createHash('sha256')
        .update(resetToken)
        .digest('hex');

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetTokenHash: resetTokenHash,
            passwordResetExpiresAt: expiresAt,
          },
        },
      );

      const resetUrl = new URL('/', env.WEB_ORIGIN);
      resetUrl.searchParams.set('resetToken', resetToken);

      return response.json({
        message: genericMessage,
        resetUrl: resetUrl.toString(),
      });
    } catch (error) {
      return next(error);
    }
  });

  // Reset the password using a valid, unexpired, one-time token.
  router.post('/reset-password', async (request, response, next) => {
    try {
      const input = z.object({
        token: z.string().min(1).max(256),
        password: z.string().min(12).max(128),
      }).parse(request.body);

      const resetTokenHash = createHash('sha256')
        .update(input.token)
        .digest('hex');

      const passwordHash = await hashPassword(input.password);

      // The expiration check and token removal happen atomically.
      const result = await User.updateOne(
        {
          passwordResetTokenHash: resetTokenHash,
          passwordResetExpiresAt: { $gt: new Date() },
        },
        {
          $set: { passwordHash },
          $unset: {
            passwordResetTokenHash: 1,
            passwordResetExpiresAt: 1,
          },
        },
      );

      if (result.modifiedCount !== 1) {
        return response.status(400).json({
          error: {
            code: 'INVALID_RESET_TOKEN',
            message: 'This reset link is invalid or expired. Request a new one.',
          },
        });
      }

      return response.json({
        message: 'Password reset successfully. You can now sign in.',
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/register', async (request, response, next) => {
    try {
      const input = registrationSchema.parse(request.body);
      if (await User.exists({ email: input.email.toLowerCase() })) return response.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account already exists for this email.' } });
      const organization = await Organization.create({ name: input.organizationName, slug: slugify(input.organizationName) });
      const user = await User.create({ organizationId: organization._id, name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), role: 'owner' });
      response.status(201).json(session(user, env));
    } catch (error) { next(error); }
  });
  router.post('/login', async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body);
      const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      response.json(session(user, env));
    } catch (error) { next(error); }
  });
  return router;
}
