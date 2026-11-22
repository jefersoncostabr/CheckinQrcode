import mongoose from 'mongoose'
import Attendance from '../models/attendanceModel.js'
import Room from '../models/roomModel.js'
import {
    adicionarPresencaManualAoUltimoPeriodo,
    removerPresenca,
    limparPresencasDoPeriodo,
} from './checkinPeriodService.js'

const PAGE_SIZE = 100

export class TenantAttendanceError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantAttendanceError'
        this.statusCode = statusCode
    }
}

function validarId(id, nome) {
    if (!mongoose.isValidObjectId(id)) {
        throw new TenantAttendanceError(`${nome} inválido.`, 400)
    }
    return id
}

function validarPagina(pageInput) {
    if (pageInput == null) return 1
    const page = Number(pageInput)
    if (!Number.isInteger(page) || page < 1 || page > 10000) {
        throw new TenantAttendanceError('Página inválida.', 400)
    }
    return page
}

function serializarPresenca(attendance, roomName) {
    return {
        id: String(attendance._id),
        roomId: String(attendance.roomId),
        roomName,
        nome: attendance.personNameSnapshot,
        metodo: attendance.method,
        criadaEm: attendance.createdAt,
    }
}

function normalizarNome(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

function validarNome(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
        throw new TenantAttendanceError('O nome deve ter entre 1 e 120 caracteres.', 400)
    }
    return name.trim()
}

function tratarDuplicidade(error) {
    if (error?.code === 11000) {
        const keyPattern = error.keyPattern || {}
        const isAttendanceIndex =
            keyPattern.tenantId === 1 &&
            keyPattern.roomId === 1 &&
            keyPattern.personNameKey === 1
        if (isAttendanceIndex) {
            throw new TenantAttendanceError(
                'Este nome já está na lista de presença para esta sala.',
                409,
            )
        }
    }
    throw error
}

export async function obterResumoDoTenant(tenantId) {
    validarId(tenantId, 'Organização')
    const rooms = await Room.find({ tenantId, status: { $ne: 'archived' } })
        .select('_id name status currentPeriodId legacyPeriod')
        .sort({ name: 1 })
        .lean()

    const periodoIds = rooms
        .filter(room => room.currentPeriodId)
        .map(room => room.currentPeriodId)

    const counts = new Map()
    if (periodoIds.length > 0) {
        const results = await Attendance.aggregate([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    periodId: { $in: periodoIds },
                },
            },
            { $group: { _id: '$periodId', quantidade: { $sum: 1 } } },
        ])
        for (const result of results) {
            counts.set(String(result._id), result.quantidade)
        }
    }

    return {
        salas: rooms.map(room => ({
            id: String(room._id),
            nome: room.name,
            status: room.status,
            aberta: room.status === 'open',
            quantidade: counts.get(String(room.currentPeriodId)) || 0,
        })),
        total: rooms.reduce(
            (sum, room) => sum + (counts.get(String(room.currentPeriodId)) || 0),
            0,
        ),
    }
}

export async function criarPresencaManualDoTenant(tenantId, { roomId, name, sourceIp } = {}) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')
    const personNameSnapshot = validarNome(name)
    const room = await Room.findOne({
        _id: roomId,
        tenantId,
        status: { $ne: 'archived' },
    }).select('_id name status legacyPeriod currentPeriodId').lean()
    if (!room) {
        throw new TenantAttendanceError('Sala não encontrada.', 404)
    }

    const attendance = {
        _id: new mongoose.Types.ObjectId(),
        tenantId,
        roomId: room._id,
        personId: null,
        personNameSnapshot,
        personNameKey: normalizarNome(personNameSnapshot),
        method: 'manual',
        sourceIp: typeof sourceIp === 'string' ? sourceIp.slice(0, 45) : undefined,
    }

    try {
        await adicionarPresencaManualAoUltimoPeriodo({
            tenantId,
            roomId: room._id,
            attendance,
            personId: null,
            checkedInAt: new Date(),
        })
    } catch (error) {
        tratarDuplicidade(error)
    }
    return { sucesso: true, sala: room.name }
}

