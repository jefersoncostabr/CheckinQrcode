import mongoose from 'mongoose'
import QrCode from '../models/qrCodeModel.js'
import Room from '../models/roomModel.js'
import CheckinPeriod from '../models/checkinPeriodModel.js'

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
    if (
        error?.code === 11000 &&
        error.keyPattern?.tenantId === 1 &&
        error.keyPattern?.roomId === 1
    ) {
        throw new TenantRoomError(
            'Esta sala já possui um QR Code ativo associado.',
            409,
        )
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

    const session = await mongoose.startSession()
    let salaCriada
    try {
        await session.withTransaction(async () => {
            const [room] = await Room.create([{
                tenantId,
                name,
                activeName: normalizarNomeSala(name),
                status: 'open',
            }], { session })

            const startedAt = new Date()
            const periodo = await CheckinPeriod.create([{
                tenantId,
                roomId: room._id,
                roomName: name,
                startedAt,
                status: 'open',
            }], { session })

            await Room.findOneAndUpdate(
                { _id: room._id, tenantId },
                { $set: { currentPeriodId: periodo[0]._id, periodRevision: 0 } },
                { session },
            )
            salaCriada = room
        })
    } catch (error) {
        capturarDuplicidade(error)
    } finally {
        await session.endSession()
    }
    return serializarSala(salaCriada)
}

export async function criarSalaComQrDoTenant(tenantId, nameInput, qrCodeId) {
    validarId(tenantId, 'Organização')
    validarId(qrCodeId, 'QR Code')
    if (typeof nameInput !== 'string') {
        throw new TenantRoomError('Nome da sala é obrigatório.', 400)
    }

    const name = nameInput.trim()
    if (!name || name.length > 120) {
        throw new TenantRoomError('O nome da sala deve ter entre 1 e 120 caracteres.', 400)
    }

    const session = await mongoose.startSession()
    let salaCriada
    try {
        await session.withTransaction(async () => {
            const [room] = await Room.create([{
                tenantId,
                name,
                activeName: normalizarNomeSala(name),
                status: 'open',
            }], { session })

            const startedAt = new Date()
            const periodo = await CheckinPeriod.create([{
                tenantId,
                roomId: room._id,
                roomName: name,
                startedAt,
                status: 'open',
            }], { session })

            await Room.findOneAndUpdate(
                { _id: room._id, tenantId },
                { $set: { currentPeriodId: periodo[0]._id, periodRevision: 0 } },
                { session },
            )

            const qrcode = await QrCode.findOneAndUpdate(
                { _id: qrCodeId, tenantId, status: 'available' },
                { $set: { roomId: room._id, status: 'active' } },
                { returnDocument: 'after', session, runValidators: true },
            )
            if (!qrcode) {
                throw new TenantRoomError('O QR Code selecionado não está mais disponível.', 409)
            }
            salaCriada = room
        })
    } catch (error) {
        capturarDuplicidade(error)
    } finally {
        await session.endSession()
    }
    return serializarSala(salaCriada)
}

export async function alterarEstadoSalaDoTenant(tenantId, roomId, status) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')
    if (!['open', 'closed'].includes(status)) {
        throw new TenantRoomError('Estado da sala inválido.', 400)
    }

    const session = await mongoose.startSession()
    let sala
    try {
        await session.withTransaction(async () => {
            const salaAtual = await Room.findOne({
                _id: roomId,
                tenantId,
                status: { $ne: 'archived' },
            }).session(session).lean()
            if (!salaAtual) {
                sala = null
                return
            }

            if (salaAtual.status === status) {
                sala = salaAtual
                return
            }

            if (status === 'open') {
                const startedAt = new Date()
                const periodo = await CheckinPeriod.create([{
                    tenantId,
                    roomId: salaAtual._id,
                    roomName: salaAtual.name,
                    startedAt,
                    status: 'open',
                }], { session })

                await Room.findOneAndUpdate(
                    { _id: roomId, tenantId },
                    {
                        $set: {
                            status: 'open',
                            currentPeriodId: periodo[0]._id,
                            legacyPeriod: false,
                        },
                        $inc: { periodRevision: 1 },
                    },
                    { session },
                )
                sala = await Room.findOne({ _id: roomId, tenantId }).session(session).lean()
            } else {
                if (!salaAtual.currentPeriodId) {
                    throw new TenantRoomError('Sala sem período corrente. Execute a migração de períodos.', 409)
                }
                if (!salaAtual.legacyPeriod) {
                    const periodo = await CheckinPeriod.findOneAndUpdate(
                        { _id: salaAtual.currentPeriodId, tenantId, roomId, status: 'open' },
                        { $set: { endedAt: new Date(), status: 'closed' } },
                        { session },
                    )
                    if (!periodo) throw new TenantRoomError('Período aberto não encontrado.', 409)
                }
                await Room.findOneAndUpdate(
                    { _id: roomId, tenantId },
                    {
                        $set: { status: 'closed' },
                        $inc: { periodRevision: 1 },
                    },
                    { session },
                )
                sala = await Room.findOne({ _id: roomId, tenantId }).session(session).lean()
            }
        })
    } catch (error) {
        capturarDuplicidade(error)
        throw error
    } finally {
        await session.endSession()
    }
    return sala ? serializarSala(sala) : null
}

export async function arquivarSalaDoTenant(tenantId, roomId) {
    validarId(tenantId, 'Organização')
    validarId(roomId, 'Sala')

    const session = await mongoose.startSession()
    let sala
    try {
        await session.withTransaction(async () => {
            const salaAtual = await Room.findOne({
                _id: roomId,
                tenantId,
                status: { $ne: 'archived' },
            }).session(session).lean()
            if (!salaAtual) {
                sala = null
                return
            }

            if (!salaAtual.currentPeriodId) {
                throw new TenantRoomError('Sala sem período corrente. Execute a migração de períodos.', 409)
            }
            if (!salaAtual.legacyPeriod && salaAtual.status === 'open') {
                const periodo = await CheckinPeriod.findOneAndUpdate(
                    { _id: salaAtual.currentPeriodId, tenantId, roomId, status: 'open' },
                    { $set: { endedAt: new Date(), status: 'closed' } },
                    { session },
                )
                if (!periodo) throw new TenantRoomError('Período aberto não encontrado.', 409)
            }

            await Room.findOneAndUpdate(
                { _id: roomId, tenantId },
                { $set: { status: 'archived' }, $unset: { activeName: 1 }, $inc: { periodRevision: 1 } },
                { session },
            )
            sala = await Room.findOne({ _id: roomId, tenantId }).session(session).lean()
        })
    } catch (error) {
        capturarDuplicidade(error)
        throw error
    } finally {
        await session.endSession()
    }
    return sala ? serializarSala(sala) : null
}
