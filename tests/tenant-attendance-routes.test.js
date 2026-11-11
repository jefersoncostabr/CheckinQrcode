import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const appliedPermissions = []
const authorizeTenantPermission = jest.fn(permission => (req, res, next) => {
    appliedPermissions.push(permission)
    req.tenant = { id: '65f1a0000000000000000001' }
    next()
})
const listarPresencasDoTenant = jest.fn()
const gerarRelatorioDePresencasDoTenant = jest.fn()
const excluirPresencaDoTenant = jest.fn()
class TenantAttendanceError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

jest.unstable_mockModule('../src/middleware/authorizeTenant.js', () => ({
    authorizeTenantPermission,
}))
jest.unstable_mockModule('../src/services/tenantAttendanceService.js', () => ({
    listarPresencasDoTenant,
    gerarRelatorioDePresencasDoTenant,
    excluirPresencaDoTenant,
    TenantAttendanceError,
}))

const { default: tenantAttendanceRoutes } = await import('../src/routes/tenantAttendanceRoutes.js')

const app = express()
app.use(express.json())
app.use('/api/tenant', tenantAttendanceRoutes)

describe('rotas de presenças e relatórios tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        appliedPermissions.length = 0
    })

    it('usa permissões específicas para consultar, relatar e remover presenças', async () => {
        listarPresencasDoTenant.mockResolvedValue({
            presencas: [],
            paginacao: { pagina: 1, porPagina: 100, total: 0, totalPaginas: 0 },
        })
        gerarRelatorioDePresencasDoTenant.mockResolvedValue({ total: 0, salas: [] })
        excluirPresencaDoTenant.mockResolvedValue({ id: 'attendance-id' })

        await request(app).get('/api/tenant/attendances').expect(200)
        await request(app).get('/api/tenant/reports/attendance').expect(200)
        await request(app).delete('/api/tenant/attendances/attendance-id').expect(200)

        expect(appliedPermissions).toEqual([
            'attendance:read',
            'reports:read',
            'attendance:manage',
        ])
    })

    it('usa tenant validado e passa somente filtros permitidos do cliente', async () => {
        listarPresencasDoTenant.mockResolvedValue({
            presencas: [],
            paginacao: { pagina: 2, porPagina: 100, total: 0, totalPaginas: 0 },
        })

        await request(app)
            .get('/api/tenant/attendances?page=2&roomId=65f1a0000000000000000002&tenantId=attacker')
            .expect(200)

        expect(listarPresencasDoTenant).toHaveBeenCalledWith(
            '65f1a0000000000000000001',
            { roomId: '65f1a0000000000000000002', page: '2' },
        )
    })

    it('não informa se presença de outro tenant existe', async () => {
        excluirPresencaDoTenant.mockResolvedValue(null)

        const response = await request(app)
            .delete('/api/tenant/attendances/65f1a0000000000000000003')
            .expect(404)

        expect(response.body).toEqual({
            sucesso: false,
            mensagem: 'Presença não encontrada.',
        })
    })
})
