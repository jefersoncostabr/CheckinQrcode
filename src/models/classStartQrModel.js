import mongoose from 'mongoose'
import { createHash, randomBytes } from 'node:crypto'

const classStartQrSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true,
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        select: false,
    },
    periodRevision: {
        type: Number,
        required: true,
    },
    consumedAt: {
        type: Date,
        default: null,
    },
    expiresAt: {
        type: Date,
        required: true,
    },
}, { timestamps: true })

classStartQrSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
classStartQrSchema.index({ tenantId: 1, classId: 1, consumedAt: 1 })

export function gerarTokenClassStart() {
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    return { token, tokenHash }
}

export default mongoose.model('ClassStartQr', classStartQrSchema, 'classStartQrs')
