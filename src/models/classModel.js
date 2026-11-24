import mongoose from 'mongoose'

const classSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    startTime: {
        type: String,
        trim: true,
        maxlength: 5,
        default: null,
    },
    endTime: {
        type: String,
        trim: true,
        maxlength: 5,
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    qrRevision: { type: Number, default: 0 },
}, { timestamps: true })

classSchema.index({ tenantId: 1, createdAt: -1 })

export default mongoose.model('Class', classSchema, 'classes')
