
import 'dotenv/config';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { getEnv } from '../src/config/env.js';
import { hashPassword } from '../src/auth/crypto.js';
import { User } from '../src/models/user.js';

const env = getEnv();

const organizationId = '6ad673078f103fe085735f48';
const email = `qorvexa-rbac-member-${randomBytes(6).toString('hex')}@example.com`;
const password = `Test-${randomBytes(16).toString('base64url')}!`;

try {
  await mongoose.connect(env.MONGODB_URI);

  const existingOwner = await User.findOne({
    _id: '6ad673078f103fe085735f4a',
    organizationId,
    role: 'owner'
  }).select('_id');

  if (!existingOwner) {
    throw new Error('Test owner not found in the expected organization.');
  }

  const member = await User.create({
    organizationId,
    name: 'Qorvexa RBAC Test Member',
    email,
    passwordHash: await hashPassword(password),
    role: 'member'
  });

  console.log(JSON.stringify({
    email,
    password,
    userId: String(member._id),
    role: member.role
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
