import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const appliedPermissions = []
const authorizeTenantPermission = jest.fn(permission => (req, res, next) => {
    appliedPermissions.push(permission)
    req.tenant = { id: '65f1a0000000000000000001', role: permission === 'qrcodes:read' ? 'viewer' : 'admin' }
    next()
})
const listarQrCodesDoTenant = jest.fn()
const criarQrCodeDoTenant = jest.fn()
const associarQrCodeASalaDoTenant = jest.fn()
const rotacionarQrCodeDoTenant = jest.fn()
const revogarQrCodeDoTenant = jest.fn()
const recuperarVisualQrCode = jest.fn()
const TENANT_QR_CODE_LIMIT = 10
class TenantQrCodeError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

const listarSalasDoTenant = jest.fn()
const criarSalaDoTenant = jest.fn()
const criarSalaComQrDoTenant = jest.fn()
const alterarEstadoSalaDoTenant = jest.fn()
const arquivarSalaDoTenant = jest.fn()
class TenantRoomError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

jest.unstable_mockModule('../src/middleware/authorizeTenant.js', () => ({
    authorizeTenantPermission,
}))
jest.unstable_mockModule('../src/services/tenantQrCodeService.js', () => ({
    listarQrCodesDoTenant,
    criarQrCodeDoTenant,
    associarQrCodeASalaDoTenant,
    rotacionarQrCodeDoTenant,
    revogarQrCodeDoTenant,
    recuperarVisualQrCode,
    TenantQrCodeError,
    TENANT_QR_CODE_LIMIT,
}))
jest.unstable_mockModule('../src/services/qrCodeService.js', () => ({
    generateQRCodeBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
    getQrBaseUrl: jest.fn(() => 'https://example.test'),
}))
jest.unstable_mockModule('../src/services/tenantRoomService.js', () => ({
    listarSalasDoTenant,
    criarSalaDoTenant,
    criarSalaComQrDoTenant,
    alterarEstadoSalaDoTenant,
    arquivarSalaDoTenant,
    TenantRoomError,
}))

const { default: tenantQrCodeRoutes } = await import('../src/routes/tenantQrCodeRoutes.js')
const { default: tenantRoomRoutes } = await import('../src/routes/tenantRoomRoutes.js')

const app = express()
app.use(express.json())
app.use((req, res, next) => {
    req.session = {
        tenantAuth: {
            userId: 'user-id',
            tenantId: '65f1a0000000000000000001',
            membershipId: 'membership-id',
        },
    }
    next()
})
app.use('/api/tenant', tenantQrCodeRoutes)
app.use('/api/tenant', tenantRoomRoutes)

describe('contrato da API usado pelo front-end de QR codes e salas', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        appliedPermissions.length = 0
    })

    it('lista QR codes disponíveis da organização', async () => {
        listarQrCodesDoTenant.mockResolvedValue([
            { id: 'qr-disponivel', status: 'available', roomId: null, roomName: null },
            { id: 'qr-associado', status: 'active', roomId: 'sala-1', roomName: 'Sala Azul' },
        ])

        const response = await request(app).get('/api/tenant/qrcodes').expect(200)

        expect(response.body.qrcodes).toHaveLength(2)
        const disponiveis = response.body.qrcodes.filter(qr => qr.status === 'available')
        expect(disponiveis.map(qr => qr.id)).toContain('qr-disponivel')
        expect(appliedPermissions).toContain('qrcodes:read')
    })

    it('perfil viewer solicita qrcodes:read ao carregar a lista de QR codes', async () => {
        listarQrCodesDoTenant.mockResolvedValue([])

        await request(app).get('/api/tenant/qrcodes').expect(200)

        expect(appliedPermissions).toEqual(['qrcodes:read'])
    })

    it('cria sala associando um QR disponível existente', async () => {
        criarSalaComQrDoTenant.mockResolvedValue({
            id: 'sala-id', nome: 'Sala Verde', status: 'open', qrCodeId: 'qr-disponivel',
        })

        const response = await request(app)
            .post('/api/tenant/rooms')
            .send({ name: 'Sala Verde', qrCodeId: 'qr-disponivel' })
            .expect(201)

        expect(criarSalaComQrDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'Sala Verde',
            'qr-disponivel',
        )
        expect(criarSalaDoTenant).not.toHaveBeenCalled()
        expect(response.body.sala.qrCodeId).toBe('qr-disponivel')
    })

    it('cria sala sem selecionar QR continua funcionando', async () => {
        criarSalaDoTenant.mockResolvedValue({ id: 'sala-id', nome: 'Sala Vermelha', status: 'open' })

        const response = await request(app)
            .post('/api/tenant/rooms')
            .send({ name: 'Sala Vermelha' })
            .expect(201)

        expect(criarSalaDoTenant).toHaveBeenCalledWith('65f1a0000000000000000001', 'Sala Vermelha')
        expect(criarSalaComQrDoTenant).not.toHaveBeenCalled()
    })

    it('não remove automaticamente QR codes disponíveis existentes', async () => {
        listarQrCodesDoTenant.mockResolvedValue([
            { id: 'qr-disponivel', status: 'available' },
        ])

        const response = await request(app).get('/api/tenant/qrcodes').expect(200)

        expect(response.body.qrcodes).toHaveLength(1)
        expect(response.body.qrcodes[0].status).toBe('available')
    })
})
