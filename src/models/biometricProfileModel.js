import mongoose from 'mongoose'

const biometricProfileSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    personId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true },
    descriptor: {
        type: [Number],
        required: true,
        select: false,
        validate: {
            validator: values => values.length === 128 &&
                values.every(value => Number.isFinite(value) && Math.abs(value) <= 2),
            message: 'O descritor biométrico deve conter 128 números válidos.',
        },
    },
    deleteTokenHash: { type: String, required: true, select: false },
    descriptorVersion: { type: String, required: true },
    consent: {
        status: { type: String, enum: ['granted', 'withdrawn'], required: true },
        recordedAt: { type: Date, required: true },
        policyVersion: { type: String, required: true },
    },
    enrolledAt: { type: Date, default: Date.now },
}, { timestamps: true })

biometricProfileSchema.index({ tenantId: 1, personId: 1 }, { unique: true })

export default mongoose.model('BiometricProfile', biometricProfileSchema, 'biometricProfiles')
