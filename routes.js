import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { requireAuth } from './middleware/auth.js'
import {
    criarQrDisponivel,
    encontrarQr,
    encontrarSala,
    encontrarSalaPorId,
    encontrarSalaPorNome,
    getConfigDoc,
    LIMITE_QRCODES,
    normalizarTexto,
    serializarSala,
} from './salasService.js'

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

function pertenceSala(registro, sala) {
    return Number(registro.salaId) === Number(sala.id) ||
        (!registro.salaId && normalizarTexto(registro.sala) === normalizarTexto(sala.nome))
}

async function registrarPresenca(req, res, manual = false) {
    const nome = String(req.body.nome || '').trim()
    const salaId = req.body.salaId
    const nomeSalaLegada = req.body.sala
    if (!nome) return res.status(400).json({ sucesso: false, mensagem: 'Nome é obrigatório.' })
    if (salaId == null && !nomeSalaLegada) {
        return res.status(400).json({ sucesso: false, mensagem: 'Sala é obrigatória.' })
    }

    try {
        const doc = await getConfigDoc()
        const sala = salaId != null
            ? encontrarSalaPorId(doc, salaId)
            : encontrarSalaPorNome(doc, nomeSalaLegada)
        if (!sala) {
            return res.status(404).json({ sucesso: false, mensagem: 'Sala não cadastrada. Fale com a administração.' })
        }
        if (!manual && sala.aberta === false) {
            return res.status(403).json({ sucesso: false, mensagem: 'Esta sala está fechada para check-in pelo QR Code.' })
        }

        const nomeLimpo = normalizarTexto(nome)
        const duplicado = (doc.historico || []).some(item =>
            pertenceSala(item, sala) && item.nome && normalizarTexto(item.nome) === nomeLimpo
        )
        if (duplicado) {
            return res.status(403).json({ sucesso: false, mensagem: 'Este nome já está na lista de presença para esta sala!' })
        }

        let ip = req.headers['x-forwarded-for']
            ? req.headers['x-forwarded-for'].split(',')[0].trim()
            : req.socket.remoteAddress
        if (ip === '::1') ip = '127.0.0.1'
        if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '')

        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $push: { historico: { nome, ip, data: new Date(), sala: sala.nome, salaId: sala.id } } },
            { new: true, upsert: true }
        )
        const quantidadeSala = resultado.historico.filter(item => pertenceSala(item, sala)).length
        return res.json({ sucesso: true, mensagem: 'Check-in realizado!', novaQuantidade: quantidadeSala })
    } catch (error) {
        console.error('Erro ao adicionar presença:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar o check-in.' })
    }
}

router.get('/', (req, res) => {
    res.send('O servidor funcionando.')
})

// Autenticação
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'))
})

router.post('/login', (req, res) => {
    const user = (req.body.user || '').toString().trim()
    const pass = (req.body.pass || '').toString().trim()

    const expectedUser = process.env.ADMIN_USER
    const expectedPass = process.env.ADMIN_PASS

    if (!expectedUser || !expectedPass) {
        return res.status(500).send('Admin credentials not configured (ADMIN_USER / ADMIN_PASS).')
    }

    if (user === expectedUser && pass === expectedPass) {
        req.session.user = { username: user }
        return res.redirect('/adm')
    }

    return res.redirect('/login?error=1')
})

router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login?loggedout=1')
    })
})

router.get('/qtd', async (req, res) => {
    try {
        const referencia = req.query.sala
        const resultado = await getConfigDoc()
        const historico = resultado.historico || []

        if (!referencia) {
            const total = historico.length
            const salas = {}
            historico.forEach(item => {
                if (!item || !item.sala) return
                salas[item.sala] = (salas[item.sala] || 0) + 1
            })
            return res.json({ sucesso: true, quantidade: total, total, salas })
        }

        const sala = encontrarSala(resultado, referencia)
        if (!sala) return res.json({ sucesso: true, quantidade: 0, sala: referencia })
        const quantidade = historico.filter(item => pertenceSala(item, sala)).length
        return res.json({ sucesso: true, quantidade, sala: sala.nome, salaId: sala.id })
    } catch (error) {
        console.error('Erro ao buscar quantidade:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar a contagem.' })
    }
})

// Rota de interface: Exibe o botão para confirmar (Evita robôs/previews)
router.get('/add', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checkin.html'))
})

router.get('/api/checkin/sala', async (req, res) => {
    try {
        const doc = await getConfigDoc()
        const sala = req.query.id != null
            ? encontrarSalaPorId(doc, req.query.id)
            : encontrarSalaPorNome(doc, req.query.sala)
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não cadastrada. Fale com a administração.' })
        if (sala.aberta === false) return res.status(403).json({ sucesso: false, mensagem: 'Esta sala está fechada para check-in pelo QR Code.' })
        return res.json({ sucesso: true, sala: serializarSala(sala) })
    } catch (error) {
        console.error('Erro ao validar sala do QR Code:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao consultar a sala.' })
    }
})

