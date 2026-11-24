import mongoose from 'mongoose'
import { createHash } from 'node:crypto'
import Class from '../models/classModel.js'
import User from '../models/userModel.js'
import Room from '../models/roomModel.js'
import CheckinPeriod from '../models/checkinPeriodModel.js'
import ClassStartQr, { gerarTokenClassStart } from '../models/classStartQrModel.js'

export class TenantClassError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantClassError'
        this.statusCode = statusCode
    }
}

function validarId(id, nome) {
    if (!mongoose.isValidObjectId(id)) {
        throw new TenantClassError(`${nome} inválido.`, 400)
    }
    return id
}

function validarHorario(time, nome, obrigatorio = false) {
    if (time == null || time === '') {
        if (obrigatorio) throw new TenantClassError(`${nome} é obrigatório.`, 400)
        return null
    }
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        throw new TenantClassError(`${nome} deve estar no formato HH:mm.`, 400)
    }
    return time
}

function serializarAula(
    aula,
    roomName = null,
    status = null,
    periodoId = null,
    roomId = null,
    professor = null,
) {
    const criador = professor || aula.createdBy || null
    const professorId = criador?._id || (
        criador && typeof criador !== 'object' ? criador : null
    )

    return {
        id: String(aula._id),
        name: aula.name,
        startTime: aula.startTime || null,
        endTime: aula.endTime || null,
        professorId: professorId ? String(professorId) : null,
        professorNome: typeof criador?.name === 'string' ? criador.name : null,
        roomId: roomId ? String(roomId) : null,
        roomName,
        status,
        periodoId: periodoId ? String(periodoId) : null,
        criadaEm: aula.createdAt,
        atualizadaEm: aula.updatedAt,
    }
}

export async function cadastrarAulaDoTenant(tenantId, createdBy, { name, startTime, endTime }) {
    validarId(tenantId, 'Organização')
    validarId(createdBy, 'Usuário')

    if (typeof name !== 'string' || !name.trim()) {
        throw new TenantClassError('O nome da aula é obrigatório.', 400)
    }
    if (name.trim().length > 120) {
        throw new TenantClassError('O nome da aula deve ter no máximo 120 caracteres.', 400)
    }

    const inicio = validarHorario(startTime, 'Horário de início', true)
    const fim = validarHorario(endTime, 'Horário de fim', true)
    if (fim === inicio) {
        throw new TenantClassError('O horário de fim deve ser posterior ao início.', 400)
    }

    const professor = await User.findById(createdBy)
        .select('_id name status')
        .lean()

    if (!professor || professor.status !== 'active') {
        throw new TenantClassError('Professor associado não encontrado ou inativo.', 403)
    }

    const aula = await Class.create({
        tenantId,
        name: name.trim(),
        startTime: inicio,
        endTime: fim,
        createdBy,
    })

    return serializarAula(aula, null, null, null, null, professor)
}

export async function listarAulasDoTenant(tenantId) {
    validarId(tenantId, 'Organização')

    const aulas = await Class.find({ tenantId })
        .populate({ path: 'createdBy', select: 'name status' })
        .sort({ createdAt: -1 })
        .lean()

    if (aulas.length === 0) return []

    const classIds = aulas.map(aula => aula._id)
    const periodosAbertos = await CheckinPeriod.find({
        tenantId,
        classId: { $in: classIds },
        status: 'open',
    }).lean()
    const roomIds = [...new Set(periodosAbertos.map(periodo => periodo.roomId))]
    const salas = roomIds.length
        ? await Room.find({ tenantId, _id: { $in: roomIds } }).lean()
        : []
    const salasPorId = new Map(salas.map(sala => [String(sala._id), sala]))
    const periodoPorClasse = new Map()
    for (const periodo of periodosAbertos) {
        const sala = salasPorId.get(String(periodo.roomId))
        if (sala?.status === 'open' && String(sala.currentPeriodId) === String(periodo._id)) {
            periodoPorClasse.set(String(periodo.classId), { periodo, sala })
        }
    }

    return aulas.map(aula => {
        const atividade = periodoPorClasse.get(String(aula._id))
        return serializarAula(
            aula,
            atividade?.sala.name || null,
            atividade ? 'open' : 'closed',
            atividade ? atividade.periodo._id : null,
            atividade ? atividade.sala._id : null,
        )
    })
}

