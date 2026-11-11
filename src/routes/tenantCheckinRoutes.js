import express from 'express'
import {
    registrarCheckinPorQrTenant,
    resolverQrCodeDeCheckin,
    TenantCheckinError,
} from '../services/tenantCheckinService.js'
import {
    cadastrarBiometriaDoTenant,
    excluirBiometriaDoTenant,
    registrarCheckinFacialDoTenant,
    TenantBiometricError,
} from '../services/tenantBiometricService.js'

const router = express.Router()

function responderErro(error, res, next) {
    if (error instanceof TenantCheckinError || error instanceof TenantBiometricError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

router.post('/resolve', async (req, res, next) => {
    try {
        const resultado = await resolverQrCodeDeCheckin(req.body?.token)
        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'QR Code inválido ou sala não disponível.',
            })
        }
        if (!resultado.aberta) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Esta sala está fechada para check-in.',
            })
        }
        return res.json({ sucesso: true, sala: resultado.sala })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/attendance', async (req, res, next) => {
    try {
        const resultado = await registrarCheckinPorQrTenant({
            token: req.body?.token,
            name: req.body?.nome,
            sourceIp: req.ip,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Check-in realizado!',
            sala: resultado.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/biometrics/enroll', async (req, res, next) => {
    try {
        const resultado = await cadastrarBiometriaDoTenant({
            token: req.body?.token,
            name: req.body?.nome,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Perfil biométrico cadastrado.',
            perfilId: resultado.profileId,
            tokenExclusao: resultado.deleteToken,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/biometrics/checkin', async (req, res, next) => {
    try {
        await registrarCheckinFacialDoTenant({
            token: req.body?.token,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
            sourceIp: req.ip,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Presença confirmada.',
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/biometrics/profiles/:id', async (req, res, next) => {
    try {
        await excluirBiometriaDoTenant({
            profileId: req.params.id,
            deleteToken: req.get('x-biometric-delete-token'),
        })
        return res.json({
            sucesso: true,
            mensagem: 'Perfil biométrico excluído e consentimento retirado.',
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
