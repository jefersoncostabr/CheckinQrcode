import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const findActiveMembership = jest.fn()
jest.unstable_mockModule('../src/services/tenantAuthService.js', () => ({
    findActiveMembership,
}))

const { default: adminRoutes } = await import('../src/routes/adminRoutes.js')

const app = express()
app.use((req, res, next) => {
    req.session = {
        tenantAuth: { userId: 'user', tenantId: 'tenant', membershipId: 'membership', role: 'owner' },
    }
    next()
})
app.use('/adm', adminRoutes)

test.each([
    ['owner', true, true, true],
    ['admin', true, true, true],
    ['viewer', false, true, false],
    ['operator', false, false, false],
    ['user', false, false, false],
])('renderiza links iniciais conforme o vínculo ativo de %s', async (role, facial, relatorio, avancado) => {
    findActiveMembership.mockResolvedValue({ tenantId: 'tenant', membershipId: 'membership', role })

    const response = await request(app).get('/adm').expect(200)

    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.text).toContain(`id="btnTestarBiometria"${facial ? '' : ' hidden'} href=`)
    expect(response.text).toContain(`id="btnRelatorio"${relatorio ? '' : ' hidden'} href=`)
    expect(response.text).toContain(`id="btnAvancado"${avancado ? '' : ' hidden'} href="/adm/avancado"`)
    expect(findActiveMembership).toHaveBeenCalledWith('user', 'tenant', 'membership')
})

test('não entrega o painel quando o vínculo não está ativo', async () => {
    findActiveMembership.mockResolvedValue(null)

    await request(app).get('/adm').expect(403)
})
