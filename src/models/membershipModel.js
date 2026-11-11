import mongoose from 'mongoose'

const membershipSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
        type: String,
        enum: ['owner', 'admin', 'operator', 'viewer'],
        required: true,
    },
    status: { type: String, enum: ['active', 'invited', 'disabled'], default: 'active' },
}, { timestamps: true })

membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true })

export default mongoose.model('Membership', membershipSchema, 'memberships')
