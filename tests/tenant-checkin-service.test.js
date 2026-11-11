import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'

const qrQuery = { select: jest.fn(), lean: jest.fn() }
const tenantQuery = { select: jest.fn(), lean: jest.fn() }
const roomQuery = { select: jest.fn(), lean: jest.fn() }
const QrCode = { findOne: jest.fn() }
const Tenant = { findOne: jest.fn() }
const Room = { findOne: jest.fn() }
const Attendance = {
    exists: jest.fn(),
    create: jest.fn(),
}

qrQuery.select.mockReturnValue(qrQuery)
qrQuery.lean.mockResolvedValue(null)
tenantQuery.select.mockReturnValue(tenantQuery)
tenantQuery.lean.mockResolvedValue(null)
roomQuery.select.mockReturnValue(roomQuery)
roomQuery.lean.mockResolvedValue(null)
QrCode.findOne.mockReturnValue(qrQuery)
Tenant.findOne.mockReturnValue(tenantQuery)
Room.findOne.mockReturnValue(roomQuery)
Attendance.exists.mockResolvedValue(null)
Attendance.create.mockResolvedValue({})

jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))
jest.unstable_mockModule('../src/models/tenantModel.js', () => ({ default: Tenant }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))

const {
    registrarCheckinPorQrTenant,
    resolverQrCodeDeCheckin,
    TenantCheckinError,
} = await import('../src/services/tenantCheckinService.js')

const token = 'A'.repeat(43)
const tokenHash = createHash('sha256').update(token).digest('hex')
const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'

function setupActiveQr(roomStatus = 'open') {
    qrQuery.lean.mockResolvedValue({
        _id: '65f1a0000000000000000003',
        tenantId,
        roomId,
    })
    tenantQuery.lean.mockResolvedValue({ _id: tenantId })
    roomQuery.lean.mockResolvedValue({
        _id: roomId,
        tenantId,
        name: 'Sala Azul',
        status: roomStatus,
    })
}

describe('serviço de check-in por QR tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        qrQuery.select.mockReturnValue(qrQuery)
        qrQuery.lean.mockResolvedValue(null)
        tenantQuery.select.mockReturnValue(tenantQuery)
        tenantQuery.lean.mockResolvedValue(null)
        roomQuery.select.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue(null)
        QrCode.findOne.mockReturnValue(qrQuery)
        Tenant.findOne.mockReturnValue(tenantQuery)
        Room.findOne.mockReturnValue(roomQuery)
        Attendance.exists.mockResolvedValue(null)
        Attendance.create.mockResolvedValue({})
    })

    it('resolve token em QR ativo e consulta tenant e sala pelo escopo do próprio QR', async () => {
        setupActiveQr()

        await expect(resolverQrCodeDeCheckin(token)).resolves.toEqual({
            sala: { id: roomId, nome: 'Sala Azul' },
            aberta: true,
        })
        expect(QrCode.findOne).toHaveBeenCalledWith({ tokenHash, status: 'active' })
        expect(Tenant.findOne).toHaveBeenCalledWith({ _id: tenantId, status: 'active' })
        expect(Room.findOne).toHaveBeenCalledWith({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        })
    })

    it('não resolve QR inexistente, sem sala ou associado a tenant inativo', async () => {
        await expect(resolverQrCodeDeCheckin(token)).resolves.toBeNull()

        qrQuery.lean.mockResolvedValue({ tenantId, roomId })
        tenantQuery.lean.mockResolvedValue(null)
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        await expect(resolverQrCodeDeCheckin(token)).resolves.toBeNull()
    })

    it('registra presença com tenant e sala derivados do QR, normalizando chave do nome', async () => {
        setupActiveQr()

        await expect(registrarCheckinPorQrTenant({
            token,
            name: '  Ána   Silva  ',
            sourceIp: '127.0.0.1',
        })).resolves.toEqual({ sala: { id: roomId, nome: 'Sala Azul' } })

        expect(Attendance.create).toHaveBeenCalledWith({
            tenantId,
            roomId,
            personNameSnapshot: 'Ána   Silva',
            personNameKey: 'ana silva',
            method: 'qr',
            sourceIp: '127.0.0.1',
        })
    })

    it('valida token e nome, impede nomes duplicados e rejeita sala fechada', async () => {
        await expect(resolverQrCodeDeCheckin('token-inválido'))
            .rejects.toBeInstanceOf(TenantCheckinError)
        await expect(registrarCheckinPorQrTenant({ token, name: '   ' }))
            .rejects.toMatchObject({ statusCode: 400 })

        setupActiveQr()
        Attendance.exists.mockResolvedValue({ _id: 'attendance-id' })
        await expect(registrarCheckinPorQrTenant({ token, name: 'Ana Silva' }))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(Attendance.create).not.toHaveBeenCalled()

        setupActiveQr('closed')
        Attendance.exists.mockResolvedValue(null)
        await expect(registrarCheckinPorQrTenant({ token, name: 'Ana Silva' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('converte duplicidade concorrente do índice composto em conflito', async () => {
        setupActiveQr()
        Attendance.create.mockRejectedValue(Object.assign(new Error('duplicate key'), {
            code: 11000,
            keyPattern: { tenantId: 1, roomId: 1, personNameKey: 1 },
        }))

        await expect(registrarCheckinPorQrTenant({ token, name: 'Ana Silva' }))
            .rejects.toMatchObject({ statusCode: 409 })
    })
})
