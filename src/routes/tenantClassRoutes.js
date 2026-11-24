import express from 'express'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import {
    cadastrarAulaDoTenant,
    listarAulasDoTenant,
    iniciarAulaDoTenant,
    encerrarAulaDoTenant,
    gerarQrStartClassDoTenant,
    consumirQrStartClassDoTenant,
    TenantClassError,
} from '../services/tenantClassService.js'
import { generateQRCodeBuffer, getQrBaseUrl } from '../services/qrCodeService.js'

const router = express.Router()

router.use('/classes', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next()
    const origin = req.get('origin')
    const expectedOrigin = `${req.protocol}://${req.get('host')}`
    const contentType = req.get('content-type')?.split(';')[0].trim().toLowerCase()
    if (!origin || origin !== expectedOrigin || contentType !== 'application/json') {
        return res.status(403).json({ sucesso: false, mensagem: 'Origem ou tipo de requisição inválido.' })
    }
    return next()
})

function responderErro(error, res, next) {
    if (error instanceof TenantClassError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

router.get('/classes', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const aulas = await listarAulasDoTenant(req.tenant.id)
        return res.json({ sucesso: true, aulas })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/classes', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const aula = await cadastrarAulaDoTenant(
            req.tenant.id,
            req.session?.tenantAuth?.userId,
            {
                name: req.body?.name,
                startTime: req.body?.startTime,
                endTime: req.body?.endTime,
            },
        )
        return res.status(201).json({ sucesso: true, aula })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/classes/:id/start', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const resultado = await iniciarAulaDoTenant(req.tenant.id, req.params.id, req.body?.roomId)
        return res.json({ sucesso: true, ...resultado })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/classes/:id/close', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const resultado = await encerrarAulaDoTenant(req.tenant.id, req.params.id)
        return res.json({ sucesso: true, ...resultado })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/classes/:id/start-qr', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const baseUrl = getQrBaseUrl(req)
        if (!baseUrl) {
            return res.status(503).json({
                sucesso: false,
                mensagem: 'Não foi possível determinar o endereço público. Configure PUBLIC_BASE_URL.',
            })
        }
        const resultado = await gerarQrStartClassDoTenant(req.tenant.id, req.params.id, req.body?.roomId)
        const qrPayload = `${baseUrl}/add#class-start=${resultado.token}`
        const buffer = await generateQRCodeBuffer(qrPayload)
        const qrCodeDataUri = `data:image/png;base64,${buffer.toString('base64')}`

        return res
            .set('Cache-Control', 'no-store')
            .status(201)
            .json({
                sucesso: true,
                qrCodeDataUri,
                expiresAt: resultado.expiresAt,
            })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/classes/start-from-qr', authorizeTenantPermission('classes:manage'), async (req, res, next) => {
    try {
        const token = req.body?.token
        const resultado = await consumirQrStartClassDoTenant(req.tenant.id, token)
        return res.json({ sucesso: true, ...resultado })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
