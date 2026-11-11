import express from 'express'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import {
    associarQrCodeASalaDoTenant,
    criarQrCodeDoTenant,
    listarQrCodesDoTenant,
    revogarQrCodeDoTenant,
    TenantQrCodeError,
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

router.get('/qrcodes', authorizeTenantPermission('qrcodes:read'), async (req, res, next) => {
    try {
        const qrcodes = await listarQrCodesDoTenant(req.tenant.id)
        return res.json({ sucesso: true, qrcodes })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/qrcodes', authorizeTenantPermission('qrcodes:manage'), async (req, res, next) => {
    try {
        const qrcode = await criarQrCodeDoTenant(req.tenant.id)
        return res.status(201).json({ sucesso: true, qrcode })
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
