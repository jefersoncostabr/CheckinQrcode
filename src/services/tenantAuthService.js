import Membership from '../models/membershipModel.js'
import User from '../models/userModel.js'
import { verifyPassword } from './passwordService.js'

export async function findActiveMembership(userId, tenantId, membershipId) {
    if (
        typeof userId !== 'string' || !userId ||
        typeof tenantId !== 'string' || !tenantId
    ) {
        return null
    }

    const filter = { userId, tenantId, status: 'active' }
    if (membershipId != null) {
        if (typeof membershipId !== 'string' || !membershipId) return null
        filter._id = membershipId
    }

    const membership = await Membership.findOne(filter)
        .populate({ path: 'tenantId', select: 'name status' })
        .populate({ path: 'userId', select: 'name status' })
        .lean()

    if (
        !membership ||
        membership.tenantId?.status !== 'active' ||
        membership.userId?.status !== 'active'
    ) {
        return null
    }

    return {
        membershipId: String(membership._id),
        userId: String(membership.userId._id),
        tenantId: String(membership.tenantId._id),
        tenantName: membership.tenantId.name,
        role: membership.role,
    }
}

export async function authenticateTenantUser(emailInput, password) {
    if (typeof emailInput !== 'string' || typeof password !== 'string') return null

    const email = emailInput.trim().toLowerCase()
    if (!email || !password) return null

    const user = await User.findOne({ email }).select('+passwordHash').lean()
    if (!user || user.status !== 'active') return null

    const passwordMatches = await verifyPassword(password, user.passwordHash)
    if (!passwordMatches) return null

    const memberships = await Membership.find({
        userId: user._id,
        status: 'active',
    })
        .populate({ path: 'tenantId', select: 'name status' })
        .lean()

    const activeMemberships = memberships
        .filter(membership =>
            membership.status === 'active' &&
            membership.tenantId?.status === 'active',
        )
        .map(membership => ({
            membershipId: String(membership._id),
            tenantId: String(membership.tenantId._id),
            tenantName: membership.tenantId.name,
            role: membership.role,
        }))

    if (activeMemberships.length === 0) return null

    return {
        userId: String(user._id),
        name: user.name,
        memberships: activeMemberships,
    }
}
