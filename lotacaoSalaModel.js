import mongoose from 'mongoose'

const lotacaoSalaSchema = new mongoose.Schema({
    historico: [{
        nome: { type: String, required: true },
        ip: { type: String, required: true },
        data: { type: Date, default: Date.now }
    }]
})

export default mongoose.model('LotacaoSala', lotacaoSalaSchema, 'lotacaoSala')