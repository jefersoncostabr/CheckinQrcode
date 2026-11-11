import app from '../src/app.js'
import request from 'supertest'

describe('telas de autenticação', () => {
    it('mantém o login conectado ao endpoint atual', async () => {
        const response = await request(app).get('/login')

        expect(response.status).toBe(200)
        expect(response.text).toContain('method="POST" action="/login"')
        expect(response.text).toContain('name="user"')
        expect(response.text).toContain('name="pass"')
        expect(response.text).toContain('href="/criar-conta.html"')
        expect(response.text).toContain('/api/tenant/auth/login')
        expect(response.text).toContain('/api/tenant/auth/select')
    })

    it('serve o formulário de criação de conta conectado ao endpoint tenant', async () => {
        const response = await request(app).get('/criar-conta.html')

        expect(response.status).toBe(200)
        expect(response.text).toContain('id="tenantName"')
        expect(response.text).toContain('id="registerForm"')
        expect(response.text).toContain('/api/tenant/auth/register')
    })

    it('serve a folha de estilos compartilhada pelas telas de autenticação', async () => {
        const response = await request(app).get('/auth.css')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('text/css')
        expect(response.text).toContain('.auth-card')
    })
})
