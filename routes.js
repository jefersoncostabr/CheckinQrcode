import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { generateQRCodeBuffer } from './scripts/qrCodeService.js'

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Normaliza texto para comparação (remove acentos e espaços extras)
const normalizarTexto = (texto = '') =>
    texto
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()

// Busca o documento de configuração principal (usa um documento único)
async function getConfigDoc() {
    const doc = await lotacaoSala.findOne();
    if (doc) return doc;
    // Cria documento vazio se não existir
    return await lotacaoSala.create({ salas: [], historico: [] });
}

router.get('/', (req, res) => {
    res.send('O servidor funcionando.')
})

router.get('/qtd', async (req, res) => {
    try {
        const sala = req.query.sala
        const resultado = await getConfigDoc()
        const historico = resultado.historico || []

        if (!sala) {
            const total = historico.length
            const salas = {}
            historico.forEach(item => {
                if (!item || !item.sala) return
                salas[item.sala] = (salas[item.sala] || 0) + 1
            })
            return res.json({ sucesso: true, quantidade: total, total, salas })
        }

        const quantidade = historico.filter(item => item.sala === sala).length
        return res.json({ sucesso: true, quantidade, sala })
    } catch (error) {
        console.error('Erro ao buscar quantidade:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar a contagem.' })
    }
})

// Rota de interface: Exibe o botão para confirmar (Evita robôs/previews)
router.get('/add', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checkin.html'))
})

// Nova rota POST que realmente salva os dados (chamada pelo botão)
router.post('/add', async (req, res) => {
    let ip = req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.socket.remoteAddress

    // Normaliza o IP para IPv4 se for localhost ou mapeado
    if (ip === '::1') ip = '127.0.0.1'
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '')

    const { nome, sala } = req.body

    if (!nome) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome é obrigatório.' })
    }

    if (!sala) {
        return res.status(400).json({ sucesso: false, mensagem: 'Sala é obrigatória.' })
    }

    try {
        const docAtual = await getConfigDoc()

        // Valida se a sala existe na configuração
        const salaValida = docAtual.salas?.some(s => normalizarTexto(s) === normalizarTexto(sala))
        if (!salaValida) {
            return res.status(400).json({ sucesso: false, mensagem: 'Sala inválida ou não cadastrada.' })
        }

        const nomeLimpo = normalizarTexto(nome)

        const nomeJaExiste = docAtual.historico?.some(item => {
            return item && item.sala === sala && item.nome && normalizarTexto(item.nome) === nomeLimpo
        })

        if (nomeJaExiste) {
            return res.status(403).json({ sucesso: false, mensagem: 'Este nome já está na lista de presença para esta sala!' })
        }

        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $push: { historico: { nome, ip, data: new Date(), sala } } },
            { new: true, upsert: true }
        )

        const quantidadeSala = resultado.historico.filter(item => item.sala === sala).length

        res.json({ sucesso: true, mensagem: 'Check-in realizado!', novaQuantidade: quantidadeSala })
    } catch (error) {
        console.error('Erro ao adicionar presença:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar o check-in.' })
    }
})

router.delete('/reduce', async (req, res) => {
    const sala = req.query.sala
    if (!sala) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório para reduzir registros.' })
    }

    try {
        const doc = await getConfigDoc()
        const historico = doc.historico || []

        // Encontra o último registro para aquela sala
        const lastIndex = [...historico]
            .reverse()
            .findIndex(item => item?.sala === sala)

        if (lastIndex === -1) {
            return res.status(404).json({ sucesso: false, mensagem: 'Nenhum registro encontrado para esta sala.' })
        }

        // Ajusta o índice para o array original
        const indexToRemove = historico.length - 1 - lastIndex
        historico.splice(indexToRemove, 1)

        await doc.save()

        const quantidadeSala = historico.filter(item => item.sala === sala).length
        res.json({ sucesso: true, mensagem: 'Check-out do último registro realizado com sucesso!', novaQuantidade: quantidadeSala })
    } catch (error) {
        console.error('Erro ao reduzir presença:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar a redução.' })
    }
})

