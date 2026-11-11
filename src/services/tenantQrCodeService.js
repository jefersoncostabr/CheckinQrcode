import { createHash, randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import QrCode from '../models/qrCodeModel.js'
import Room from '../models/roomModel.js'

export const TENANT_QR_CODE_LIMIT = 10

export class TenantQrCodeError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantQrCodeError'
        this.statusCode = statusCode
    }
}

function validarId(id, nome) {
    if (!mongoose.isValidObjectId(id)) {
        throw new TenantQrCodeError(`${nome} inválido.`, 400)
    }
    return id
}

function serializarQrCode(qrCode, roomName = null) {
    return {
        id: String(qrCode._id),
        status: qrCode.status,
        roomId: qrCode.roomId ? String(qrCode.roomId) : null,
        roomName,
        criadaEm: qrCode.createdAt,
        atualizadaEm: qrCode.updatedAt,
    }
}

export async function listarQrCodesDoTenant(tenantId) {
    validarId(tenantId, 'Organização')
    const qrCodes = await QrCode.find({ tenantId })
        .sort({ createdAt: -1 })
        .lean()
    const roomIds = qrCodes
        .filter(qrCode => qrCode.roomId)
        .map(qrCode => qrCode.roomId)
    const rooms = roomIds.length
        ? await Room.find({ tenantId, _id: { $in: roomIds } }).lean()
        : []
    const roomsPorId = new Map(rooms.map(room => [String(room._id), room.name]))

    return qrCodes.map(qrCode =>
        serializarQrCode(qrCode, roomsPorId.get(String(qrCode.roomId)) || null),
    )
}

export async function criarQrCodeDoTenant(tenantId) {
    validarId(tenantId, 'Organização')
    const activeCount = await QrCode.countDocuments({
        tenantId,
        status: { $ne: 'revoked' },
    })
    if (activeCount >= TENANT_QR_CODE_LIMIT) {
        throw new TenantQrCodeError('Limite de 10 QR Codes atingido.', 409)
    }

    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const qrCode = await QrCode.create({
        tenantId,
        tokenHash,
        status: 'available',
    })
    return {
        ...serializarQrCode(qrCode),
        token,
    }
}

export async function rotacionarQrCodeDoTenant(tenantId, qrCodeId) {
    validarId(tenantId, 'Organização')
    validarId(qrCodeId, 'QR Code')
    const token = randomBytes(32).toString('base64url')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const qrCode = await QrCode.findOneAndUpdate(
        { _id: qrCodeId, tenantId, status: 'active', roomId: { $exists: true } },
        { $set: { tokenHash } },
        { new: true, runValidators: true },
    ).lean()
    return qrCode ? { ...serializarQrCode(qrCode), token } : null
}

export async function associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(qrCodeId, 'QR Code')
    if (roomId !== null) {
        validarId(roomId, 'Sala')
    }

    let room = null
    if (roomId !== null) {
        room = await Room.findOne({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        }).lean()
        if (!room) {
            return null
        }
    }

    const update = room
        ? { $set: { roomId, status: 'active' } }
        : { $set: { status: 'available' }, $unset: { roomId: 1 } }
    const qrCode = await QrCode.findOneAndUpdate(
        { _id: qrCodeId, tenantId, status: { $ne: 'revoked' } },
        update,
        { new: true, runValidators: true },
    ).lean()
    return qrCode ? serializarQrCode(qrCode, room?.name || null) : null
}

export async function revogarQrCodeDoTenant(tenantId, qrCodeId) {
    validarId(tenantId, 'Organização')
    validarId(qrCodeId, 'QR Code')
    const qrCode = await QrCode.findOneAndUpdate(
        { _id: qrCodeId, tenantId },
        { $set: { status: 'revoked' }, $unset: { roomId: 1 } },
        { new: true, runValidators: true },
    ).lean()
    return qrCode ? serializarQrCode(qrCode) : null
}
