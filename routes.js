import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'

const router = express.Router()

router.get('/', (req, res) => {
    res.send('O servidor funcionando.')
})

router.get('/qtd', async (req, res) => {
    try {
        const resultado = await lotacaoSala.findOne()
        const quantidade = resultado?.historico?.length || 0
        res.json({ sucesso: true, quantidade })
    } catch (error) {
        console.error("Erro ao buscar quantidade:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao buscar a contagem." })
    }
})

// Mantido como GET para funcionar ao abrir o link direto no navegador (QR Code)
router.get('/add', async (req, res) => {
    // Captura o IP real (considerando proxy do Render ou local)
    const ip = req.headers['x-forwarded-for'] 
        ? req.headers['x-forwarded-for'].split(',')[0].trim() 
        : req.socket.remoteAddress

    try {
        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $push: { historico: ip } },
            { new: true, upsert: true }
        )
        res.json({ sucesso: true, mensagem: "Check-in realizado!", novaQuantidade: resultado.historico.length })
    } catch (error) {
        console.error("Erro ao adicionar presença:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao processar o check-in." })
    }
})

router.get('/reduce', async (req, res) => {
    try {
        const resultado = await lotacaoSala.findOneAndUpdate(
            { "historico.0": { $exists: true } }, // Só reduz se a lista não estiver vazia
            { $pop: { historico: 1 } }, // Remove o último item da lista
            { new: true }
        )
        // Se resultado for null (lista já estava vazia), a quantidade é 0.
        const novaQuantidade = resultado?.historico?.length || 0
        res.json({ sucesso: true, mensagem: "Check-out do ultimo registro realizado com sucesso!", novaQuantidade })
    } catch (error) {
        console.error("Erro ao reduzir presença:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao processar a redução." })
    }
})

router.post('/clean', async (req, res) => {
    try {
        await lotacaoSala.findOneAndUpdate({}, { $set: { historico: [] } }, { new: true, upsert: true })
        res.json({ sucesso: true, mensagem: "Histórico limpo!", novaQuantidade: 0 })
    } catch (error) {
        console.error("Erro ao limpar histórico:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao limpar o histórico." })
    }
})

export default router