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
    })

    it('serve uma tela visual de criação de conta sem formulário de envio', async () => {
        const response = await request(app).get('/criar-conta.html')

        expect(response.status).toBe(200)
        expect(response.text).toContain('Criar conta em breve')
        expect(response.text).toContain('type="button" disabled')
        expect(response.text).not.toContain('<form')
        expect(response.text).not.toContain('<script')
    })

    it('serve a folha de estilos compartilhada pelas telas de autenticação', async () => {
        const response = await request(app).get('/auth.css')

        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('text/css')
        expect(response.text).toContain('.auth-card')
    })
})
