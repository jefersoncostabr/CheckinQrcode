import express from 'express'
import mongoose from 'mongoose'
import Room from '../models/roomModel.js'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import { CheckinPeriodError } from '../services/checkinPeriodService.js'
import {
    cadastrarBiometriaAdminDoTenant,
    excluirBiometriaAdministrativaDoTenant,
    listarPerfisBiometricosDoTenant,
    registrarCheckinFacialNaSalaDoTenant,
    TenantBiometricError,
    verificarBiometriaDoTenant,
} from '../services/tenantBiometricService.js'

const router = express.Router()

function responderErro(error, res, next) {
    if (error instanceof TenantBiometricError || error instanceof CheckinPeriodError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
            ...(error.code ? { codigo: error.code } : {}),
        })
    }
    return next(error)
}

router.get('/biometrics/profiles', authorizeTenantPermission('biometrics:manage'), async (req, res, next) => {
    try {
        const pessoas = await listarPerfisBiometricosDoTenant(req.tenant.id)
        return res.json({ sucesso: true, pessoas })
    } catch (error) {
        return next(error)
    }
})

router.post('/biometrics/enroll', authorizeTenantPermission('biometrics:manage'), async (req, res, next) => {
    try {
        const perfil = await cadastrarBiometriaAdminDoTenant({
            tenantId: req.tenant.id,
            name: req.body?.nome,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Perfil biométrico cadastrado.',
            perfilId: perfil.profileId,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/biometrics/profiles/:id', authorizeTenantPermission('biometrics:manage'), async (req, res, next) => {
    try {
        const deleted = await excluirBiometriaAdministrativaDoTenant(req.tenant.id, req.params.id)
        if (!deleted) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'Perfil biométrico não encontrado.',
            })
        }
        return res.json({ sucesso: true, mensagem: 'Perfil biométrico removido.' })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/biometrics/verify', authorizeTenantPermission('biometrics:manage'), async (req, res, next) => {
    try {
        const result = await verificarBiometriaDoTenant({
            tenantId: req.tenant.id,
            descriptor: req.body?.descritor,
            name: req.body?.nome,
        })
        return res.json({ sucesso: true, ...result })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.get('/biometrics/monitor/:roomId', authorizeTenantPermission('biometrics:monitor'), async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params.roomId)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Sala inválida.' })
    }
    try {
        const sala = await Room.findOne({
            _id: req.params.roomId,
            tenantId: req.tenant.id,
            status: 'open',
        }).select('currentPeriodId').lean()
        return res.set('Cache-Control', 'no-store').json({
            sucesso: true,
            periodoId: sala?.currentPeriodId ? String(sala.currentPeriodId) : null,
        })
    } catch (error) {
        return next(error)
    }
})

router.post('/biometrics/checkin', authorizeTenantPermission('attendance:create'), async (req, res, next) => {
    try {
        const result = await registrarCheckinFacialNaSalaDoTenant({
            tenantId: req.tenant.id,
            roomId: req.body?.roomId,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
            sourceIp: req.ip,
            ...(req.body?.periodoId != null ? { periodoId: req.body.periodoId } : {}),
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Presença confirmada.',
            sala: result.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
