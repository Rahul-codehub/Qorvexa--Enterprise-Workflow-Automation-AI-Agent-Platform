import { Schema, model } from 'mongoose';

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 80 }
}, { timestamps: true });

export const Organization = model('Organization', organizationSchema);
