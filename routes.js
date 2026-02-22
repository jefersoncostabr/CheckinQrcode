import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'
import path from 'path'
import { fileURLToPath } from 'url'

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// Rota de interface: Exibe o botão para confirmar (Evita robôs/previews)
router.get('/add', async (req, res) => {
    // Agora, em vez de enviar o HTML como string, enviamos o arquivo físico.
    // O path.join constrói o caminho correto para o arquivo na pasta 'public'.
    res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
})

// Nova rota POST que realmente salva os dados (chamada pelo botão)
router.post('/add', async (req, res) => {
    let ip = req.headers['x-forwarded-for'] 
        ? req.headers['x-forwarded-for'].split(',')[0].trim() 
        : req.socket.remoteAddress
    
    // Normaliza o IP para IPv4 se for localhost ou mapeado
    if (ip === '::1') ip = '127.0.0.1';
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    const { nome } = req.body;

    if (!nome) {
        return res.status(400).json({ sucesso: false, mensagem: "Nome é obrigatório." });
    }

    try {
        // Busca o documento atual para verificar duplicidade de IP
        const docAtual = await lotacaoSala.findOne({});
        
        // Verifica se o IP já existe no histórico (assumindo que agora historico guarda objetos ou strings)
        // A verificação cobre tanto o formato antigo (string) quanto o novo (objeto)
        const jaCheckou = docAtual?.historico?.some(item => (item.ip === ip) || (item === ip));

        if (jaCheckou) {
            return res.status(403).json({ sucesso: false, mensagem: "Você já fez check-in hoje!" });
        }

        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $push: { historico: { nome: nome, ip: ip, data: new Date() } } },
            { new: true, upsert: true }
        )
        res.json({ sucesso: true, mensagem: "Check-in realizado!", novaQuantidade: resultado.historico.length })
    } catch (error) {
        console.error("Erro ao adicionar presença:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao processar o check-in." })
    }
})

router.delete('/reduce', async (req, res) => {
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

router.delete('/clean', async (req, res) => {
    try {
        await lotacaoSala.findOneAndUpdate({}, { $set: { historico: [] } }, { new: true, upsert: true })
        res.json({ sucesso: true, mensagem: "Histórico limpo!", novaQuantidade: 0 })
    } catch (error) {
        console.error("Erro ao limpar histórico:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao limpar o histórico." })
    }
})

export default router