router.post('/add', (req, res) => registrarPresenca(req, res))

router.delete('/reduce', requireAuth, async (req, res) => {
    const referencia = req.query.sala
    if (!referencia) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório para reduzir registros.' })
    }

    try {
        const doc = await getConfigDoc()
        const sala = encontrarSala(doc, referencia)
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        const historico = doc.historico || []

        const lastIndex = [...historico]
            .reverse()
            .findIndex(item => pertenceSala(item, sala))

        if (lastIndex === -1) {
            return res.status(404).json({ sucesso: false, mensagem: 'Nenhum registro encontrado para esta sala.' })
        }

        // Ajusta o índice para o array original
        const indexToRemove = historico.length - 1 - lastIndex
        historico.splice(indexToRemove, 1)

        await doc.save()

        const quantidadeSala = historico.filter(item => pertenceSala(item, sala)).length
        res.json({ sucesso: true, mensagem: 'Check-out do último registro realizado com sucesso!', novaQuantidade: quantidadeSala })
    } catch (error) {
        console.error('Erro ao reduzir presença:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar a redução.' })
    }
})

router.delete('/clean', requireAuth, async (req, res) => {
    const referencia = req.query.sala
    const limparTudo = req.query.all === 'true' || req.query.tudo === 'true'

    if (!referencia && !limparTudo) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório para limpar registros (use all=true para limpar tudo).' })
    }

    try {
        if (limparTudo) {
            await lotacaoSala.findOneAndUpdate({}, { $set: { historico: [] } }, { new: true, upsert: true })
            return res.json({ sucesso: true, mensagem: 'Histórico limpo!', novaQuantidade: 0 })
        }

        const doc = await getConfigDoc()
        const sala = encontrarSala(doc, referencia)
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        const historicoAntes = doc.historico || []
        doc.historico = historicoAntes.filter(item => !pertenceSala(item, sala))
        const registrosRemovidos = historicoAntes.length - doc.historico.length
        await doc.save()
        res.json({ sucesso: true, mensagem: `Histórico da sala "${sala.nome}" limpo!`, novaQuantidade: 0, registrosRemovidos })
    } catch (error) {
        console.error('Erro ao limpar histórico:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao limpar o histórico.' })
    }
})

// Rota para resetar o localStorage do navegador (interface)
router.get('/resetls', requireAuth, (req, res) => {
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
router.get('/api/relatorio', requireAuth, async (req, res) => {
    try {
        const referencia = req.query.sala
        const resultado = await getConfigDoc()
        const historico = resultado.historico || []
        const sala = referencia ? encontrarSala(resultado, referencia) : null
        const filtrado = referencia
            ? (sala ? historico.filter(item => pertenceSala(item, sala)) : [])
            : historico
        res.json(filtrado.map(item => {
            const registro = item.toObject ? item.toObject() : item
            const salaRegistro = registro.salaId
                ? encontrarSalaPorId(resultado, registro.salaId)
                : encontrarSalaPorNome(resultado, registro.sala)
            return { ...registro, salaId: registro.salaId || salaRegistro?.id || null }
        }))
    } catch (error) {
        console.error('Erro ao buscar dados para o relatório:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar os dados do relatório.' })
    }
})

// API de salas (configuração)
router.get('/api/salas', requireAuth, async (req, res) => {
    try {
        const doc = await getConfigDoc()
        res.json({ sucesso: true, salas: (doc.salas || []).map(serializarSala) })
    } catch (error) {
        console.error('Erro ao buscar salas:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar as salas.' })
    }
})

router.post('/api/salas', requireAuth, async (req, res) => {
    const { sala, qrId } = req.body
    if (!sala || typeof sala !== 'string' || !sala.trim()) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome da sala é obrigatório.' })
    }

    try {
        const doc = await getConfigDoc()
        const salaLimpa = sala.trim()
        const jaExiste = doc.salas?.some(s => normalizarTexto(s.nome) === normalizarTexto(salaLimpa))
        if (jaExiste) {
            return res.status(409).json({ sucesso: false, mensagem: 'Sala já existe.' })
        }
        let qr = qrId ? encontrarQr(doc, qrId) : null
        if (qrId && (!qr || qr.estado !== 'disponivel')) {
            return res.status(409).json({ sucesso: false, mensagem: 'O QR Code selecionado não está disponível.' })
        }
        if (!qr && (doc.qrcodes || []).some(item => item.estado === 'disponivel')) {
            return res.status(400).json({ sucesso: false, mensagem: 'Selecione um QR Code disponível.' })
        }
        if (!qr) {
            const ativos = (doc.qrcodes || []).filter(item => item.estado !== 'inativo').length
            if (ativos >= LIMITE_QRCODES) {
                return res.status(409).json({ sucesso: false, mensagem: 'Limite de 10 QR Codes atingido. Exclua um QR disponível antes de cadastrar outra sala.' })
            }
            qr = criarQrDisponivel(doc)
        }
        qr.estado = 'em_uso'
        qr.salaId = qr.id
        doc.salas.push({ id: qr.id, nome: salaLimpa, aberta: true })
        doc.markModified('qrcodes')
        await doc.save()
        res.json({ sucesso: true, salas: doc.salas.map(serializarSala), sala: serializarSala(doc.salas[doc.salas.length - 1]) })
    } catch (error) {
        console.error('Erro ao criar sala:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar a sala.' })
    }
})

