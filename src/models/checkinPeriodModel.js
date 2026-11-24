import mongoose from 'mongoose'

const participantSchema = new mongoose.Schema({
    attendanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance',
        required: true,
    },
    personId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Person',
        default: null,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tipo_cliente: { type: String, enum: ['cliente', 'equipe', null], default: null },
    checkedInAt: { type: Date, required: true },
}, { _id: false })

const checkinPeriodSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Room',
        required: true,
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
    },
    roomName: { type: String, required: true, trim: true, maxlength: 120 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    status: { type: String, enum: ['open', 'closed'], required: true },
    participants: { type: [participantSchema], default: [] },
}, { timestamps: true })

checkinPeriodSchema.index({ tenantId: 1, roomId: 1, startedAt: -1 })

export default mongoose.model('CheckinPeriod', checkinPeriodSchema, 'checkinPeriods')
