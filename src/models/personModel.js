import mongoose from 'mongoose'

const personSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameKey: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
}, { timestamps: true })

personSchema.index({ tenantId: 1, email: 1 }, {
    unique: true,
    partialFilterExpression: { email: { $type: 'string' } },
})
personSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true })
personSchema.index({ tenantId: 1, userId: 1 }, {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
})

export default mongoose.model('Person', personSchema, 'people')
