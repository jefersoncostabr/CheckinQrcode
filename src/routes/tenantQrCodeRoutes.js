import express from 'express'
import { generateQRCodeBuffer, getQrBaseUrl } from '../services/qrCodeService.js'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import {
    associarQrCodeASalaDoTenant,
    criarQrCodeDoTenant,
    listarQrCodesDoTenant,
    rotacionarQrCodeDoTenant,
    revogarQrCodeDoTenant,
    TenantQrCodeError,
    TENANT_QR_CODE_LIMIT,
} from '../services/tenantQrCodeService.js'

const router = express.Router()

function responderErro(error, res, next) {
    if (error instanceof TenantQrCodeError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

async function montarQrCodeVisual(req, token) {
    const baseUrl = getQrBaseUrl(req)
    if (!baseUrl) {
        throw new TenantQrCodeError(
            'Não foi possível determinar o endereço público. Configure PUBLIC_BASE_URL.',
            503,
        )
    }
    const url = `${baseUrl}/add#${token}`
    const buffer = await generateQRCodeBuffer(url)
    return {
        url,
        qrCodeDataUri: `data:image/png;base64,${buffer.toString('base64')}`,
    }
}

router.get('/qrcodes', authorizeTenantPermission('qrcodes:read'), async (req, res, next) => {
    try {
        const qrcodes = await listarQrCodesDoTenant(req.tenant.id)
        return res.json({
            sucesso: true,
            qrcodes,
            limite: TENANT_QR_CODE_LIMIT,
            quantidadeAtiva: qrcodes.filter(qrcode => qrcode.status !== 'revoked').length,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/qrcodes', authorizeTenantPermission('qrcodes:manage'), async (req, res, next) => {
    try {
        const baseUrl = getQrBaseUrl(req)
        if (!baseUrl) {
            return res.status(503).json({
                sucesso: false,
                mensagem: 'Não foi possível determinar o endereço público. Configure PUBLIC_BASE_URL.',
            })
        }
        const qrcode = await criarQrCodeDoTenant(req.tenant.id)
        const visual = await montarQrCodeVisual(req, qrcode.token)
        return res.status(201).json({
            sucesso: true,
            qrcode: { ...qrcode, ...visual },
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/qrcodes/:id/rotate', authorizeTenantPermission('qrcodes:manage'), async (req, res, next) => {
    try {
        const qrcode = await rotacionarQrCodeDoTenant(req.tenant.id, req.params.id)
        if (!qrcode) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'QR Code ativo associado a uma sala não encontrado.',
            })
        }
        const visual = await montarQrCodeVisual(req, qrcode.token)
        return res.json({ sucesso: true, qrcode: { ...qrcode, ...visual } })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.patch('/qrcodes/:id', authorizeTenantPermission('qrcodes:manage'), async (req, res, next) => {
    try {
        const qrcode = await associarQrCodeASalaDoTenant(
            req.tenant.id,
            req.params.id,
            req.body?.roomId,
        )
        if (!qrcode) {
            return res.status(404).json({ sucesso: false, mensagem: 'QR Code ou sala não encontrado.' })
        }
        return res.json({ sucesso: true, qrcode })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/qrcodes/:id', authorizeTenantPermission('qrcodes:manage'), async (req, res, next) => {
    try {
        const qrcode = await revogarQrCodeDoTenant(req.tenant.id, req.params.id)
        if (!qrcode) {
            return res.status(404).json({ sucesso: false, mensagem: 'QR Code não encontrado.' })
        }
        return res.json({ sucesso: true, qrcode })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
