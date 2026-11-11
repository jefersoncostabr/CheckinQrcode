import express from 'express'
import { findActiveMembership, authenticateTenantUser } from '../services/tenantAuthService.js'
import {
    RegistrationConflictError,
    RegistrationValidationError,
    createTenantOwner,
} from '../services/tenantRegistrationService.js'
import { establishTenantSession } from '../middleware/auth.js'

const router = express.Router()

function publicIdentity(identity, membership) {
    return {
        user: {
            id: identity.userId,
            name: identity.name,
        },
        tenant: {
            id: membership.tenantId,
            membershipId: membership.membershipId,
            name: membership.tenantName,
            role: membership.role,
        },
    }
}

function establishPendingTenantSession(req, identity) {
    if (!req.session?.regenerate || !req.session?.save) {
        throw new Error('A sessão HTTP não está disponível.')
    }

    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) {
                reject(error)
                return
            }

            req.session.pendingTenantAuth = {
                userId: identity.userId,
                name: identity.name,
                memberships: identity.memberships.map(({ membershipId, tenantId }) => ({
                    membershipId,
                    tenantId,
                })),
            }

            req.session.save(saveError => {
                if (saveError) {
                    reject(saveError)
                    return
                }
                resolve()
            })
        })
    })
}

function handleRegistrationError(error, res, next) {
    if (error instanceof RegistrationValidationError || error instanceof RegistrationConflictError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

router.post('/register', async (req, res, next) => {
    try {
        const created = await createTenantOwner(req.body)
        const identity = {
            userId: String(created.userId),
            name: req.body.name.trim(),
        }
        const membership = {
            tenantId: String(created.tenantId),
            membershipId: String(created.membershipId),
            tenantName: req.body.tenantName.trim(),
            role: 'owner',
        }

        await establishTenantSession(req, identity, membership)
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Conta e organização criadas.',
            ...publicIdentity(identity, membership),
        })
    } catch (error) {
        return handleRegistrationError(error, res, next)
    }
})

router.post('/login', async (req, res, next) => {
    try {
        const identity = await authenticateTenantUser(req.body?.email, req.body?.password)
        if (!identity) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'E-mail ou senha incorretos, ou nenhuma organização ativa disponível.',
            })
        }

        if (identity.memberships.length === 1) {
            const [membership] = identity.memberships
            await establishTenantSession(req, identity, membership)
            return res.json({
                sucesso: true,
                mensagem: 'Autenticação concluída.',
                ...publicIdentity(identity, membership),
            })
        }

        await establishPendingTenantSession(req, identity)
        return res.json({
            sucesso: true,
            selecaoNecessaria: true,
            memberships: identity.memberships,
        })
    } catch (error) {
        return next(error)
    }
})

router.post('/select', async (req, res, next) => {
    const pending = req.session?.pendingTenantAuth
    const membership = pending?.memberships?.find(
        item => item.membershipId === req.body?.membershipId,
    )
    if (!pending?.userId || !membership) {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'Faça login novamente para selecionar uma organização.',
        })
    }

    try {
        const activeMembership = await findActiveMembership(
            pending.userId,
            membership.tenantId,
            membership.membershipId,
        )
        if (!activeMembership) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'O vínculo com esta organização não está mais ativo.',
            })
        }

        const identity = {
            userId: pending.userId,
            name: pending.name,
        }
        await establishTenantSession(req, identity, activeMembership)
        return res.json({
            sucesso: true,
            mensagem: 'Organização selecionada.',
            ...publicIdentity(identity, activeMembership),
        })
    } catch (error) {
        return next(error)
    }
})

router.post('/switch', async (req, res, next) => {
    const auth = req.session?.tenantAuth
    const tenantId = req.body?.tenantId
    const membershipId = req.body?.membershipId
    if (!auth?.userId || typeof tenantId !== 'string' || typeof membershipId !== 'string') {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'Autenticação tenant necessária para trocar de organização.',
        })
    }

    try {
        const membership = await findActiveMembership(auth.userId, tenantId, membershipId)
        if (!membership) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'O vínculo com esta organização não está ativo.',
            })
        }

        await establishTenantSession(req, { userId: auth.userId }, membership)
        return res.json({
            sucesso: true,
            mensagem: 'Organização alterada.',
            tenant: {
                id: membership.tenantId,
                membershipId: membership.membershipId,
                name: membership.tenantName,
                role: membership.role,
            },
        })
    } catch (error) {
        return next(error)
    }
})

router.get('/session', async (req, res, next) => {
    const auth = req.session?.tenantAuth
    if (!auth?.userId || !auth?.tenantId || !auth?.membershipId) {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'Nenhuma sessão tenant ativa.',
        })
    }

    try {
        const membership = await findActiveMembership(
            auth.userId,
            auth.tenantId,
            auth.membershipId,
        )
        if (!membership) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'O vínculo com esta organização não está ativo.',
            })
        }

        return res.json({
            sucesso: true,
            tenant: {
                id: membership.tenantId,
                membershipId: membership.membershipId,
                name: membership.tenantName,
                role: membership.role,
            },
        })
    } catch (error) {
        return next(error)
    }
})

router.post('/logout', (req, res, next) => {
    if (!req.session) {
        return res.status(204).end()
    }

    req.session.destroy(error => {
        if (error) return next(error)
        res.clearCookie('connect.sid', { path: '/' })
        return res.status(204).end()
    })
})

export default router