export async function removerUltimaPresencaDoTenant(tenantId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')
    const deleted = await removerPresenca({ tenantId, roomId, somenteAtual: true, ultima: true })
    if (!deleted) {
        throw new TenantAttendanceError('Nenhuma presença encontrada nesta sala.', 404)
    }
    return { sucesso: true }
}

export async function limparPresencasDaSalaDoTenant(tenantId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')
    const registrosRemovidos = await limparPresencasDoPeriodo(tenantId, roomId)
    return { sucesso: true, registrosRemovidos }
}

export async function listarPresencasDoTenant(tenantId, { roomId, page: pageInput } = {}) {
    validarId(tenantId, 'Organização')
    const page = validarPagina(pageInput)
    const filter = { tenantId }

    if (roomId != null) {
        validarId(roomId, 'Sala')
        const room = await Room.findOne({ _id: roomId, tenantId })
            .select('_id currentPeriodId legacyPeriod').lean()
        if (!room) {
            throw new TenantAttendanceError('Sala não encontrada.', 404)
        }

        if (!room.currentPeriodId) {
            throw new TenantAttendanceError('Sala sem período corrente. Execute a migração de períodos.', 409)
        }
        filter.periodId = room.currentPeriodId
        filter.roomId = roomId
    }

    const [total, attendances] = await Promise.all([
        Attendance.countDocuments(filter),
        Attendance.find(filter)
            .select('_id roomId personNameSnapshot method createdAt')
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * PAGE_SIZE)
            .limit(PAGE_SIZE)
            .lean(),
    ])
    const roomIds = [...new Set(attendances.map(attendance => String(attendance.roomId)))]
    const rooms = roomIds.length
        ? await Room.find({ tenantId, _id: { $in: roomIds } })
            .select('_id name')
            .lean()
        : []
    const roomsPorId = new Map(rooms.map(room => [String(room._id), room.name]))

    return {
        presencas: attendances.map(attendance =>
            serializarPresenca(attendance, roomsPorId.get(String(attendance.roomId)) || null),
        ),
        paginacao: {
            pagina: page,
            porPagina: PAGE_SIZE,
            total,
            totalPaginas: Math.ceil(total / PAGE_SIZE),
        },
    }
}

export async function gerarRelatorioDePresencasDoTenant(tenantId) {
    validarId(tenantId, 'Organização')
    const resultados = await Attendance.aggregate([
        { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
        {
            $group: {
                _id: '$roomId',
                quantidade: { $sum: 1 },
            },
        },
        { $sort: { quantidade: -1, _id: 1 } },
    ])
    const roomIds = resultados.map(resultado => resultado._id).filter(Boolean)
    const rooms = roomIds.length
        ? await Room.find({ tenantId, _id: { $in: roomIds } })
            .select('_id name')
            .lean()
        : []
    const roomsPorId = new Map(rooms.map(room => [String(room._id), room.name]))
    const salas = resultados.map(resultado => ({
        roomId: resultado._id ? String(resultado._id) : null,
        roomName: roomsPorId.get(String(resultado._id)) || null,
        quantidade: resultado.quantidade,
    }))

    return {
        total: salas.reduce((sum, sala) => sum + sala.quantidade, 0),
        salas,
    }
}

export async function excluirPresencaDoTenant(tenantId, attendanceId) {
    validarId(tenantId, 'Organização')
    validarId(attendanceId, 'Presença')
    const attendance = await Attendance.findOne({
        _id: attendanceId,
        tenantId,
    }).lean()
    if (!attendance) {
        return null
    }

    const deleted = await removerPresenca({ tenantId, roomId: attendance.roomId, attendanceId })
    return deleted ? serializarPresenca(deleted, null) : null
}