export async function iniciarAulaDoTenant(tenantId, classId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(classId, 'Aula')
    validarId(roomId, 'Sala')

    const session = await mongoose.startSession()
    let resultado
    try {
        resultado = await session.withTransaction(async () => {
            const aula = await Class.findOne({
                _id: classId,
                tenantId,
            }).session(session).lean()
            if (!aula) {
                throw new TenantClassError('Aula não encontrada.', 404)
            }

            const periodoAulaAberto = await CheckinPeriod.findOne({
                tenantId,
                classId: aula._id,
                status: 'open',
            }).session(session).lean()
            if (periodoAulaAberto) {
                throw new TenantClassError('Esta aula já possui um período aberto.', 409)
            }

            const sala = await Room.findOne({
                _id: roomId,
                tenantId,
                status: { $ne: 'archived' },
            }).session(session).lean()
            if (!sala) {
                throw new TenantClassError('Sala não encontrada ou arquivada.', 404)
            }

            if (sala.status === 'open') {
                throw new TenantClassError(
                    'A sala já está aberta. Encerre o período atual antes de iniciar outra aula.',
                    409,
                )
            }

            const startedAt = new Date()
            const [periodo] = await CheckinPeriod.create([{
                tenantId,
                roomId: sala._id,
                classId: aula._id,
                roomName: sala.name,
                startedAt,
                status: 'open',
            }], { session })

            const salaAberta = await Room.findOneAndUpdate(
                { _id: sala._id, tenantId, status: 'closed', periodRevision: sala.periodRevision },
                {
                    $set: {
                        status: 'open',
                        currentPeriodId: periodo._id,
                        legacyPeriod: false,
                    },
                    $inc: { periodRevision: 1 },
                },
                { session, returnDocument: 'after' },
            ).lean()
            if (!salaAberta) throw new TenantClassError('A sala foi alterada. Tente novamente.', 409)

            await ClassStartQr.deleteMany({ tenantId, classId: aula._id }, { session })

            return {
                aula,
                sala: salaAberta,
                periodoId: String(periodo._id),
            }
        })
    } catch (error) {
        throw error
    } finally {
        await session.endSession()
    }

    return {
        aula: serializarAula(
            resultado.aula,
            resultado.sala.name,
            resultado.sala.status,
            resultado.periodoId,
            resultado.sala._id,
        ),
        sala: {
            id: String(resultado.sala._id),
            nome: resultado.sala.name,
            status: resultado.sala.status,
        },
        periodoId: resultado.periodoId,
    }
}

export async function encerrarAulaDoTenant(tenantId, classId) {
    validarId(tenantId, 'Organização')
    validarId(classId, 'Aula')

    const session = await mongoose.startSession()
    let resultado
    try {
        resultado = await session.withTransaction(async () => {
            const aula = await Class.findOne({
                _id: classId,
                tenantId,
            }).session(session).lean()
            if (!aula) {
                throw new TenantClassError('Aula não encontrada.', 404)
            }

            const periodos = await CheckinPeriod.find({
                tenantId,
                classId: aula._id,
                status: 'open',
            }).session(session).lean()
            if (periodos.length !== 1) {
                throw new TenantClassError(
                    'A aula não possui exatamente um período aberto para encerrar.',
                    409,
                )
            }
            const periodo = periodos[0]
            const sala = await Room.findOne({
                _id: periodo.roomId,
                tenantId,
                status: 'open',
                currentPeriodId: periodo._id,
            }).session(session).lean()
            if (!sala) throw new TenantClassError('O período da aula não está mais ativo nesta sala.', 409)

            const periodoFechado = await CheckinPeriod.findOneAndUpdate(
                { _id: periodo._id, tenantId, roomId: sala._id, classId: aula._id, status: 'open' },
                { $set: { endedAt: new Date(), status: 'closed' } },
                { session },
            )
            if (!periodoFechado) throw new TenantClassError('O período da aula já foi encerrado.', 409)

            const salaFechada = await Room.findOneAndUpdate(
                { _id: sala._id, tenantId, status: 'open', currentPeriodId: periodo._id },
                { $set: { status: 'closed' }, $inc: { periodRevision: 1 } },
                { session, returnDocument: 'after' },
            ).lean()
            if (!salaFechada) throw new TenantClassError('O período da sala mudou. Tente novamente.', 409)

            await ClassStartQr.deleteMany({ tenantId, classId: aula._id }, { session })

            return {
                aula,
                sala: salaFechada,
                periodoId: String(sala.currentPeriodId),
            }
        })
    } catch (error) {
        throw error
    } finally {
        await session.endSession()
    }

    return {
        aula: serializarAula(
            resultado.aula,
            resultado.sala.name,
            resultado.sala.status,
            null,
            resultado.sala._id,
        ),
        sala: {
            id: String(resultado.sala._id),
            nome: resultado.sala.name,
            status: resultado.sala.status,
        },
        periodoId: resultado.periodoId,
    }
}

