import mongoose from 'mongoose'

const attendanceSchema = new mongoose.Schema({
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    personId: { type: mongoose.Schema.Types.ObjectId, ref: 'Person' },
    personNameSnapshot: { type: String, required: true, trim: true, maxlength: 120 },
    personNameKey: { type: String, required: true, trim: true, maxlength: 120 },
    method: { type: String, enum: ['qr', 'face', 'manual'], required: true },
    sourceIp: { type: String, maxlength: 45 },
}, { timestamps: true })

attendanceSchema.index({ tenantId: 1, roomId: 1, createdAt: -1 })
attendanceSchema.index({ tenantId: 1, personId: 1, createdAt: -1 })
attendanceSchema.index({ tenantId: 1, roomId: 1, personNameKey: 1 }, { unique: true })

export default mongoose.model('Attendance', attendanceSchema, 'attendances')
