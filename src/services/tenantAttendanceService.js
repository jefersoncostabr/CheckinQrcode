import mongoose from 'mongoose'
import Attendance from '../models/attendanceModel.js'
import Room from '../models/roomModel.js'

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

export async function listarPresencasDoTenant(tenantId, { roomId, page: pageInput } = {}) {
    validarId(tenantId, 'Organização')
    const page = validarPagina(pageInput)
    const filter = { tenantId }

    if (roomId != null) {
        validarId(roomId, 'Sala')
        const room = await Room.exists({ _id: roomId, tenantId })
        if (!room) {
            throw new TenantAttendanceError('Sala não encontrada.', 404)
        }
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
    const attendance = await Attendance.findOneAndDelete({
        _id: attendanceId,
        tenantId,
    }).lean()
    return attendance ? serializarPresenca(attendance, null) : null
}