export async function gerarQrStartClassDoTenant(tenantId, classId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(classId, 'Aula')
    validarId(roomId, 'Sala')

    const session = await mongoose.startSession()
    let resultado
    try {
        resultado = await session.withTransaction(async () => {
            const aula = await Class.findOne({
                _id: classId,
                tenantId,
            }).session(session).lean()
            if (!aula) {
                throw new TenantClassError('Aula não encontrada.', 404)
            }

            const periodoAulaAberto = await CheckinPeriod.findOne({
                tenantId,
                classId: aula._id,
                status: 'open',
            }).session(session).lean()
            if (periodoAulaAberto) {
                throw new TenantClassError('Esta aula já possui um período aberto.', 409)
            }

            const sala = await Room.findOne({
                _id: roomId,
                tenantId,
                status: { $ne: 'archived' },
            }).session(session).lean()
            if (!sala) {
                throw new TenantClassError('Sala não encontrada ou arquivada.', 404)
            }

            if (sala.status === 'open') {
                throw new TenantClassError('A sala já está aberta.', 409)
            }

            const { token, tokenHash } = gerarTokenClassStart()
            const expiresAt = new Date(Date.now() + 2 * 60 * 1000)

            await Class.findOneAndUpdate(
                { _id: aula._id, tenantId },
                { $inc: { qrRevision: 1 } },
                { session },
            )
            await ClassStartQr.deleteMany({ tenantId, classId: aula._id }, { session })

            const qr = await ClassStartQr.create([{
                tenantId,
                classId: aula._id,
                roomId: sala._id,
                tokenHash,
                periodRevision: sala.periodRevision,
                expiresAt,
            }], { session })

            return {
                token,
                tokenHash,
                expiresAt,
                sala,
                aula,
                qrId: String(qr[0]._id),
            }
        })
    } catch (error) {
        throw error
    } finally {
        await session.endSession()
    }

    return {
        token: resultado.token,
        expiresAt: resultado.expiresAt,
        sala: {
            id: String(resultado.sala._id),
            nome: resultado.sala.name,
            status: resultado.sala.status,
        },
        aula: {
            id: String(resultado.aula._id),
            name: resultado.aula.name,
        },
    }
}

export async function consumirQrStartClassDoTenant(tenantId, token) {
    validarId(tenantId, 'Organização')
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new TenantClassError('Token inválido.', 400)
    }

    const tokenHash = createHash('sha256').update(token).digest('hex')

    const session = await mongoose.startSession()
    let resultado
    try {
        resultado = await session.withTransaction(async () => {
            const qr = await ClassStartQr.findOne({
                tokenHash,
                tenantId,
                consumedAt: null,
            }).session(session).lean()
            if (!qr) {
                throw new TenantClassError(
                    'QR Code de abertura inválido, expirado ou já utilizado.',
                    403,
                )
            }

            if (new Date(qr.expiresAt) <= new Date()) {
                throw new TenantClassError('QR Code de abertura expirado.', 403)
            }

            const aula = await Class.findOne({
                _id: qr.classId,
                tenantId,
            }).session(session).lean()
            if (!aula) {
                throw new TenantClassError('Aula associada não encontrada.', 404)
            }

            const periodoAulaAberto = await CheckinPeriod.findOne({
                tenantId,
                classId: aula._id,
                status: 'open',
            }).session(session).lean()
            if (periodoAulaAberto) {
                throw new TenantClassError('Esta aula já possui um período aberto.', 409)
            }

            const sala = await Room.findOne({
                _id: qr.roomId,
                tenantId,
                status: { $ne: 'archived' },
            }).session(session).lean()
            if (!sala) {
                throw new TenantClassError('Sala associada não encontrada ou arquivada.', 404)
            }

            if (sala.status === 'open') {
                throw new TenantClassError('A sala já está aberta.', 409)
            }

            if (sala.periodRevision !== qr.periodRevision) {
                throw new TenantClassError(
                    'A sala teve seu estado alterado. Gere um novo QR Code.',
                    409,
                )
            }

            const startedAt = new Date()
            const [periodo] = await CheckinPeriod.create([{
                tenantId,
                roomId: sala._id,
                classId: aula._id,
                roomName: sala.name,
                startedAt,
                status: 'open',
            }], { session })

            const salaAberta = await Room.findOneAndUpdate(
                { _id: sala._id, tenantId, status: 'closed', periodRevision: qr.periodRevision },
                {
                    $set: {
                        status: 'open',
                        currentPeriodId: periodo._id,
                        legacyPeriod: false,
                    },
                    $inc: { periodRevision: 1 },
                },
                { session, returnDocument: 'after' },
            ).lean()
            if (!salaAberta) throw new TenantClassError('A sala foi alterada. Gere um novo QR Code.', 409)

            await ClassStartQr.findOneAndUpdate(
                { _id: qr._id, tenantId },
                { $set: { consumedAt: new Date() } },
                { session },
            )

            await ClassStartQr.deleteMany({ tenantId, classId: aula._id }, { session })

            return {
                aula,
                sala: salaAberta,
                periodoId: String(periodo._id),
            }
        })
    } catch (error) {
        throw error
    } finally {
        await session.endSession()
    }

    return {
        aula: serializarAula(
            resultado.aula,
            resultado.sala.name,
            resultado.sala.status,
            resultado.periodoId,
            resultado.sala._id,
        ),
        sala: {
            id: String(resultado.sala._id),
            nome: resultado.sala.name,
            status: resultado.sala.status,
        },
        periodoId: resultado.periodoId,
    }
}
