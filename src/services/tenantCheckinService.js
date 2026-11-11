import { createHash } from 'node:crypto'
import Attendance from '../models/attendanceModel.js'
import QrCode from '../models/qrCodeModel.js'
import Room from '../models/roomModel.js'
import Tenant from '../models/tenantModel.js'

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export class TenantCheckinError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantCheckinError'
        this.statusCode = statusCode
    }
}

function hashToken(token) {
    if (typeof token !== 'string' || !QR_TOKEN_PATTERN.test(token)) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    return createHash('sha256').update(token).digest('hex')
}

function normalizarNome(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

export async function obterContextoQr(token) {
    const tokenHash = hashToken(token)
    const qrCode = await QrCode.findOne({ tokenHash, status: 'active' })
        .select('_id tenantId roomId status')
        .lean()
    if (!qrCode?.roomId) {
        return null
    }

    const [tenant, room] = await Promise.all([
        Tenant.findOne({ _id: qrCode.tenantId, status: 'active' })
            .select('_id')
            .lean(),
        Room.findOne({
            _id: qrCode.roomId,
            tenantId: qrCode.tenantId,
            status: { $ne: 'archived' },
        })
            .select('_id name status')
            .lean(),
    ])

    if (!tenant || !room) {
        return null
    }
    return {
        tenantId: qrCode.tenantId,
        room,
    }
}

function serializarSala(room) {
    return {
        id: String(room._id),
        nome: room.name,
    }
}

export async function resolverQrCodeDeCheckin(token) {
    const contexto = await obterContextoQr(token)
    if (!contexto) {
        return null
    }
    return {
        sala: serializarSala(contexto.room),
        aberta: contexto.room.status === 'open',
    }
}

export async function registrarCheckinPorQrTenant({ token, name, sourceIp }) {
    if (typeof name !== 'string') {
        throw new TenantCheckinError('Nome é obrigatório.', 400)
    }
    const personNameSnapshot = name.trim()
    if (!personNameSnapshot || personNameSnapshot.length > 120) {
        throw new TenantCheckinError('O nome deve ter entre 1 e 120 caracteres.', 400)
    }

    const contexto = await obterContextoQr(token)
    if (!contexto) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    if (contexto.room.status !== 'open') {
        throw new TenantCheckinError('Esta sala está fechada para check-in.', 403)
    }

    const personNameKey = normalizarNome(personNameSnapshot)
    const duplicado = await Attendance.exists({
        tenantId: contexto.tenantId,
        roomId: contexto.room._id,
        personNameKey,
    })
    if (duplicado) {
        throw new TenantCheckinError(
            'Este nome já está na lista de presença para esta sala.',
            409,
        )
    }

    try {
        await Attendance.create({
            tenantId: contexto.tenantId,
            roomId: contexto.room._id,
            personNameSnapshot,
            personNameKey,
            method: 'qr',
            sourceIp: typeof sourceIp === 'string' ? sourceIp.slice(0, 45) : undefined,
        })
    } catch (error) {
        if (
            error?.code === 11000 &&
            error.keyPattern?.tenantId &&
            error.keyPattern?.roomId &&
            error.keyPattern?.personNameKey
        ) {
            throw new TenantCheckinError(
                'Este nome já está na lista de presença para esta sala.',
                409,
            )
        }
        throw error
    }

    return { sala: serializarSala(contexto.room) }
}
