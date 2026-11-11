import mongoose from 'mongoose'
import Room from '../models/roomModel.js'

export class TenantRoomError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantRoomError'
        this.statusCode = statusCode
    }
}

function validarId(id, nome) {
    if (!mongoose.isValidObjectId(id)) {
        throw new TenantRoomError(`${nome} inválido.`, 400)
    }
    return id
}

function serializarSala(sala) {
    return {
        id: String(sala._id),
        nome: sala.name,
        status: sala.status,
        criadaEm: sala.createdAt,
        atualizadaEm: sala.updatedAt,
    }
}

function normalizarNomeSala(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function capturarDuplicidade(error) {
    if (
        error?.code === 11000 &&
        error.keyPattern?.tenantId &&
        error.keyPattern?.activeName
    ) {
        throw new TenantRoomError('Já existe uma sala com este nome nesta organização.', 409)
    }
    throw error
}

export async function listarSalasDoTenant(tenantId) {
    validarId(tenantId, 'Organização')
    const salas = await Room.find({ tenantId, status: { $ne: 'archived' } })
        .sort({ name: 1 })
        .lean()
    return salas.map(serializarSala)
}

export async function criarSalaDoTenant(tenantId, nameInput) {
    validarId(tenantId, 'Organização')
    if (typeof nameInput !== 'string') {
        throw new TenantRoomError('Nome da sala é obrigatório.', 400)
    }

    const name = nameInput.trim()
    if (!name || name.length > 120) {
        throw new TenantRoomError('O nome da sala deve ter entre 1 e 120 caracteres.', 400)
    }

    try {
        const sala = await Room.create({
            tenantId,
            name,
            activeName: normalizarNomeSala(name),
            status: 'open',
        })
        return serializarSala(sala)
    } catch (error) {
        capturarDuplicidade(error)
    }
}

export async function alterarEstadoSalaDoTenant(tenantId, roomId, status) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')
    if (!['open', 'closed'].includes(status)) {
        throw new TenantRoomError('Estado da sala inválido.', 400)
    }

    const sala = await Room.findOneAndUpdate(
        { _id: roomId, tenantId, status: { $ne: 'archived' } },
        { $set: { status } },
        { new: true, runValidators: true },
    ).lean()
    return sala ? serializarSala(sala) : null
}

export async function arquivarSalaDoTenant(tenantId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')

    const sala = await Room.findOneAndUpdate(
        { _id: roomId, tenantId, status: { $ne: 'archived' } },
        { $set: { status: 'archived' }, $unset: { activeName: 1 } },
        { new: true, runValidators: true },
    ).lean()
    return sala ? serializarSala(sala) : null
}
