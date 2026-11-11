import { randomBytes } from 'crypto'
import mongoose from 'mongoose'
import Membership from '../models/membershipModel.js'
import Tenant from '../models/tenantModel.js'
import User from '../models/userModel.js'
import { hashPassword } from './passwordService.js'

export class RegistrationValidationError extends Error {
    constructor(message) {
        super(message)
        this.name = 'RegistrationValidationError'
        this.statusCode = 400
    }
}

export class RegistrationConflictError extends Error {
    constructor(message) {
        super(message)
        this.name = 'RegistrationConflictError'
        this.statusCode = 409
    }
}

function normalizeRequiredText(value, label, maxLength) {
    if (typeof value !== 'string') {
        throw new RegistrationValidationError(`${label} é obrigatório.`)
    }

    const normalized = value.trim()
    if (!normalized || normalized.length > maxLength) {
        throw new RegistrationValidationError(`${label} deve ter entre 1 e ${maxLength} caracteres.`)
    }
    return normalized
}

function createTenantSlug(name) {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'organizacao'

    return `${base}-${randomBytes(4).toString('hex')}`
}

function validateRegistration(input) {
    const tenantName = normalizeRequiredText(input?.tenantName, 'Nome da organização', 120)
    const name = normalizeRequiredText(input?.name, 'Nome', 120)
    const email = normalizeRequiredText(input?.email, 'E-mail', 254).toLowerCase()
    const password = input?.password

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new RegistrationValidationError('Informe um e-mail válido.')
    }
    if (typeof password !== 'string' || password.length < 8) {
        throw new RegistrationValidationError('A senha deve ter pelo menos 8 caracteres.')
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
        throw new RegistrationValidationError('A senha não pode exceder 72 bytes.')
    }

    return { tenantName, name, email, password }
}

export async function createTenantOwner(input) {
    const { tenantName, name, email, password } = validateRegistration(input)
    const passwordHash = await hashPassword(password)
    const session = await mongoose.startSession()
    let created

    try {
        await session.withTransaction(async () => {
            const [tenant] = await Tenant.create([{
                name: tenantName,
                slug: createTenantSlug(tenantName),
            }], { session })

            const [user] = await User.create([{
                name,
                email,
                passwordHash,
            }], { session })

            const [membership] = await Membership.create([{
                tenantId: tenant._id,
                userId: user._id,
                role: 'owner',
                status: 'active',
            }], { session })

            created = {
                tenantId: tenant._id,
                userId: user._id,
                membershipId: membership._id,
            }
        })
    } catch (error) {
        if (error?.code === 11000 &&
            (error.keyPattern?.email || error.keyValue?.email)) {
            throw new RegistrationConflictError('Já existe uma conta com este e-mail.')
        }
        throw error
    } finally {
        await session.endSession()
    }

    return created
}
