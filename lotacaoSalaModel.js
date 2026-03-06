// comentário teste(remover)
import mongoose from 'mongoose'

const lotacaoSalaSchema = new mongoose.Schema({
    // Lista de salas configuradas para o evento
    salas: {
        type: [String],
        default: [],
    },
    historico: [{
        nome: { type: String, required: true },
        ip: { type: String, required: true },
        data: { type: Date, default: Date.now },
        sala: { type: String }
    }]
})

export default mongoose.model('LotacaoSala', lotacaoSalaSchema, 'lotacaoSala')