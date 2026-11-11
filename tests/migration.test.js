import app from '../src/app.js'
import * as authMiddleware from '../src/middleware/auth.js'
import * as faceEnrollment from '../src/middleware/faceEnrollment.js'
import FaceProfile from '../src/models/faceProfileModel.js'
import LotacaoSala from '../src/models/lotacaoSalaModel.js'
import adminRoutes from '../src/routes/adminRoutes.js'
import routes from '../src/routes/routes.js'
import tenantQrCodeRoutes from '../src/routes/tenantQrCodeRoutes.js'
import tenantRoomRoutes from '../src/routes/tenantRoomRoutes.js'
import tenantCheckinRoutes from '../src/routes/tenantCheckinRoutes.js'
import tenantAttendanceRoutes from '../src/routes/tenantAttendanceRoutes.js'
import tenantAuthRoutes from '../src/routes/tenantAuthRoutes.js'
import tenantBiometricRoutes from '../src/routes/tenantBiometricRoutes.js'
import * as qrCodeService from '../src/services/qrCodeService.js'
import * as salasService from '../src/services/salasService.js'
import request from 'supertest'

function listarRotas(router, prefixo = '') {
    return router.stack
        .filter(layer => layer.route)
        .flatMap(layer =>
            Object.keys(layer.route.methods).map(
                method => `${method.toUpperCase()} ${prefixo}${layer.route.path}`,
            ),
        )
}

