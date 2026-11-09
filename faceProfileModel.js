import mongoose from 'mongoose'

const faceProfileSchema = new mongoose.Schema({
    nome: { type: String, required: true, trim: true, maxlength: 120 },
    descritor: { type: [Number], required: true, select: false },
    tokenExclusaoHash: { type: String, required: true, select: false },
}, { timestamps: true })

export default mongoose.model('FaceProfile', faceProfileSchema, 'faceProfiles')
