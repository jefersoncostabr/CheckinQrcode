import mongoose from 'mongoose'

const qrCodeSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
    tokenHash: { type: String, required: true, unique: true, select: false },
    status: { type: String, enum: ['available', 'active', 'revoked'], default: 'available' },
}, { timestamps: true })

qrCodeSchema.index({ tenantId: 1, status: 1 })
qrCodeSchema.index({ tenantId: 1, roomId: 1 })

export default mongoose.model('QrCode', qrCodeSchema, 'qrCodes')