describe('regressão da reorganização de arquivos', () => {
    it('mantém os exports dos serviços, middlewares e modelos movidos', () => {
        expect(Object.keys(salasService).sort()).toEqual([
            'LIMITE_QRCODES',
            'criarQrDisponivel',
            'encontrarQr',
            'encontrarSala',
            'encontrarSalaPorId',
            'encontrarSalaPorNome',
            'getConfigDoc',
            'normalizarTexto',
            'serializarSala',
        ])
        expect(Object.keys(qrCodeService).sort()).toEqual([
            'generateQRCodeBuffer',
            'generateQRCodeFile',
            'getQrBaseUrl',
        ])
        expect(Object.keys(faceEnrollment).sort()).toEqual([
            'FACE_DESCRIPTOR_LENGTH',
            'cadastrarPerfilFacial',
            'validarDescritor',
            'verificarCadastroFacial',
        ])
        expect(Object.keys(authMiddleware)).toEqual(expect.arrayContaining(['requireAuth']))
        expect(FaceProfile.modelName).toBe('FaceProfile')
        expect(LotacaoSala.modelName).toBe('LotacaoSala')
    })

    it('mantém todas as rotas que existiam antes da reorganização', () => {
        const rotasOriginais = [
            'GET /',
            'GET /api/rotas',
            'GET /login',
            'POST /login',
            'GET /logout',
            'GET /qtd',
            'GET /add',
            'GET /teste-rosto',
            'GET /api/checkin/sala',
            'POST /api/checkin/tenant/resolve',
            'POST /api/checkin/tenant/attendance',
            'POST /api/checkin/tenant/biometrics/enroll',
            'POST /api/checkin/tenant/biometrics/checkin',
            'DELETE /api/checkin/tenant/biometrics/profiles/:id',
            'POST /add',
            'POST /api/face/enroll',
            'POST /api/face/checkin',
            'POST /api/face/verify',
            'GET /api/face/pessoas',
            'DELETE /api/face/profile/:id',
            'DELETE /reduce',
            'DELETE /clean',
            'GET /resetls',
            'GET /api/relatorio',
            'GET /api/salas',
            'POST /api/salas',
            'DELETE /api/salas',
            'PATCH /api/salas/:id',
            'GET /api/qrcodes',
            'POST /api/qrcodes',
            'DELETE /api/qrcodes/:id',
            'GET /relatorio',
            'POST /adm/adicionar-manual',
            'GET /adm/adicionar-manual',
            'GET /adm/adicionar-manual',
            'GET /adm',
            'GET /adm/',
            'GET /adm/monitor-facial',
            'GET /adm/monitor-facial',
            'GET /adm/relatorio',
            'GET /adm/resetls',
            'GET /api/tenant/rooms',
            'POST /api/tenant/auth/register',
            'POST /api/tenant/auth/login',
            'POST /api/tenant/auth/select',
            'POST /api/tenant/auth/switch',
            'GET /api/tenant/auth/session',
            'POST /api/tenant/auth/logout',
            'POST /api/tenant/rooms',
            'PATCH /api/tenant/rooms/:id',
            'DELETE /api/tenant/rooms/:id',
            'GET /api/tenant/qrcodes',
            'POST /api/tenant/qrcodes',
            'PATCH /api/tenant/qrcodes/:id',
            'DELETE /api/tenant/qrcodes/:id',
            'GET /api/tenant/attendances',
            'GET /api/tenant/reports/attendance',
            'DELETE /api/tenant/attendances/:id',
            'GET /api/tenant/dashboard',
            'POST /api/tenant/attendances/manual',
            'DELETE /api/tenant/attendances/latest',
            'DELETE /api/tenant/attendances',
            'GET /api/tenant/biometrics/profiles',
            'POST /api/tenant/biometrics/enroll',
            'DELETE /api/tenant/biometrics/profiles/:id',
            'POST /api/tenant/biometrics/verify',
            'POST /api/tenant/biometrics/checkin',
            'POST /api/tenant/qrcodes/:id/rotate',
        ].sort()

        const rotasAtuais = [
            ...listarRotas(routes),
            ...listarRotas(adminRoutes, '/adm'),
            ...listarRotas(tenantRoomRoutes, '/api/tenant'),
            ...listarRotas(tenantQrCodeRoutes, '/api/tenant'),
            ...listarRotas(tenantCheckinRoutes, '/api/checkin/tenant'),
            ...listarRotas(tenantAttendanceRoutes, '/api/tenant'),
            ...listarRotas(tenantAuthRoutes, '/api/tenant/auth'),
            ...listarRotas(tenantBiometricRoutes, '/api/tenant'),
        ].sort()

        expect(rotasAtuais).toEqual(rotasOriginais)
    })

    it('carrega o app e continua servindo as páginas públicas após a mudança de caminhos', async () => {
        const paginas = [
            ['/login', 'Login'],
            ['/add', 'check-in'],
        ]

        for (const [url, textoEsperado] of paginas) {
            const response = await request(app).get(url)
            expect(response.status).toBe(200)
            expect(response.text.toLowerCase()).toContain(textoEsperado.toLowerCase())
        }

        await request(app).get('/teste-rosto').expect(302).expect('Location', '/login')
        await request(app).get('/adm/monitor-facial').expect(302).expect('Location', '/login')
    })

    it('desativa os endpoints globais legados e protege a contagem por tenant', async () => {
        await request(app).post('/login').send({ user: 'admin', pass: 'senha' }).expect(410)
        await request(app).post('/add').send({ nome: 'Pessoa', sala: 'Sala antiga' }).expect(410)
        await request(app).get('/api/checkin/sala?sala=Sala%20antiga').expect(410)
        await request(app).post('/api/face/checkin').send({ descritor: Array(128).fill(0) }).expect(410)
        await request(app).get('/api/salas').expect(410)
        await request(app).get('/qtd').expect(401)
    })

    it('mantém a nova API tenant fechada sem contexto tenant autenticado', async () => {
        const response = await request(app).get('/api/tenant/rooms')
        expect(response.status).toBe(401)
        expect(response.body.sucesso).toBe(false)

        const qrResponse = await request(app).get('/api/tenant/qrcodes')
        expect(qrResponse.status).toBe(401)
        expect(qrResponse.body.sucesso).toBe(false)

        const attendanceResponse = await request(app).get('/api/tenant/attendances')
        expect(attendanceResponse.status).toBe(401)
        expect(attendanceResponse.body.sucesso).toBe(false)

        const reportResponse = await request(app).get('/api/tenant/reports/attendance')
        expect(reportResponse.status).toBe(401)
        expect(reportResponse.body.sucesso).toBe(false)
    })
})
