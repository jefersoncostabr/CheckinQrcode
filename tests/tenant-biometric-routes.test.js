import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const appliedPermissions = []
const authorizeTenantPermission = jest.fn(permission => (req, res, next) => {
    appliedPermissions.push(permission)
    req.tenant = { id: '65f1a0000000000000000001' }
    next()
})
const cadastrarBiometriaAdminDoTenant = jest.fn()
const excluirBiometriaAdministrativaDoTenant = jest.fn()
const listarPerfisBiometricosDoTenant = jest.fn()
const registrarCheckinFacialNaSalaDoTenant = jest.fn()
const verificarBiometriaDoTenant = jest.fn()
class TenantBiometricError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

jest.unstable_mockModule('../src/middleware/authorizeTenant.js', () => ({
    authorizeTenantPermission,
}))
jest.unstable_mockModule('../src/services/tenantBiometricService.js', () => ({
    cadastrarBiometriaAdminDoTenant,
    excluirBiometriaAdministrativaDoTenant,
    listarPerfisBiometricosDoTenant,
    registrarCheckinFacialNaSalaDoTenant,
    verificarBiometriaDoTenant,
    TenantBiometricError,
}))

const { default: tenantBiometricRoutes } = await import('../src/routes/tenantBiometricRoutes.js')

const app = express()
app.use(express.json())
app.use('/api/tenant', tenantBiometricRoutes)

describe('rotas administrativas de biometria tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        appliedPermissions.length = 0
    })

    it('aplica permissões e encaminha operações ao tenant autenticado', async () => {
        listarPerfisBiometricosDoTenant.mockResolvedValue([])
        cadastrarBiometriaAdminDoTenant.mockResolvedValue({ profileId: 'profile-id' })
        excluirBiometriaAdministrativaDoTenant.mockResolvedValue(true)
        verificarBiometriaDoTenant.mockResolvedValue({ cadastrada: true, corresponde: true })
        registrarCheckinFacialNaSalaDoTenant.mockResolvedValue({ sala: 'Sala Azul' })

        await request(app).get('/api/tenant/biometrics/profiles').expect(200)
        await request(app)
            .post('/api/tenant/biometrics/enroll')
            .send({ nome: 'Ana', descritor: [0], consentimento: true, tenantId: 'attacker' })
            .expect(201)
        await request(app).delete('/api/tenant/biometrics/profiles/profile-id').expect(200)
        await request(app)
            .post('/api/tenant/biometrics/verify')
            .send({ nome: 'Ana', descritor: [0] })
            .expect(200)
        await request(app)
            .post('/api/tenant/biometrics/checkin')
            .send({ roomId: 'room-id', descritor: [0], consentimento: true })
            .expect(201)

        expect(listarPerfisBiometricosDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
        )
        expect(cadastrarBiometriaAdminDoTenant).toHaveBeenCalledWith({
            tenantId: '65f1a0000000000000000001',
            name: 'Ana',
            descriptor: [0],
            consentimento: true,
        })
        expect(excluirBiometriaAdministrativaDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'profile-id',
        )
        expect(verificarBiometriaDoTenant).toHaveBeenCalledWith({
            tenantId: '65f1a0000000000000000001',
            descriptor: [0],
            name: 'Ana',
        })
        expect(registrarCheckinFacialNaSalaDoTenant).toHaveBeenCalledWith({
            tenantId: '65f1a0000000000000000001',
            roomId: 'room-id',
            descriptor: [0],
            consentimento: true,
            sourceIp: expect.any(String),
        })
        expect(appliedPermissions).toEqual([
            'biometrics:manage',
            'biometrics:manage',
            'biometrics:manage',
            'biometrics:manage',
            'attendance:create',
        ])
    })

    it('retorna erros de validação do serviço sem convertê-los em sucesso', async () => {
        verificarBiometriaDoTenant.mockRejectedValue(
            new TenantBiometricError('Descritor facial inválido.', 400),
        )

        const response = await request(app)
            .post('/api/tenant/biometrics/verify')
            .send({ descritor: [] })
            .expect(400)

        expect(response.body).toEqual({
            sucesso: false,
            mensagem: 'Descritor facial inválido.',
        })
    })
})
