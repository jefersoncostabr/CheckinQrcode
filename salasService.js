import lotacaoSala from './lotacaoSalaModel.js'

export const LIMITE_QRCODES = 10

export const normalizarTexto = (texto = '') => (texto ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

function proximoIdDisponivel(doc) {
    const ids = [
        ...(doc.qrcodes || []).map(qr => Number(qr.id)),
        ...(doc.salas || []).map(sala => Number(sala?.id)),
    ].filter(id => Number.isInteger(id) && id > 0)
    const maiorId = Math.max(0, ...ids)
    doc.proximoQrId = Math.max(Number(doc.proximoQrId) || 1, maiorId + 1)
    return doc.proximoQrId
}

export async function getConfigDoc() {
    let doc = await lotacaoSala.findOne()
    if (!doc) doc = await lotacaoSala.create({ salas: [], qrcodes: [], historico: [], proximoQrId: 1 })

    let alterado = false
    doc.salas = (doc.salas || []).map(sala => {
        if (typeof sala === 'string') {
            alterado = true
            return { nome: sala.trim(), id: null, aberta: true }
        }
        return {
            nome: String(sala?.nome || sala?.sala || '').trim(),
            id: Number.isInteger(Number(sala?.id)) ? Number(sala.id) : null,
            aberta: sala?.aberta !== false,
        }
    }).filter(sala => sala.nome)
    doc.qrcodes = (doc.qrcodes || []).map(qr => ({
        id: Number(qr?.id),
        salaId: qr?.salaId == null ? null : Number(qr.salaId),
        estado: qr?.estado || (qr?.salaId == null ? 'disponivel' : 'em_uso'),
    })).filter(qr => Number.isInteger(qr.id) && qr.id > 0)

    for (const sala of doc.salas) {
        let qr = sala.id ? doc.qrcodes.find(item => item.id === sala.id) : null
        if (!qr) {
            const id = proximoIdDisponivel(doc)
            sala.id = id
            qr = { id, salaId: id, estado: 'em_uso' }
            doc.qrcodes.push(qr)
            alterado = true
        } else {
            sala.id = qr.id
            if (qr.salaId !== qr.id || qr.estado !== 'em_uso') alterado = true
            qr.salaId = qr.id
            qr.estado = 'em_uso'
        }
    }

    for (const registro of doc.historico || []) {
        if (registro.salaId != null) continue
        const sala = doc.salas.find(item => normalizarTexto(item.nome) === normalizarTexto(registro.sala))
        if (sala) {
            registro.salaId = sala.id
            alterado = true
        }
    }

    const proximoAntes = Number(doc.proximoQrId) || 1
    proximoIdDisponivel(doc)
    if (doc.proximoQrId !== proximoAntes) alterado = true

    if (alterado) {
        doc.markModified('salas')
        doc.markModified('qrcodes')
        doc.markModified('historico')
        await doc.save()
    }
    return doc
}

export function encontrarSala(doc, referencia) {
    const valor = String(referencia ?? '').trim()
    if (!valor) return null
    const id = Number(valor)
    const salaPorId = Number.isInteger(id) && id > 0
        ? (doc.salas || []).find(sala => Number(sala.id) === id)
        : null
    if (salaPorId) return salaPorId
    return (doc.salas || []).find(sala => normalizarTexto(sala.nome) === normalizarTexto(valor)) || null
}

export function encontrarSalaPorId(doc, id) {
    const salaId = Number(id)
    return (doc.salas || []).find(sala => Number(sala.id) === salaId) || null
}

export function encontrarSalaPorNome(doc, nome) {
    const nomeNormalizado = normalizarTexto(nome)
    return (doc.salas || []).find(sala => normalizarTexto(sala.nome) === nomeNormalizado) || null
}

export function criarQrDisponivel(doc) {
    const ativos = (doc.qrcodes || []).filter(qr => qr.estado !== 'inativo')
    if (ativos.length >= LIMITE_QRCODES) return null
    const id = proximoIdDisponivel(doc)
    doc.proximoQrId = id + 1
    doc.qrcodes.push({ id, salaId: null, estado: 'disponivel' })
    doc.markModified('qrcodes')
    return doc.qrcodes[doc.qrcodes.length - 1]
}

export function encontrarQr(doc, id) {
    const qrId = Number(id)
    return (doc.qrcodes || []).find(qr => qr.id === qrId) || null
}

export function serializarSala(sala) {
    return { id: sala.id, nome: sala.nome, aberta: sala.aberta !== false }
}
