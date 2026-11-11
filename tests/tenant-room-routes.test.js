import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const appliedPermissions = []
const authorizeTenantPermission = jest.fn(permission => (req, res, next) => {
    appliedPermissions.push(permission)
    req.tenant = {
        id: '65f1a0000000000000000001',
        role: permission === 'rooms:read' ? 'viewer' : 'admin',
    }
    next()
})
const listarSalasDoTenant = jest.fn()
const criarSalaDoTenant = jest.fn()
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
jest.unstable_mockModule('../src/services/tenantRoomService.js', () => ({
    listarSalasDoTenant,
    criarSalaDoTenant,
    alterarEstadoSalaDoTenant,
    arquivarSalaDoTenant,
    TenantRoomError,
}))

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
app.use('/api/tenant', tenantRoomRoutes)

describe('rotas de salas multi-tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        appliedPermissions.length = 0
    })

    it('aplica permissões de leitura e administração por operação', async () => {
        listarSalasDoTenant.mockResolvedValue([])
        criarSalaDoTenant.mockResolvedValue({ id: 'room-id', nome: 'Sala A', status: 'open' })
        alterarEstadoSalaDoTenant.mockResolvedValue({ id: 'room-id', status: 'closed' })
        arquivarSalaDoTenant.mockResolvedValue({ id: 'room-id', status: 'archived' })

        await request(app).get('/api/tenant/rooms').expect(200)
        await request(app).post('/api/tenant/rooms').send({ name: 'Sala A' }).expect(201)
        await request(app).patch('/api/tenant/rooms/room-id').send({ status: 'closed' }).expect(200)
        await request(app).delete('/api/tenant/rooms/room-id').expect(200)

        expect(appliedPermissions).toEqual([
            'rooms:read',
            'rooms:manage',
            'rooms:manage',
            'rooms:manage',
        ])
    })

    it('usa tenant do middleware de autorização e não o tenantId enviado pelo cliente', async () => {
        criarSalaDoTenant.mockResolvedValue({ id: 'room-id', nome: 'Sala A', status: 'open' })

        await request(app)
            .post('/api/tenant/rooms')
            .send({ name: 'Sala A', tenantId: 'tenant-attacker' })
            .expect(201)

        expect(criarSalaDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            'Sala A',
        )
    })

    it('retorna erros de validação do serviço sem convertê-los em sucesso', async () => {
        criarSalaDoTenant.mockRejectedValue(new TenantRoomError('Nome inválido.', 400))

        const response = await request(app)
            .post('/api/tenant/rooms')
            .send({ name: '' })
            .expect(400)

        expect(response.body).toEqual({ sucesso: false, mensagem: 'Nome inválido.' })
    })
})
