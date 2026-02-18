import mongoose from 'mongoose'

const lotacaoSalaSchema = new mongoose.Schema({
    quantidade: {
        type: Number,
        default: 0
    },
    historico: {
        type: [String],
        default: []
    }
})

export default mongoose.model('LotacaoSala', lotacaoSalaSchema, 'lotacaoSala')