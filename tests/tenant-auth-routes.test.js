import { jest } from '@jest/globals'

const createTenantOwner = jest.fn()
const authenticateTenantUser = jest.fn()
const findActiveMembership = jest.fn()
const establishTenantSession = jest.fn(async (req, identity, membership) => {
    req.session.tenantAuth = {
        userId: identity.userId,
        tenantId: membership.tenantId,
        membershipId: membership.membershipId,
        role: membership.role,
    }
    delete req.session.pendingTenantAuth
})

jest.unstable_mockModule('../src/services/tenantRegistrationService.js', () => ({
    createTenantOwner,
    RegistrationConflictError: class RegistrationConflictError extends Error {
        constructor(message) {
            super(message)
            this.statusCode = 409
        }
    },
    RegistrationValidationError: class RegistrationValidationError extends Error {
        constructor(message) {
            super(message)
            this.statusCode = 400
        }
    },
}))
jest.unstable_mockModule('../src/services/tenantAuthService.js', () => ({
    authenticateTenantUser,
    findActiveMembership,
}))
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    establishTenantSession,
}))

const express = (await import('express')).default
const session = (await import('express-session')).default
const request = (await import('supertest')).default
const { default: tenantAuthRoutes } = await import('../src/routes/tenantAuthRoutes.js')

function createApp() {
    const app = express()
    app.use(express.json())
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
    }))
    app.use('/auth', tenantAuthRoutes)
    return app
}

describe('rotas de autenticação tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('cria tenant e owner e inicia sessão tenant sem expor dados sensíveis', async () => {
        createTenantOwner.mockResolvedValue({
            tenantId: 'tenant-id',
            userId: 'user-id',
            membershipId: 'membership-id',
        })

        const response = await request(createApp())
            .post('/auth/register')
            .send({
                tenantName: 'Organização',
                name: 'Pessoa',
                email: 'pessoa@example.com',
                password: 'senha-segura-123',
                role: 'admin',
            })

        expect(response.status).toBe(201)
        expect(response.body.tenant).toEqual({
            id: 'tenant-id',
            membershipId: 'membership-id',
            name: 'Organização',
            role: 'owner',
        })
        expect(response.body.user).toEqual({ id: 'user-id', name: 'Pessoa' })
        expect(response.body).not.toHaveProperty('password')
        expect(response.body).not.toHaveProperty('passwordHash')
        expect(createTenantOwner).toHaveBeenCalledWith(expect.objectContaining({
            tenantName: 'Organização',
            name: 'Pessoa',
            email: 'pessoa@example.com',
            password: 'senha-segura-123',
        }))
        expect(establishTenantSession).toHaveBeenCalledWith(
            expect.any(Object),
            { userId: 'user-id', name: 'Pessoa' },
            expect.objectContaining({ role: 'owner' }),
        )
    })

    it('autentica usuário com um único tenant e cria sessão', async () => {
        authenticateTenantUser.mockResolvedValue({
            userId: 'user-id',
            name: 'Pessoa',
            memberships: [{
                tenantId: 'tenant-id',
                membershipId: 'membership-id',
                tenantName: 'Organização',
                role: 'owner',
            }],
        })

        const response = await request(createApp())
            .post('/auth/login')
            .send({ email: 'pessoa@example.com', password: 'senha-correta' })

        expect(response.status).toBe(200)
        expect(response.body.tenant.name).toBe('Organização')
        expect(establishTenantSession).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({ userId: 'user-id' }),
            expect.objectContaining({ membershipId: 'membership-id' }),
        )
    })

    it('exige seleção explícita quando há mais de um tenant e valida o vínculo', async () => {
        authenticateTenantUser.mockResolvedValue({
            userId: 'user-id',
            name: 'Pessoa',
            memberships: [
                { tenantId: 'tenant-a', membershipId: 'membership-a', tenantName: 'A', role: 'owner' },
                { tenantId: 'tenant-b', membershipId: 'membership-b', tenantName: 'B', role: 'admin' },
            ],
        })
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-b',
            membershipId: 'membership-b',
            tenantName: 'B',
            role: 'admin',
        })

        const agent = request.agent(createApp())
        const login = await agent
            .post('/auth/login')
            .send({ email: 'pessoa@example.com', password: 'senha-correta' })

        expect(login.status).toBe(200)
        expect(login.body.selecaoNecessaria).toBe(true)
        expect(login.body.memberships).toHaveLength(2)

        const selected = await agent
            .post('/auth/select')
            .send({ membershipId: 'membership-b' })

        expect(selected.status).toBe(200)
        expect(selected.body.tenant).toEqual({
            id: 'tenant-b',
            membershipId: 'membership-b',
            name: 'B',
            role: 'admin',
        })
        expect(findActiveMembership).toHaveBeenCalledWith(
            'user-id',
            'tenant-b',
            'membership-b',
        )
    })

    it('não permite selecionar membership que não foi retornado no login', async () => {
        authenticateTenantUser.mockResolvedValue({
            userId: 'user-id',
            name: 'Pessoa',
            memberships: [
                { tenantId: 'tenant-a', membershipId: 'membership-a', tenantName: 'A', role: 'owner' },
                { tenantId: 'tenant-b', membershipId: 'membership-b', tenantName: 'B', role: 'admin' },
            ],
        })

        const agent = request.agent(createApp())
        await agent.post('/auth/login').send({ email: 'pessoa@example.com', password: 'senha-correta' })
        const selected = await agent
            .post('/auth/select')
            .send({ membershipId: 'membership-foreign' })

        expect(selected.status).toBe(401)
        expect(findActiveMembership).not.toHaveBeenCalled()
    })

    it('permite trocar tenant somente para membership ativo do mesmo usuário', async () => {
        authenticateTenantUser.mockResolvedValue({
            userId: 'user-id',
            name: 'Pessoa',
            memberships: [
                { tenantId: 'tenant-a', membershipId: 'membership-a', tenantName: 'A', role: 'owner' },
            ],
        })
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-b',
            membershipId: 'membership-b',
            tenantName: 'B',
            role: 'admin',
        })
        const agent = request.agent(createApp())
        await agent.post('/auth/login').send({ email: 'pessoa@example.com', password: 'senha-correta' })
        const switched = await agent
            .post('/auth/switch')
            .send({ tenantId: 'tenant-b', membershipId: 'membership-b' })

        expect(switched.status).toBe(200)
        expect(switched.body.tenant).toEqual({
            id: 'tenant-b',
            membershipId: 'membership-b',
            name: 'B',
            role: 'admin',
        })
        expect(findActiveMembership).toHaveBeenCalledWith(
            'user-id',
            'tenant-b',
            'membership-b',
        )
    })

    it('rejeita credenciais inválidas e informa o estado da sessão', async () => {
        authenticateTenantUser.mockResolvedValue(null)
        const agent = request.agent(createApp())

        const login = await agent
            .post('/auth/login')
            .send({ email: 'pessoa@example.com', password: 'incorreta' })
        const sessionResponse = await agent.get('/auth/session')

        expect(login.status).toBe(401)
        expect(sessionResponse.status).toBe(401)
    })
})
