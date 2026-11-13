import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { requireTenantAuth } from '../middleware/auth.js'
import { authorizeTenantPermission } from '../middleware/authorizeTenant.js'

const router = express.Router()
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

router.use(requireTenantAuth)

router.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'adm.html'))
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
