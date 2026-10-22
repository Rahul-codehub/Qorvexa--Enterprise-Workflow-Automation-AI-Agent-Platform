import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  passwordResetTokenHash: {
  type: String,
  select: false,
},
passwordResetExpiresAt: {
  type: Date,
  select: false,
},
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member', required: true }
}, { timestamps: true });

export const User = model('User', userSchema);