router.delete('/clean', async (req, res) => {
    const sala = req.query.sala
    const limparTudo = req.query.all === 'true' || req.query.tudo === 'true'

    if (!sala && !limparTudo) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório para limpar registros (use all=true para limpar tudo).' })
    }

    try {
        if (limparTudo) {
            await lotacaoSala.findOneAndUpdate({}, { $set: { historico: [] } }, { new: true, upsert: true })
            return res.json({ sucesso: true, mensagem: 'Histórico limpo!', novaQuantidade: 0 })
        }

        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $pull: { historico: { sala } } },
            { new: true, upsert: true }
        )
        const novaQuantidade = resultado?.historico?.filter(item => item.sala === sala).length || 0
        res.json({ sucesso: true, mensagem: `Histórico da sala "${sala}" limpo!`, novaQuantidade })
    } catch (error) {
        console.error('Erro ao limpar histórico:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao limpar o histórico.' })
    }
})

router.get('/resetls', (req, res) => {
    res.send(`
        <script>
            // Limpa todo o armazenamento local do navegador para este site
            localStorage.clear();
            alert('Memória do dispositivo limpa! Você pode realizar o check-in novamente.');
            // Redireciona de volta para a página de check-in
            window.location.href = '/add';
        </script>
    `)
})

// Nova rota de API para fornecer os dados do relatório em JSON
router.get('/api/relatorio', async (req, res) => {
    try {
        const sala = req.query.sala
        const resultado = await getConfigDoc()
        const historico = resultado.historico || []
        const filtrado = sala ? historico.filter(item => item.sala === sala) : historico
        res.json(filtrado)
    } catch (error) {
        console.error('Erro ao buscar dados para o relatório:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar os dados do relatório.' })
    }
})

// API de salas (configuração)
router.get('/api/salas', async (req, res) => {
    try {
        const doc = await getConfigDoc()
        res.json({ sucesso: true, salas: doc.salas || [] })
    } catch (error) {
        console.error('Erro ao buscar salas:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar as salas.' })
    }
})

router.post('/api/salas', async (req, res) => {
    const { sala } = req.body
    if (!sala || typeof sala !== 'string' || !sala.trim()) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome da sala é obrigatório.' })
    }

    try {
        const doc = await getConfigDoc()
        const salaLimpa = sala.trim()
        const jaExiste = doc.salas?.some(s => normalizarTexto(s) === normalizarTexto(salaLimpa))
        if (jaExiste) {
            return res.status(409).json({ sucesso: false, mensagem: 'Sala já existe.' })
        }
        doc.salas.push(salaLimpa)
        await doc.save()
        res.json({ sucesso: true, salas: doc.salas })
    } catch (error) {
        console.error('Erro ao criar sala:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar a sala.' })
    }
})

router.delete('/api/salas', async (req, res) => {
    const sala = req.query.sala || req.body?.sala
    if (!sala) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome da sala é obrigatório para exclusão.' })
    }

    try {
        const doc = await getConfigDoc()
        const salaLimpa = sala.trim()
        const novasSalas = (doc.salas || []).filter(s => normalizarTexto(s) !== normalizarTexto(salaLimpa))
        doc.salas = novasSalas
        await doc.save()
        res.json({ sucesso: true, salas: doc.salas })
    } catch (error) {
        console.error('Erro ao remover sala:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover a sala.' })
    }
})

// Rota de interface: Exibe a página de relatório estática
router.get('/relatorio', (req, res) => {
    // O arquivo HTML agora busca os dados dinamicamente da /api/relatorio
    res.sendFile(path.join(__dirname, 'public', 'relatorio.html'))
})

// Rota para gerar o QR Code e retornar como Data URI, chamada pelo painel ADM
router.get('/adm/gerar-qrcode', async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const sala = req.query.sala
    if (!sala) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório para gerar QR Code.' })
    }

    const checkinUrl = `${baseUrl}/add?sala=${encodeURIComponent(sala)}`

    try {
        const qrCodeBuffer = await generateQRCodeBuffer(checkinUrl)
        const qrCodeDataUri = `data:image/png;base64,${qrCodeBuffer.toString('base64')}`

        res.json({
            sucesso: true,
            mensagem: 'QR Code gerado com sucesso!',
            url: checkinUrl,
            qrCodeDataUri: qrCodeDataUri,
        })
    } catch (error) {
        console.error('Erro ao gerar QR Code via painel ADM:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Falha ao gerar o QR Code.' })
    }
})

// Rota para o ADM adicionar presença manualmente (interface visual)
router.get('/adm/adicionar-manual', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admAdd.html'))
})

// Rota de interface: Exibe a página de administração
router.get('/adm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adm.html'))
})

export default router