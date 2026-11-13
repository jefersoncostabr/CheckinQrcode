import { jest } from '@jest/globals'
import mongoose from 'mongoose'

const listQuery = {
    sort: jest.fn(),
    lean: jest.fn(),
}
const updateQuery = { lean: jest.fn() }
const Room = {
    find: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
}
const QrCode = {
    findOneAndUpdate: jest.fn(),
}

listQuery.sort.mockReturnValue(listQuery)
listQuery.lean.mockResolvedValue([])
updateQuery.lean.mockResolvedValue(null)
Room.find.mockReturnValue(listQuery)
Room.findOneAndUpdate.mockReturnValue(updateQuery)

jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))

const {
    arquivarSalaDoTenant,
    alterarEstadoSalaDoTenant,
    criarSalaComQrDoTenant,
    criarSalaDoTenant,
    listarSalasDoTenant,
    TenantRoomError,
} = await import('../src/services/tenantRoomService.js')

const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'

describe('serviço de salas isoladas por tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listQuery.sort.mockReturnValue(listQuery)
        listQuery.lean.mockResolvedValue([])
        updateQuery.lean.mockResolvedValue(null)
        Room.find.mockReturnValue(listQuery)
        Room.findOneAndUpdate.mockReturnValue(updateQuery)
        QrCode.findOneAndUpdate.mockResolvedValue({ _id: 'qr-id' })
    })

    it('lista salas não arquivadas usando somente o tenant validado', async () => {
        listQuery.lean.mockResolvedValue([{
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
        }])

        await expect(listarSalasDoTenant(tenantId)).resolves.toMatchObject([
            { id: roomId, nome: 'Sala Azul', status: 'open' },
        ])
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            status: { $ne: 'archived' },
        })
    })

    it('valida nome e cria sala vinculada ao tenant sem aceitar tenant do cliente', async () => {
        Room.create.mockResolvedValue({
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
        })

        await criarSalaDoTenant(tenantId, '  Sala Azul  ')

        expect(Room.create).toHaveBeenCalledWith({
            tenantId,
            name: 'Sala Azul',
            activeName: 'sala azul',
            status: 'open',
        })
        await expect(criarSalaDoTenant(tenantId, '   '))
            .rejects.toMatchObject({ statusCode: 400 })
        await expect(criarSalaDoTenant(tenantId, 'a'.repeat(121)))
            .rejects.toBeInstanceOf(TenantRoomError)
        expect(Room.create).toHaveBeenCalledTimes(1)
    })

    it('converte duplicidade de nome por tenant em conflito', async () => {
        Room.create.mockRejectedValue(Object.assign(new Error('duplicate key'), {
            code: 11000,
            keyPattern: { tenantId: 1, activeName: 1 },
        }))

        await expect(criarSalaDoTenant(tenantId, 'Sala Azul'))
            .rejects.toMatchObject({ statusCode: 409 })
    })

    it('cria sala e associa QR disponível na mesma transação', async () => {
        const session = {
            withTransaction: jest.fn(async operation => operation()),
            endSession: jest.fn(),
        }
        jest.spyOn(mongoose, 'startSession').mockResolvedValue(session)
        Room.create.mockResolvedValue([{
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
        }])

        await expect(criarSalaComQrDoTenant(tenantId, 'Sala Azul', '65f1a0000000000000000004'))
            .resolves.toMatchObject({ id: roomId, status: 'open' })
        expect(Room.create).toHaveBeenCalledWith([{
            tenantId,
            name: 'Sala Azul',
            activeName: 'sala azul',
            status: 'open',
        }], { session })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            {
                _id: '65f1a0000000000000000004',
                tenantId,
                status: 'available',
            },
            { $set: { roomId, status: 'active' } },
            { new: true, session, runValidators: true },
        )
        expect(session.endSession).toHaveBeenCalled()
    })

    it('converte duplicidade de QR ativo para a mesma sala em conflito', async () => {
        const session = {
            withTransaction: jest.fn(async operation => operation()),
            endSession: jest.fn(),
        }
        jest.spyOn(mongoose, 'startSession').mockResolvedValue(session)
        Room.create.mockResolvedValue([{
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
        }])
        QrCode.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('dup'), {
            code: 11000,
            keyPattern: { tenantId: 1, roomId: 1 },
        }))

        await expect(criarSalaComQrDoTenant(tenantId, 'Sala Azul', '65f1a0000000000000000004'))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(session.endSession).toHaveBeenCalled()
    })

    it('altera estado com filtro simultâneo por sala e tenant', async () => {
        updateQuery.lean.mockResolvedValue({
            _id: roomId,
            name: 'Sala Azul',
            status: 'closed',
        })

        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'closed'))
            .resolves.toMatchObject({ id: roomId, status: 'closed' })
        expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: roomId, tenantId, status: { $ne: 'archived' } },
            { $set: { status: 'closed' } },
            { new: true, runValidators: true },
        )
        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'archived'))
            .rejects.toMatchObject({ statusCode: 400 })
    })

    it('arquiva sem apagar registros e remove a chave de nome ativo', async () => {
        updateQuery.lean.mockResolvedValue({
            _id: roomId,
            name: 'Sala Azul',
            status: 'archived',
        })

        await arquivarSalaDoTenant(tenantId, roomId)

        expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: roomId, tenantId, status: { $ne: 'archived' } },
            { $set: { status: 'archived' }, $unset: { activeName: 1 } },
            { new: true, runValidators: true },
        )
    })

    it('rejeita IDs inválidos antes de consultar o banco', async () => {
        await expect(listarSalasDoTenant('tenant-inválido'))
            .rejects.toMatchObject({ statusCode: 400 })
        expect(Room.find).not.toHaveBeenCalled()
    })
})
