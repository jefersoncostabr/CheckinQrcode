import express from 'express'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'
import {
    excluirPresencaDoTenant,
    gerarRelatorioDePresencasDoTenant,
    listarPresencasDoTenant,
    TenantAttendanceError,
} from '../services/tenantAttendanceService.js'

const router = express.Router()

function responderErro(error, res, next) {
    if (error instanceof TenantAttendanceError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

router.get('/attendances', authorizeTenantPermission('attendance:read'), async (req, res, next) => {
    try {
        const resultado = await listarPresencasDoTenant(req.tenant.id, {
            roomId: req.query.roomId,
            page: req.query.page,
        })
        return res.json({ sucesso: true, ...resultado })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.get('/reports/attendance', authorizeTenantPermission('reports:read'), async (req, res, next) => {
    try {
        const relatorio = await gerarRelatorioDePresencasDoTenant(req.tenant.id)
        return res.json({ sucesso: true, ...relatorio })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/attendances/:id', authorizeTenantPermission('attendance:manage'), async (req, res, next) => {
    try {
        const presenca = await excluirPresencaDoTenant(req.tenant.id, req.params.id)
        if (!presenca) {
            return res.status(404).json({ sucesso: false, mensagem: 'Presença não encontrada.' })
        }
        return res.json({ sucesso: true })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
