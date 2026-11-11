import mongoose from 'mongoose'

const tenantSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
}, { timestamps: true })

export default mongoose.model('Tenant', tenantSchema, 'tenants')
