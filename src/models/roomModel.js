import mongoose from 'mongoose'

const roomSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    activeName: { type: String, select: false },
    status: { type: String, enum: ['open', 'closed', 'archived'], default: 'open' },
}, { timestamps: true })

roomSchema.index(
    { tenantId: 1, activeName: 1 },
    { unique: true, partialFilterExpression: { activeName: { $type: 'string' } } },
)
roomSchema.index({ tenantId: 1, status: 1 })

export default mongoose.model('Room', roomSchema, 'rooms')
