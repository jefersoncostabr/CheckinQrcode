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

    it('exibe a página para uma sessão com vínculo ativo', async () => {
        findActiveMembership.mockResolvedValue({
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'owner',
        })

        const response = await request(createApp(true)).get('/adm/avancado')

        expect(response.status).toBe(200)
        expect(response.headers['cache-control']).toBe('private, no-store')
        expect(response.text).toContain('Bloco de teste')
        expect(response.text).toContain('Lorem ipsum')
        expect(response.text).toContain('class="status-message"')
        expect(response.text).toContain('src="/navbar.js"')
        expect(response.text).toContain('href="/admEstilo.css"')
    })

    it('nega acesso quando o vínculo não está ativo', async () => {
        findActiveMembership.mockResolvedValue(null)

        const response = await request(createApp(true)).get('/adm/avancado')

        expect(response.status).toBe(403)
    })
})
