import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const appliedPermissions = []
const authorizeTenantPermission = jest.fn(permission => (req, res, next) => {
    appliedPermissions.push(permission)
    req.tenant = { id: '65f1a0000000000000000001' }
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

const { default: tenantQrCodeRoutes } = await import('../src/routes/tenantQrCodeRoutes.js')

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

describe('rotas de QR Codes multi-tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        appliedPermissions.length = 0
    })

    it('aplica permissões de leitura e administração por operação', async () => {
        listarQrCodesDoTenant.mockResolvedValue([])
        criarQrCodeDoTenant.mockResolvedValue({ id: 'qr-id', token: 'secret-token' })
        associarQrCodeASalaDoTenant.mockResolvedValue({ id: 'qr-id', status: 'active' })
        revogarQrCodeDoTenant.mockResolvedValue({ id: 'qr-id', status: 'revoked' })
        rotacionarQrCodeDoTenant.mockResolvedValue({ id: 'qr-id', token: 'new-token' })

        await request(app).get('/api/tenant/qrcodes').expect(200)
        await request(app).post('/api/tenant/qrcodes').expect(201)
        await request(app).patch('/api/tenant/qrcodes/qr-id').send({ roomId: 'room-id' }).expect(200)
        await request(app).delete('/api/tenant/qrcodes/qr-id').expect(200)

        expect(appliedPermissions).toEqual([
            'qrcodes:read',
            'qrcodes:manage',
            'qrcodes:manage',
            'qrcodes:manage',
        ])
    })

    it('usa o tenant do middleware e ignora tenantId enviado pelo cliente', async () => {
        criarQrCodeDoTenant.mockResolvedValue({ id: 'qr-id', token: 'secret-token' })

        const response = await request(app)
            .post('/api/tenant/qrcodes')
            .send({ tenantId: 'tenant-attacker' })
            .expect(201)

        expect(criarQrCodeDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'https://example.test',
        )
        expect(response.body.qrcode.token).toBe('secret-token')
    })

    it('permite liberar associação e retorna erro de validação do serviço', async () => {
        associarQrCodeASalaDoTenant.mockResolvedValue({ id: 'qr-id', status: 'available' })
        await request(app).patch('/api/tenant/qrcodes/qr-id').send({ roomId: null }).expect(200)
        expect(associarQrCodeASalaDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'qr-id',
            null,
        )

        associarQrCodeASalaDoTenant.mockRejectedValue(new TenantQrCodeError('Sala inválida.', 400))
        const response = await request(app)
            .patch('/api/tenant/qrcodes/qr-id')
            .send({ roomId: 'bad-id' })
            .expect(400)
        expect(response.body).toEqual({ sucesso: false, mensagem: 'Sala inválida.' })
    })

    it('rotaciona QR e entrega nova imagem sem reutilizar o token anterior', async () => {
        rotacionarQrCodeDoTenant.mockResolvedValue({
            id: 'qr-id',
            token: 'new-token',
            status: 'active',
        })

        const response = await request(app)
            .post('/api/tenant/qrcodes/qr-id/rotate')
            .expect(200)

        expect(rotacionarQrCodeDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'qr-id',
            'https://example.test',
        )
        expect(response.body.qrcode).toMatchObject({
            token: 'new-token',
            url: 'https://example.test/add#new-token',
            qrCodeDataUri: 'data:image/png;base64,cG5n',
        })
    })

    it('reexibe visual de QR ativo sem rotacionar e com cache no-store', async () => {
        recuperarVisualQrCode.mockResolvedValue({
            id: 'qr-id',
            baseUrl: 'https://example.test',
            status: 'active',
            roomId: 'room-id',
            roomName: 'Sala Azul',
            qrCodeDataUri: 'data:image/png;base64,cG5n',
            url: 'https://example.test/add#token-recuperado',
        })

        const response = await request(app)
            .get('/api/tenant/qrcodes/qr-id/visual')
            .expect(200)

        expect(recuperarVisualQrCode).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'qr-id',
        )
        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.body.qrcode.qrCodeDataUri).toBe('data:image/png;base64,cG5n')
        expect(response.body.qrcode.token).toBeUndefined()
    })

    it('retorna 409 para QR antigo sem dados recuperáveis', async () => {
        const erro = new TenantQrCodeError('QR antigo não pode ser reexibido.', 409)
        recuperarVisualQrCode.mockRejectedValue(erro)

        const response = await request(app)
            .get('/api/tenant/qrcodes/qr-id/visual')
            .expect(409)

        expect(response.body).toEqual({ sucesso: false, mensagem: 'QR antigo não pode ser reexibido.' })
    })

    it('retorna 404 para QR inexistente na reexibição', async () => {
        const erro = new TenantQrCodeError('QR Code ativo não encontrado para esta organização.', 404)
        recuperarVisualQrCode.mockRejectedValue(erro)

        await request(app)
            .get('/api/tenant/qrcodes/qr-id/visual')
            .expect(404)
    })
})
