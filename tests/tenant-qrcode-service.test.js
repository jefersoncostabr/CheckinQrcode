import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'

const listQuery = {
    sort: jest.fn(),
    lean: jest.fn(),
}
const roomListQuery = { lean: jest.fn() }
const roomQuery = { lean: jest.fn() }
const updateQuery = { lean: jest.fn() }
const QrCode = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
}
const Room = {
    find: jest.fn(),
    findOne: jest.fn(),
}

listQuery.sort.mockReturnValue(listQuery)
listQuery.lean.mockResolvedValue([])
roomListQuery.lean.mockResolvedValue([])
roomQuery.lean.mockResolvedValue(null)
updateQuery.lean.mockResolvedValue(null)
QrCode.find.mockReturnValue(listQuery)
Room.find.mockReturnValue(roomListQuery)
Room.findOne.mockReturnValue(roomQuery)
QrCode.findOneAndUpdate.mockReturnValue(updateQuery)

jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))

const {
    associarQrCodeASalaDoTenant,
    criarQrCodeDoTenant,
    listarQrCodesDoTenant,
    revogarQrCodeDoTenant,
    TenantQrCodeError,
    TENANT_QR_CODE_LIMIT,
} = await import('../src/services/tenantQrCodeService.js')

const tenantId = '65f1a0000000000000000001'
const qrCodeId = '65f1a0000000000000000002'
const roomId = '65f1a0000000000000000003'

describe('serviço de QR Codes isolados por tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listQuery.sort.mockReturnValue(listQuery)
        listQuery.lean.mockResolvedValue([])
        roomListQuery.lean.mockResolvedValue([])
        roomQuery.lean.mockResolvedValue(null)
        updateQuery.lean.mockResolvedValue(null)
        QrCode.find.mockReturnValue(listQuery)
        QrCode.countDocuments.mockResolvedValue(0)
        Room.find.mockReturnValue(roomListQuery)
        Room.findOne.mockReturnValue(roomQuery)
        QrCode.findOneAndUpdate.mockReturnValue(updateQuery)
    })

    it('lista QR Codes do tenant e resolve nomes de sala no mesmo tenant', async () => {
        listQuery.lean.mockResolvedValue([{
            _id: qrCodeId,
            roomId,
            status: 'active',
            tokenHash: 'secret-hash',
        }])
        roomListQuery.lean.mockResolvedValue([{ _id: roomId, name: 'Sala Azul' }])

        await expect(listarQrCodesDoTenant(tenantId)).resolves.toEqual([
            expect.objectContaining({
                id: qrCodeId,
                roomId,
                roomName: 'Sala Azul',
                status: 'active',
            }),
        ])
        expect(QrCode.find).toHaveBeenCalledWith({ tenantId })
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            _id: { $in: [roomId] },
        })
        expect(JSON.stringify(await listarQrCodesDoTenant(tenantId))).not.toContain('secret-hash')
    })

    it('cria token aleatório e persiste somente o hash', async () => {
        QrCode.create.mockImplementation(async document => ({
            _id: qrCodeId,
            ...document,
        }))

        const result = await criarQrCodeDoTenant(tenantId)

        expect(result.token).toHaveLength(43)
        expect(result.status).toBe('available')
        expect(QrCode.create).toHaveBeenCalledWith({
            tenantId,
            tokenHash: createHash('sha256').update(result.token).digest('hex'),
            status: 'available',
        })
        expect(result).not.toHaveProperty('tokenHash')
        expect(QrCode.countDocuments).toHaveBeenCalledWith({
            tenantId,
            status: { $ne: 'revoked' },
        })
    })

    it('aplica o limite de QR Codes por tenant', async () => {
        QrCode.countDocuments.mockResolvedValue(TENANT_QR_CODE_LIMIT)

        await expect(criarQrCodeDoTenant(tenantId))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(QrCode.create).not.toHaveBeenCalled()
    })

    it('associa somente sala não arquivada do mesmo tenant', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            status: 'active',
        })

        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .resolves.toMatchObject({ id: qrCodeId, roomId, roomName: 'Sala Azul', status: 'active' })
        expect(Room.findOne).toHaveBeenCalledWith({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: { $ne: 'revoked' } },
            { $set: { roomId, status: 'active' } },
            { new: true, runValidators: true },
        )
    })

    it('não associa salas de outro tenant e permite liberar uma associação', async () => {
        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .resolves.toBeNull()
        expect(QrCode.findOneAndUpdate).not.toHaveBeenCalled()

        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            status: 'available',
        })
        await associarQrCodeASalaDoTenant(tenantId, qrCodeId, null)
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: { $ne: 'revoked' } },
            { $set: { status: 'available' }, $unset: { roomId: 1 } },
            { new: true, runValidators: true },
        )
    })

    it('revoga sem apagar o registro e remove a referência da sala', async () => {
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            status: 'revoked',
        })

        await expect(revogarQrCodeDoTenant(tenantId, qrCodeId))
            .resolves.toMatchObject({ id: qrCodeId, status: 'revoked' })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId },
            { $set: { status: 'revoked' }, $unset: { roomId: 1 } },
            { new: true, runValidators: true },
        )
    })

    it('rejeita IDs inválidos antes de consultar o banco', async () => {
        await expect(listarQrCodesDoTenant('tenant-inválido'))
            .rejects.toBeInstanceOf(TenantQrCodeError)
        expect(QrCode.find).not.toHaveBeenCalled()
    })
})