router.delete('/api/salas', requireAuth, async (req, res) => {
    const referencia = req.query.sala || req.body?.salaId || req.body?.sala
    if (!referencia) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome da sala é obrigatório para exclusão.' })
    }

    try {
        const doc = await getConfigDoc()
        const sala = encontrarSala(doc, referencia)
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        const historicoAnterior = doc.historico || []
        const historicoAtualizado = historicoAnterior.filter(registro => !pertenceSala(registro, sala))
        const registrosRemovidos = historicoAnterior.length - historicoAtualizado.length

        const qr = encontrarQr(doc, sala.id)
        if (qr) {
            qr.estado = 'inativo'
            qr.salaId = null
            doc.markModified('qrcodes')
        }
        doc.salas = doc.salas.filter(item => Number(item.id) !== Number(sala.id))
        doc.historico = historicoAtualizado
        await doc.save()
        res.json({ sucesso: true, salas: doc.salas.map(serializarSala), registrosRemovidos })
    } catch (error) {
        console.error('Erro ao remover sala:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover a sala.' })
    }
})

router.patch('/api/salas/:id', requireAuth, async (req, res) => {
    if (typeof req.body.aberta !== 'boolean') {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe se a sala deve ficar aberta.' })
    }
    try {
        const doc = await getConfigDoc()
        const sala = encontrarSala(doc, req.params.id)
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        sala.aberta = req.body.aberta
        doc.markModified('salas')
        await doc.save()
        res.json({ sucesso: true, sala: serializarSala(sala) })
    } catch (error) {
        console.error('Erro ao alterar estado da sala:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao alterar o estado da sala.' })
    }
})

router.get('/api/qrcodes', requireAuth, async (req, res) => {
    try {
        const doc = await getConfigDoc()
        const salasPorId = new Map((doc.salas || []).map(sala => [Number(sala.id), sala]))
        const qrcodes = (doc.qrcodes || []).map(qr => ({
            id: qr.id,
            estado: qr.estado,
            sala: salasPorId.get(Number(qr.salaId))?.nome || null,
        }))
        res.json({
            sucesso: true,
            qrcodes,
            limite: LIMITE_QRCODES,
            quantidadeAtiva: qrcodes.filter(qr => qr.estado !== 'inativo').length,
        })
    } catch (error) {
        console.error('Erro ao buscar QR Codes:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar os QR Codes.' })
    }
})

router.post('/api/qrcodes', requireAuth, async (req, res) => {
    try {
        const doc = await getConfigDoc()
        const qr = criarQrDisponivel(doc)
        if (!qr) return res.status(409).json({ sucesso: false, mensagem: 'Limite de 10 QR Codes atingido.' })
        await doc.save()
        res.status(201).json({ sucesso: true, qrcode: { id: qr.id, estado: qr.estado } })
    } catch (error) {
        console.error('Erro ao criar QR Code:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao criar QR Code.' })
    }
})

router.delete('/api/qrcodes/:id', requireAuth, async (req, res) => {
    try {
        const doc = await getConfigDoc()
        const qr = encontrarQr(doc, req.params.id)
        if (!qr) return res.status(404).json({ sucesso: false, mensagem: 'QR Code não encontrado.' })
        if (qr.estado === 'em_uso') {
            return res.status(409).json({ sucesso: false, mensagem: 'QR Code associado a uma sala. Feche ou exclua a sala antes de removê-lo.' })
        }
        if (qr.estado !== 'disponivel') {
            return res.status(409).json({ sucesso: false, mensagem: 'Somente QR Codes disponíveis podem ser excluídos.' })
        }
        doc.qrcodes = doc.qrcodes.filter(item => item.id !== qr.id)
        doc.markModified('qrcodes')
        await doc.save()
        res.json({ sucesso: true })
    } catch (error) {
        console.error('Erro ao excluir QR Code:', error)
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir QR Code.' })
    }
})

// Rota de interface: Exibe a página de relatório estática
router.get('/relatorio', requireAuth, (req, res) => {
    // O arquivo HTML agora busca os dados dinamicamente da /api/relatorio
    res.sendFile(path.join(__dirname, 'public', 'relatorio.html'))
})

// Protege as rotas de administração
router.use('/adm', requireAuth)

// Rota para o ADM adicionar presença manualmente (interface visual)
router.post('/adm/adicionar-manual', requireAuth, (req, res) => registrarPresenca(req, res, true))

router.get('/adm/adicionar-manual', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admAdd.html'))
})

// Rota de interface: Exibe a página de administração
router.get('/adm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adm.html'))
})

export default router