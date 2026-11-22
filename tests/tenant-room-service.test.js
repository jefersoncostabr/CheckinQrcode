import { jest } from '@jest/globals'
import mongoose from 'mongoose'

const listQuery = {
    sort: jest.fn(),
    lean: jest.fn(),
}
const updateQuery = { lean: jest.fn() }
const roomFindOneQuery = { select: jest.fn(), lean: jest.fn(), session: jest.fn() }
const Room = {
    find: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
}
const QrCode = {
    findOneAndUpdate: jest.fn(),
}
const CheckinPeriod = {
    create: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
}

listQuery.sort.mockReturnValue(listQuery)
listQuery.lean.mockResolvedValue([])
updateQuery.lean.mockResolvedValue(null)
Room.find.mockReturnValue(listQuery)
Room.findOne.mockReturnValue(roomFindOneQuery)
Room.findOneAndUpdate.mockReturnValue(updateQuery)
roomFindOneQuery.select.mockReturnValue(roomFindOneQuery)
roomFindOneQuery.lean.mockResolvedValue(null)
roomFindOneQuery.session.mockReturnValue(roomFindOneQuery)

jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))
jest.unstable_mockModule('../src/models/checkinPeriodModel.js', () => ({ default: CheckinPeriod }))

const sessionMock = {
    withTransaction: jest.fn(async callback => callback()),
    endSession: jest.fn(),
}
jest.spyOn(mongoose, 'startSession').mockResolvedValue(sessionMock)

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
const periodoId = '65f1a0000000000000000003'

describe('serviço de salas isoladas por tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listQuery.sort.mockReturnValue(listQuery)
        listQuery.lean.mockResolvedValue([])
        updateQuery.lean.mockResolvedValue(null)
        Room.find.mockReturnValue(listQuery)
        Room.findOne.mockReturnValue(roomFindOneQuery)
        Room.findOneAndUpdate.mockReturnValue(updateQuery)
        roomFindOneQuery.select.mockReturnValue(roomFindOneQuery)
        roomFindOneQuery.lean.mockResolvedValue(null)
        roomFindOneQuery.session.mockReturnValue(roomFindOneQuery)
        QrCode.findOneAndUpdate.mockResolvedValue({ _id: 'qr-id' })
        CheckinPeriod.create.mockResolvedValue([{ _id: periodoId }])
        CheckinPeriod.findOne.mockResolvedValue(null)
        CheckinPeriod.findOneAndUpdate.mockResolvedValue({})
        sessionMock.withTransaction.mockImplementation(async callback => callback())
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
        Room.create.mockResolvedValue([{
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
        }])

        await criarSalaDoTenant(tenantId, '  Sala Azul  ')

        expect(Room.create).toHaveBeenCalledWith([{
            tenantId,
            name: 'Sala Azul',
            activeName: 'sala azul',
            status: 'open',
        }], { session: sessionMock })
        expect(CheckinPeriod.create).toHaveBeenCalledWith([{
            tenantId,
            roomId: roomId,
            roomName: 'Sala Azul',
            startedAt: expect.any(Date),
            status: 'open',
        }], { session: sessionMock })
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
        }], { session: sessionMock })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            {
                _id: '65f1a0000000000000000004',
                tenantId,
                status: 'available',
            },
            { $set: { roomId, status: 'active' } },
            { returnDocument: 'after', session: sessionMock, runValidators: true },
        )
        expect(sessionMock.endSession).toHaveBeenCalled()
    })

    it('converte duplicidade de QR ativo para a mesma sala em conflito', async () => {
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
        expect(sessionMock.endSession).toHaveBeenCalled()
    })

    it('altera estado com filtro simultâneo por sala e tenant', async () => {
        roomFindOneQuery.lean.mockResolvedValue({
            _id: roomId,
            name: 'Sala Azul',
            status: 'closed',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        })

        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'closed'))
            .resolves.toMatchObject({ id: roomId, status: 'closed' })
        expect(Room.findOne).toHaveBeenCalledWith(
            { _id: roomId, tenantId, status: { $ne: 'archived' } },
        )
        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'archived'))
            .rejects.toMatchObject({ statusCode: 400 })
    })

    it('reabre sala fechada criando novo período', async () => {
        roomFindOneQuery.lean.mockResolvedValueOnce({
            _id: roomId,
            name: 'Sala Azul',
            status: 'closed',
            legacyPeriod: false,
        }).mockResolvedValueOnce({ _id: roomId, name: 'Sala Azul', status: 'open' })
        CheckinPeriod.create.mockResolvedValue([{ _id: periodoId }])

        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'open'))
            .resolves.toMatchObject({ id: roomId, status: 'open' })
        expect(CheckinPeriod.create).toHaveBeenCalledWith([{
            tenantId,
            roomId: roomId,
            roomName: 'Sala Azul',
            startedAt: expect.any(Date),
            status: 'open',
        }], { session: sessionMock })
    })

    it('fecha sala aberta finalizando período atual', async () => {
        roomFindOneQuery.lean.mockResolvedValueOnce({
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        }).mockResolvedValueOnce({ _id: roomId, name: 'Sala Azul', status: 'closed' })
        CheckinPeriod.findOne.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })

        await expect(alterarEstadoSalaDoTenant(tenantId, roomId, 'closed'))
            .resolves.toMatchObject({ id: roomId, status: 'closed' })
        expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: periodoId, tenantId, roomId, status: 'open' },
            expect.objectContaining({ $set: expect.objectContaining({ status: 'closed' }) }),
            expect.anything(),
        )
    })

    it('arquiva sala aberta finalizando período antes de arquivar', async () => {
        roomFindOneQuery.lean.mockResolvedValueOnce({
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        }).mockResolvedValueOnce({ _id: roomId, name: 'Sala Azul', status: 'archived' })
        CheckinPeriod.findOne.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })

        await arquivarSalaDoTenant(tenantId, roomId)

        expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: periodoId, tenantId, roomId, status: 'open' },
            expect.objectContaining({ $set: expect.objectContaining({ status: 'closed' }) }),
            expect.anything(),
        )
        expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: roomId, tenantId },
            expect.objectContaining({ $set: { status: 'archived' } }),
            expect.anything(),
        )
    })

    it('rejeita IDs inválidos antes de consultar o banco', async () => {
        await expect(listarSalasDoTenant('tenant-inválido'))
            .rejects.toMatchObject({ statusCode: 400 })
        expect(Room.find).not.toHaveBeenCalled()
    })
})
