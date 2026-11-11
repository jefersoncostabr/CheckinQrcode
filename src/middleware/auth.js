import { findActiveMembership } from '../services/tenantAuthService.js'

export const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

export const requireTenantAuth = (req, res, next) => {
    const auth = req.session?.tenantAuth
    if (auth?.userId && auth?.tenantId && auth?.membershipId && auth?.role) {
        return next()
    }
    return res.redirect('/login')
}

export async function establishTenantSession(req, identity, membership) {
    if (!req.session?.regenerate || !req.session?.save) {
        throw new Error('A sessão HTTP não está disponível.')
    }
    if (!identity?.userId || !membership?.tenantId || !membership?.membershipId) {
        throw new Error('Identidade ou vínculo do tenant inválido.')
    }

    const activeMembership = await findActiveMembership(
        identity.userId,
        membership.tenantId,
        membership.membershipId,
    )
    if (!activeMembership) {
        throw new Error('O vínculo com a organização não está ativo.')
    }

    return new Promise((resolve, reject) => {
        req.session.regenerate(error => {
            if (error) {
                reject(error)
                return
            }

            req.session.tenantAuth = {
                userId: activeMembership.userId,
                tenantId: activeMembership.tenantId,
                membershipId: activeMembership.membershipId,
                role: activeMembership.role,
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
