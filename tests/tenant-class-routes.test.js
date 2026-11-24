import { jest } from '@jest/globals'
import express from 'express'
import request from 'supertest'

const gerarQrStartClassDoTenant = jest.fn()
const generateQRCodeBuffer = jest.fn()
class TenantClassError extends Error {}

jest.unstable_mockModule('../src/middleware/authorizeTenant.js', () => ({
    authorizeTenantPermission: () => (req, res, next) => {
        req.tenant = { id: 'tenant-id' }
        next()
    },
}))
jest.unstable_mockModule('../src/services/tenantClassService.js', () => ({
    cadastrarAulaDoTenant: jest.fn(),
    listarAulasDoTenant: jest.fn(),
    iniciarAulaDoTenant: jest.fn(),
    encerrarAulaDoTenant: jest.fn(),
    gerarQrStartClassDoTenant,
    consumirQrStartClassDoTenant: jest.fn(),
    TenantClassError,
}))
jest.unstable_mockModule('../src/services/qrCodeService.js', () => ({
    generateQRCodeBuffer,
    getQrBaseUrl: () => 'https://example.test',
}))
const { default: routes } = await import('../src/routes/tenantClassRoutes.js')
const app = express()
app.use(express.json())
app.use('/api/tenant', routes)

test('gera QR de abertura no formato de URL do projeto', async () => {
    const token = 'A'.repeat(43)
    gerarQrStartClassDoTenant.mockResolvedValue({ token, expiresAt: new Date() })
    generateQRCodeBuffer.mockResolvedValue(Buffer.from('imagem'))
    const response = await request(app).post('/api/tenant/classes/id/start-qr')
        .set('Origin', 'http://example.test')
        .set('Host', 'example.test')
        .set('Content-Type', 'application/json')
        .send({ roomId: 'room-id' })
    expect(response.status).toBe(201)
    expect(generateQRCodeBuffer).toHaveBeenCalledWith(`https://example.test/add#class-start=${token}`)
    expect(gerarQrStartClassDoTenant).toHaveBeenCalledWith('tenant-id', 'id', 'room-id')
    expect(response.headers['cache-control']).toBe('no-store')
})

test('bloqueia requisições sem origem válida ou sem JSON', async () => {
    await request(app).post('/api/tenant/classes/id/start')
        .set('Origin', 'https://outro.test')
        .set('Content-Type', 'application/json')
        .expect(403)
    await request(app).post('/api/tenant/classes/id/start')
        .set('Origin', 'http://example.test')
        .set('Host', 'example.test')
        .set('Content-Type', 'text/plain')
        .expect(403)
})
