import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const resolverQrCodeDeCheckin = jest.fn()
const registrarCheckinPorQrTenant = jest.fn()
const cadastrarBiometriaDoTenant = jest.fn()
const registrarCheckinFacialDoTenant = jest.fn()
const excluirBiometriaDoTenant = jest.fn()
class TenantCheckinError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}
class TenantBiometricError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

jest.unstable_mockModule('../src/services/tenantCheckinService.js', () => ({
    resolverQrCodeDeCheckin,
    registrarCheckinPorQrTenant,
    TenantCheckinError,
}))
jest.unstable_mockModule('../src/services/tenantBiometricService.js', () => ({
    cadastrarBiometriaDoTenant,
    registrarCheckinFacialDoTenant,
    excluirBiometriaDoTenant,
    TenantBiometricError,
}))

const { default: tenantCheckinRoutes } = await import('../src/routes/tenantCheckinRoutes.js')

const app = express()
app.use(express.json())
app.use('/api/checkin/tenant', tenantCheckinRoutes)

describe('rotas públicas de check-in por QR tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('resolve QR usando token do corpo e não recebe tenantId', async () => {
        resolverQrCodeDeCheckin.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
            aberta: true,
        })

        const response = await request(app)
            .post('/api/checkin/tenant/resolve')
            .send({ token: 'qr-token', tenantId: 'tenant-from-client' })
            .expect(200)

        expect(resolverQrCodeDeCheckin).toHaveBeenCalledWith('qr-token')
        expect(response.body.sala).toEqual({ id: 'room-id', nome: 'Sala Azul' })
    })

    it('bloqueia sala fechada e retorna erro de token inválido', async () => {
        resolverQrCodeDeCheckin.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
            aberta: false,
        })
        await request(app)
            .post('/api/checkin/tenant/resolve')
            .send({ token: 'qr-token' })
            .expect(403)

        resolverQrCodeDeCheckin.mockRejectedValue(
            new TenantCheckinError('QR Code inválido ou expirado.', 404),
        )
        const response = await request(app)
            .post('/api/checkin/tenant/resolve')
            .send({ token: 'invalid' })
            .expect(404)
        expect(response.body.mensagem).toBe('QR Code inválido ou expirado.')
    })

    it('registra presença a partir do token sem aceitar tenant ou sala do cliente', async () => {
        registrarCheckinPorQrTenant.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
        })

        const response = await request(app)
            .post('/api/checkin/tenant/attendance')
            .send({
                token: 'qr-token',
                nome: 'Ana Silva',
                tenantId: 'tenant-from-client',
                roomId: 'room-from-client',
            })
            .expect(201)

        expect(registrarCheckinPorQrTenant).toHaveBeenCalledWith({
            token: 'qr-token',
            name: 'Ana Silva',
            sourceIp: expect.any(String),
        })
        expect(response.body.sucesso).toBe(true)
    })

    it('cria perfil biométrico com consentimento explícito e devolve credencial de exclusão', async () => {
        cadastrarBiometriaDoTenant.mockResolvedValue({
            profileId: 'profile-id',
            deleteToken: 'delete-token',
        })

        const response = await request(app)
            .post('/api/checkin/tenant/biometrics/enroll')
            .send({
                token: 'qr-token',
                nome: 'Ana Silva',
                descritor: Array(128).fill(0),
                consentimento: true,
                tenantId: 'ignored',
            })
            .expect(201)

        expect(cadastrarBiometriaDoTenant).toHaveBeenCalledWith({
            token: 'qr-token',
            name: 'Ana Silva',
            descriptor: Array(128).fill(0),
            consentimento: true,
        })
        expect(response.body).toEqual({
            sucesso: true,
            mensagem: 'Perfil biométrico cadastrado.',
            perfilId: 'profile-id',
            tokenExclusao: 'delete-token',
        })
    })

    it('usa consentimento no check-in facial e credencial individual para exclusão', async () => {
        registrarCheckinFacialDoTenant.mockResolvedValue({ sucesso: true })
        await request(app)
            .post('/api/checkin/tenant/biometrics/checkin')
            .send({ token: 'qr-token', descritor: Array(128).fill(0), consentimento: true })
            .expect(201)

        expect(registrarCheckinFacialDoTenant).toHaveBeenCalledWith({
            token: 'qr-token',
            descriptor: Array(128).fill(0),
            consentimento: true,
            sourceIp: expect.any(String),
        })

        excluirBiometriaDoTenant.mockResolvedValue({ deleted: true })
        await request(app)
            .delete('/api/checkin/tenant/biometrics/profiles/profile-id')
            .set('x-biometric-delete-token', 'delete-token')
            .expect(200)
        expect(excluirBiometriaDoTenant).toHaveBeenCalledWith({
            profileId: 'profile-id',
            deleteToken: 'delete-token',
        })
    })
})
