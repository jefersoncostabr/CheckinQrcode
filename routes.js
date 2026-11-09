import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'
import faceProfile from './faceProfileModel.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
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
const FACE_DESCRIPTOR_LENGTH = 128
const FACE_MATCH_THRESHOLD = 0.48

function validarDescritor(descritor) {
    return Array.isArray(descritor) &&
        descritor.length === FACE_DESCRIPTOR_LENGTH &&
        descritor.every(valor => Number.isFinite(valor) && Math.abs(valor) <= 2)
}

function distanciaFacial(primeiro, segundo) {
    return Math.sqrt(primeiro.reduce((soma, valor, indice) =>
        soma + (valor - segundo[indice]) ** 2, 0))
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex')
}

function pertenceSala(registro, sala) {
    return Number(registro.salaId) === Number(sala.id) ||
        (!registro.salaId && normalizarTexto(registro.sala) === normalizarTexto(sala.nome))
}

async function registrarPresenca(req, res, manual = false, nomeReconhecido = null) {
    const nome = String(nomeReconhecido || req.body.nome || '').trim()
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
        const resposta = { sucesso: true, mensagem: 'Check-in realizado!', novaQuantidade: quantidadeSala }
        if (nomeReconhecido) resposta.nome = nome
        return res.json(resposta)
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

router.get('/teste-rosto', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'face-test.html'))
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

router.post('/api/face/enroll', async (req, res) => {
    const body = req.body || {}
    const nome = String(body.nome || '').trim()
    const { descritor, consentimento } = body
    if (!nome || nome.length > 120) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um nome com até 120 caracteres.' })
    }
    if (consentimento !== true) {
        return res.status(400).json({ sucesso: false, mensagem: 'É necessário consentir com o cadastro facial.' })
    }
    if (!validarDescritor(descritor)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Não foi possível ler o rosto. Tente novamente.' })
    }

    try {
        const perfis = await faceProfile.find().select('+descritor')
        const jaCadastrado = perfis.some(perfil =>
            perfil.descritor?.length === FACE_DESCRIPTOR_LENGTH &&
            distanciaFacial(descritor, perfil.descritor) <= FACE_MATCH_THRESHOLD
        )
        if (jaCadastrado) {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Este rosto já possui cadastro. Use “Fazer check-in com meu rosto”.',
            })
        }

        const tokenExclusao = randomBytes(32).toString('hex')
        const perfilCriado = await faceProfile.create({
            nome,
            descritor,
            tokenExclusaoHash: hashToken(tokenExclusao),
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Rosto cadastrado. Faça o check-in com seu rosto ou digite seu nome.',
            perfilId: perfilCriado.id,
            tokenExclusao,
        })
    } catch (error) {
        console.error('Erro ao cadastrar perfil facial:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar o rosto.' })
    }
})

router.post('/api/face/checkin', async (req, res) => {
    const { descritor } = req.body || {}
    if (!validarDescritor(descritor)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Não foi possível ler o rosto. Tente novamente.' })
    }

    try {
        const perfis = await faceProfile.find().select('+descritor')
        let perfilMaisProximo = null
        let menorDistancia = Number.POSITIVE_INFINITY
        for (const perfil of perfis) {
            if (perfil.descritor?.length !== FACE_DESCRIPTOR_LENGTH) continue
            const distancia = distanciaFacial(descritor, perfil.descritor)
            if (distancia < menorDistancia) {
                menorDistancia = distancia
                perfilMaisProximo = perfil
            }
        }
        if (!perfilMaisProximo || menorDistancia > FACE_MATCH_THRESHOLD) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Rosto não cadastrado. Cadastre-o com consentimento ou faça check-in pelo nome.',
            })
        }
        return registrarPresenca(req, res, false, perfilMaisProximo.nome)
    } catch (error) {
        console.error('Erro ao reconhecer rosto:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao processar o reconhecimento facial.' })
    }
})

router.post('/api/face/verify', async (req, res) => {
    const body = req.body || {}
    const { descritor } = body
    const nomeInformado = Object.hasOwn(body, 'nome')
    const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
    if (!validarDescritor(descritor)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Não foi possível ler o rosto. Tente novamente.' })
    }
    if (nomeInformado && (!nome || nome.length > 120)) {
        return res.status(400).json({ sucesso: false, mensagem: 'O nome deve ter entre 1 e 120 caracteres.' })
    }

    try {
        const perfis = await faceProfile.find().select('+descritor')
        let perfilMaisProximo = null
        let menorDistancia = Number.POSITIVE_INFINITY
        for (const perfil of perfis) {
            if (perfil.descritor?.length !== FACE_DESCRIPTOR_LENGTH) continue
            const distancia = distanciaFacial(descritor, perfil.descritor)
            if (distancia < menorDistancia) {
                menorDistancia = distancia
                perfilMaisProximo = perfil
            }
        }

        const cadastrado = Boolean(perfilMaisProximo && menorDistancia <= FACE_MATCH_THRESHOLD)
        const corresponde = nomeInformado && cadastrado
            ? normalizarTexto(perfilMaisProximo.nome) === normalizarTexto(nome)
            : nomeInformado ? false : null
        return res.json({ sucesso: true, cadastrado, corresponde })
    } catch (error) {
        console.error('Erro ao verificar cadastro facial:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao verificar o cadastro facial.' })
    }
})

router.get('/api/face/pessoas', requireAuth, async (req, res) => {
    try {
        const [doc, perfis] = await Promise.all([
            getConfigDoc(),
            faceProfile.find({}, { nome: 1 }).lean(),
        ])
        const nomesComRosto = new Set(perfis.map(perfil => normalizarTexto(perfil.nome)))
        const pessoasPorNome = new Map()

        for (const registro of doc.historico || []) {
            const nome = String(registro.nome || '').trim()
            const chave = normalizarTexto(nome)
            if (!chave || pessoasPorNome.has(chave)) continue
            pessoasPorNome.set(chave, {
                nome,
                temRosto: nomesComRosto.has(chave),
            })
        }

        const pessoas = [...pessoasPorNome.values()]
            .sort((primeira, segunda) => primeira.nome.localeCompare(segunda.nome, 'pt-BR'))
        return res.json({ sucesso: true, pessoas })
    } catch (error) {
        console.error('Erro ao listar pessoas e cadastros faciais:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao consultar pessoas e cadastros faciais.' })
    }
})

router.delete('/api/face/profile/:id', async (req, res) => {
    const tokenExclusao = req.get('x-face-delete-token')
    if (typeof tokenExclusao !== 'string' || tokenExclusao.length !== 64) {
        return res.status(403).json({ sucesso: false, mensagem: 'Credencial de exclusão inválida.' })
    }

    try {
        const perfil = await faceProfile.findById(req.params.id).select('+tokenExclusaoHash')
        if (!perfil) return res.status(404).json({ sucesso: false, mensagem: 'Cadastro facial não encontrado.' })

        const hashRecebido = Buffer.from(hashToken(tokenExclusao), 'hex')
        const hashArmazenado = Buffer.from(perfil.tokenExclusaoHash, 'hex')
        if (hashRecebido.length !== hashArmazenado.length ||
            !timingSafeEqual(hashRecebido, hashArmazenado)) {
            return res.status(403).json({ sucesso: false, mensagem: 'Credencial de exclusão inválida.' })
        }

        await perfil.deleteOne()
        return res.json({ sucesso: true, mensagem: 'Cadastro facial excluído.' })
    } catch (error) {
        console.error('Erro ao excluir perfil facial:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir o cadastro facial.' })
    }
})

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