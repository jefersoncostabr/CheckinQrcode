import mongoose from 'mongoose'

const lotacaoSalaSchema = new mongoose.Schema({
    salas: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    qrcodes: {
        type: [mongoose.Schema.Types.Mixed],
        default: [],
    },
    proximoQrId: {
        type: Number,
        default: 1,
    },
    historico: [{
        nome: { type: String, required: true },
        ip: { type: String, required: true },
        data: { type: Date, default: Date.now },
        sala: { type: String },
        salaId: { type: Number },
    }]
})

export default mongoose.model('LotacaoSala', lotacaoSalaSchema, 'lotacaoSala')