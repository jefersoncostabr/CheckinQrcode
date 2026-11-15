import express from 'express'
import path from 'path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'url'
import { requireTenantAuth } from '../middleware/auth.js'
import { authorizeTenantPermission, loadActiveTenant, roleHasTenantPermission } from '../middleware/authorizeTenant.js'

const router = express.Router()
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

router.use(requireTenantAuth)

router.get('/', loadActiveTenant, async (req, res, next) => {
    try {
        let html = await readFile(path.join(publicDir, 'adm.html'), 'utf8')
        if (roleHasTenantPermission(req.tenant.role, 'biometrics:manage')) {
            html = html.replace('id="btnTestarBiometria" hidden', 'id="btnTestarBiometria"')
        }
        if (roleHasTenantPermission(req.tenant.role, 'reports:read')) {
            html = html.replace('id="btnRelatorio" hidden', 'id="btnRelatorio"')
        }
        if (roleHasTenantPermission(req.tenant.role, 'advanced:read')) {
            html = html.replace('id="btnAvancado" hidden', 'id="btnAvancado"')
        }
        res.set('Cache-Control', 'private, no-store')
        res.type('html').send(html)
    } catch (error) {
        next(error)
    }
})

router.get('/avancado', authorizeTenantPermission('advanced:read'), (req, res) => {
    res.set('Cache-Control', 'private, no-store')
    res.sendFile(path.join(publicDir, '..', 'src', 'views', 'admAvancado.html'))
})

router.get('/adicionar-manual', authorizeTenantPermission('attendance:create'), (req, res) => {
    res.sendFile(path.join(publicDir, 'admAdd.html'))
})

router.get('/monitor-facial', authorizeTenantPermission('biometrics:manage'), (req, res) => {
    res.sendFile(path.join(publicDir, 'admFaceMonitor.html'))
})

router.get('/relatorio', authorizeTenantPermission('reports:read'), (req, res) => {
    res.sendFile(path.join(publicDir, 'relatorio.html'))
})

export default router
