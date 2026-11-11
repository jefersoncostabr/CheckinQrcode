import { findActiveMembership } from '../services/tenantAuthService.js'

export const TENANT_PERMISSIONS = Object.freeze([
    'tenant:manage',
    'members:manage',
    'rooms:read',
    'rooms:manage',
    'qrcodes:read',
    'qrcodes:manage',
    'attendance:create',
    'attendance:read',
    'attendance:manage',
    'reports:read',
    'biometrics:manage',
])

export const TENANT_ROLE_PERMISSIONS = Object.freeze({
    owner: Object.freeze([...TENANT_PERMISSIONS]),
    admin: Object.freeze([
        'rooms:read',
        'rooms:manage',
        'qrcodes:read',
        'qrcodes:manage',
        'attendance:create',
        'attendance:read',
        'attendance:manage',
        'reports:read',
        'biometrics:manage',
    ]),
    operator: Object.freeze([
        'rooms:read',
        'qrcodes:read',
        'attendance:create',
        'attendance:read',
    ]),
    viewer: Object.freeze([
        'rooms:read',
        'attendance:read',
        'reports:read',
    ]),
})

export function roleHasTenantPermission(role, permission) {
    return TENANT_ROLE_PERMISSIONS[role]?.includes(permission) === true
}

export async function loadActiveTenant(req, res, next) {
    const auth = req.session?.tenantAuth
    if (!auth?.userId || !auth?.tenantId || !auth?.membershipId) {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'Autenticação do tenant necessária.',
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

        req.tenant = {
            id: membership.tenantId,
            membershipId: membership.membershipId,
            role: membership.role,
        }
        return next()
    } catch (error) {
        return next(error)
    }
}

export function authorizeTenantPermission(permission) {
    if (!TENANT_PERMISSIONS.includes(permission)) {
        throw new TypeError(`Permissão de tenant desconhecida: ${permission}`)
    }

    return async function tenantPermissionMiddleware(req, res, next) {
        const auth = req.session?.tenantAuth
        if (!auth?.userId || !auth?.tenantId || !auth?.membershipId) {
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Autenticação do tenant necessária.',
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

            if (!roleHasTenantPermission(membership.role, permission)) {
                return res.status(403).json({
                    sucesso: false,
                    mensagem: 'Seu papel não permite esta operação.',
                })
            }

            req.tenant = {
                id: membership.tenantId,
                membershipId: membership.membershipId,
                role: membership.role,
            }
            return next()
        } catch (error) {
            return next(error)
        }
    }
}
