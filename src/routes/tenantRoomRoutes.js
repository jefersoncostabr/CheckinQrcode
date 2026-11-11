import express from 'express'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import {
    arquivarSalaDoTenant,
    alterarEstadoSalaDoTenant,
    criarSalaDoTenant,
    listarSalasDoTenant,
    TenantRoomError,
} from '../services/tenantRoomService.js'

const router = express.Router()

function responderErro(error, res, next) {
    if (error instanceof TenantRoomError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

router.get('/rooms', authorizeTenantPermission('rooms:read'), async (req, res, next) => {
    try {
        const salas = await listarSalasDoTenant(req.tenant.id)
        return res.json({ sucesso: true, salas })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/rooms', authorizeTenantPermission('rooms:manage'), async (req, res, next) => {
    try {
        const sala = await criarSalaDoTenant(req.tenant.id, req.body?.name)
        return res.status(201).json({ sucesso: true, sala })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.patch('/rooms/:id', authorizeTenantPermission('rooms:manage'), async (req, res, next) => {
    try {
        const sala = await alterarEstadoSalaDoTenant(
            req.tenant.id,
            req.params.id,
            req.body?.status,
        )
        if (!sala) {
            return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        }
        return res.json({ sucesso: true, sala })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/rooms/:id', authorizeTenantPermission('rooms:manage'), async (req, res, next) => {
    try {
        const sala = await arquivarSalaDoTenant(req.tenant.id, req.params.id)
        if (!sala) {
            return res.status(404).json({ sucesso: false, mensagem: 'Sala não encontrada.' })
        }
        return res.json({ sucesso: true, sala })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
