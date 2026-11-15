import { jest } from '@jest/globals'
import express from 'express'
import session from 'express-session'
import request from 'supertest'

const resolverQrCodeDeCheckin = jest.fn()
const cadastrarContaEPrimeiroCheckin = jest.fn()
const autenticarParticipante = jest.fn()
const consultarSessaoParticipante = jest.fn()
const registrarCheckinAutenticado = jest.fn()
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
    cadastrarContaEPrimeiroCheckin,
    autenticarParticipante,
    consultarSessaoParticipante,
    registrarCheckinAutenticado,
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
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
}))
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

    it('cria conta e registra primeiro check-in sem email', async () => {
        cadastrarContaEPrimeiroCheckin.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
            pessoa: { userId: 'user-id', personId: 'person-id', tenantId: 'tenant-id', nome: 'Ana Silva', membershipId: 'membership-id' },
        })

        const agent = request.agent(app)
        const response = await agent
            .post('/api/checkin/tenant/criar-conta')
            .send({ token: 'qr-token', nome: 'Ana Silva', senha: 'senha1234' })
            .expect(201)

        expect(cadastrarContaEPrimeiroCheckin).toHaveBeenCalledWith({
            token: 'qr-token',
            nome: 'Ana Silva',
            senha: 'senha1234',
            sourceIp: expect.any(String),
        })
        expect(response.body.sucesso).toBe(true)
        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.body.pessoa.nome).toBe('Ana Silva')
        consultarSessaoParticipante.mockResolvedValue({
            userId: 'user-id', nome: 'Ana Silva', sala: { id: 'room-id', nome: 'Sala Azul' },
        })
        await agent.post('/api/checkin/tenant/sessao').send({ token: 'qr-token' }).expect(200)
        expect(consultarSessaoParticipante).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 'tenant-id', personId: 'person-id', membershipId: 'membership-id',
        }))
    })

    it('autentica participante com nome e senha', async () => {
        autenticarParticipante.mockResolvedValue({
            userId: 'user-id',
            personId: 'person-id',
            nome: 'Ana Silva',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            sala: { id: 'room-id', nome: 'Sala Azul' },
        })

        const response = await request(app)
            .post('/api/checkin/tenant/login')
            .send({ token: 'qr-token', nome: 'Ana Silva', senha: 'senha1234' })
            .expect(200)

        expect(autenticarParticipante).toHaveBeenCalledWith({
            token: 'qr-token',
            nome: 'Ana Silva',
            senha: 'senha1234',
            sourceIp: expect.any(String),
        })
        expect(response.body.sucesso).toBe(true)
    })

    it('informa que a presença foi registrada se a sessão falhar após o cadastro', async () => {
        cadastrarContaEPrimeiroCheckin.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
            pessoa: { userId: 'user-id', personId: 'person-id', tenantId: 'tenant-id', membershipId: 'membership-id', nome: 'Ana' },
        })
        const appSemSessao = express()
        appSemSessao.use(express.json())
        appSemSessao.use('/api/checkin/tenant', tenantCheckinRoutes)
        const log = jest.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const response = await request(appSemSessao)
                .post('/api/checkin/tenant/criar-conta')
                .send({ token: 'qr-token', nome: 'Ana', senha: 'senha1234' })
                .expect(503)
            expect(response.body.presencaRegistrada).toBe(true)
            expect(response.body.mensagem).toContain('presença registrada')
        } finally {
            log.mockRestore()
        }
    })

    it('consulta sessão do participante', async () => {
        consultarSessaoParticipante.mockResolvedValue({
            sucesso: true,
            userId: 'user-id',
            nome: 'Ana Silva',
            personId: 'person-id',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            sala: { id: 'room-id', nome: 'Sala Azul' },
        })

        const agent = request.agent(app)
        await agent.post('/api/checkin/tenant/login')
            .send({ token: 'qr-token', nome: 'Ana Silva', senha: 'senha1234' })
            .expect(200)

        const response = await agent
            .post('/api/checkin/tenant/sessao')
            .send({ token: 'qr-token' })
            .expect(200)

        expect(consultarSessaoParticipante).toHaveBeenCalledWith({
            token: 'qr-token',
            userId: expect.any(String),
            tenantId: expect.any(String),
            personId: expect.any(String),
            membershipId: expect.any(String),
        })
        expect(response.body.sucesso).toBe(true)
    })

    it('registra presença vinculada à pessoa da sessão', async () => {
        registrarCheckinAutenticado.mockResolvedValue({
            sala: { id: 'room-id', nome: 'Sala Azul' },
        })

        const agent = request.agent(app)
        await agent.post('/api/checkin/tenant/login')
            .send({ token: 'qr-token', nome: 'Ana Silva', senha: 'senha1234' })
            .expect(200)

        const response = await agent
            .post('/api/checkin/tenant/attendance')
            .send({ token: 'qr-token' })
            .expect(201)

        expect(registrarCheckinAutenticado).toHaveBeenCalledWith({
            token: 'qr-token',
            userId: expect.any(String),
            personId: expect.any(String),
            tenantId: expect.any(String),
            membershipId: expect.any(String),
            sourceIp: expect.any(String),
        })
        expect(response.body.sucesso).toBe(true)
    })

    it('expira a sessão após 30 dias mesmo após consultas', async () => {
        autenticarParticipante.mockResolvedValue({
            userId: 'user-id', personId: 'person-id', tenantId: 'tenant-id',
            membershipId: 'membership-id', nome: 'Ana Silva', sala: { id: 'room-id', nome: 'Sala Azul' },
        })
        consultarSessaoParticipante.mockResolvedValue({
            userId: 'user-id', nome: 'Ana Silva', sala: { id: 'room-id', nome: 'Sala Azul' },
        })
        const agora = Date.now()
        const clock = jest.spyOn(Date, 'now').mockReturnValue(agora)
        try {
            const agent = request.agent(app)
            await agent.post('/api/checkin/tenant/login').send({ token: 'qr-token' }).expect(200)
            clock.mockReturnValue(agora + 29 * 24 * 60 * 60 * 1000)
            await agent.post('/api/checkin/tenant/sessao').send({ token: 'qr-token' }).expect(200)
            clock.mockReturnValue(agora + 30 * 24 * 60 * 60 * 1000)
            await agent.post('/api/checkin/tenant/attendance').send({ token: 'qr-token' }).expect(401)
        } finally {
            clock.mockRestore()
        }
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
