import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import session from 'express-session'

const findActiveMembership = jest.fn()

jest.unstable_mockModule('../src/services/tenantAuthService.js', () => ({
    findActiveMembership,
}))

const { default: routes } = await import('../src/routes/routes.js')

function createAppComSessao(tenantAuth) {
    const app = express()
    app.use(express.json())
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
    }))
    app.use((req, res, next) => {
        req.session.tenantAuth = tenantAuth
        next()
    })
    app.use(routes)
    return app
}

describe('rota /professor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('redireciona para o login quando não há sessão tenant', async () => {
        const app = express()
        app.use(express.json())
        app.use(session({
            secret: 'test-secret',
            resave: false,
            saveUninitialized: false,
        }))
        app.use(routes)
        const response = await request(app).get('/professor')
        expect(response.status).toBe(302)
        expect(response.headers.location).toBe('/login')
    })

    it('permite acesso quando há vínculo ativo e permissão classes:manage', async () => {
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'admin',
        })

        const app = createAppComSessao({
            userId: 'user-id',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'admin',
        })

        const response = await request(app).get('/professor')
        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toContain('private, no-store')
        expect(response.text).toContain('Área do professor')
    })

    it('rejeita quando o vínculo está inativo', async () => {
        findActiveMembership.mockResolvedValue(null)

        const app = createAppComSessao({
            userId: 'user-id',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'admin',
        })

        const response = await request(app).get('/professor')
        expect(response.status).toBe(403)
        expect(response.body.sucesso).toBe(false)
        expect(response.body.mensagem).toContain('não está ativo')
    })

    it('rejeita quando o papel não tem classes:manage', async () => {
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'viewer',
        })

        const app = createAppComSessao({
            userId: 'user-id',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'viewer',
        })

        const response = await request(app).get('/professor')
        expect(response.status).toBe(403)
        expect(response.body.sucesso).toBe(false)
        expect(response.body.mensagem).toContain('não permite esta operação')
    })
})
