import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const findActiveMembership = jest.fn()

jest.unstable_mockModule('../src/services/tenantAuthService.js', () => ({
    findActiveMembership,
}))

const { default: adminRoutes } = await import('../src/routes/adminRoutes.js')

function createApp(authenticated) {
    const app = express()

    app.use((req, res, next) => {
        if (authenticated) {
            req.session = {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'membership-id',
                    role: 'owner',
                },
            }
        }
        next()
    })

    app.use('/adm', adminRoutes)
    return app
}

describe('página administrativa avançada', () => {
    beforeEach(() => {
        findActiveMembership.mockReset()
    })

    it('redireciona para login sem sessão', async () => {
        const response = await request(createApp(false)).get('/adm/avancado')

        expect(response.status).toBe(302)
        expect(response.headers.location).toBe('/login')
        expect(findActiveMembership).not.toHaveBeenCalled()
    })

    it.each(['owner', 'admin'])('permite acesso ao papel %s', async role => {
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role,
        })

        const response = await request(createApp(true)).get('/adm/avancado')

        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toBe('private, no-store')
        expect(response.text).toContain('Períodos de check-in')
        expect(response.text).toContain('/api/tenant/checkin-periods')
        expect(response.text).toContain('class="status-message"')
        expect(response.text).toContain('src="/navbar.js"')
        expect(response.text).toContain('href="/admEstilo.css"')
        expect(findActiveMembership).toHaveBeenCalledWith(
            'user-id',
            'tenant-id',
            'membership-id',
        )
    })

    it.each(['operator', 'viewer', 'user', 'unknown'])(
        'nega acesso ao papel %s mesmo com owner na sessão',
        async role => {
            findActiveMembership.mockResolvedValue({
                tenantId: 'tenant-id',
                membershipId: 'membership-id',
                role,
            })

            const response = await request(createApp(true)).get('/adm/avancado')

            expect(response.status).toBe(403)
            expect(response.text).not.toContain('Bloco de teste')
        },
    )

    it('nega acesso quando o vínculo não está ativo', async () => {
        findActiveMembership.mockResolvedValue(null)

        const response = await request(createApp(true)).get('/adm/avancado')

        expect(response.status).toBe(403)
    })
})
