import { jest } from '@jest/globals'

const userQuery = {
    select: jest.fn(),
    lean: jest.fn(),
}
const membershipQuery = {
    populate: jest.fn(),
    lean: jest.fn(),
}
const User = { findOne: jest.fn() }
const Membership = { find: jest.fn(), findOne: jest.fn() }

userQuery.select.mockReturnValue(userQuery)
userQuery.lean.mockResolvedValue(null)
membershipQuery.populate.mockReturnValue(membershipQuery)
membershipQuery.lean.mockResolvedValue([])
User.findOne.mockReturnValue(userQuery)
Membership.find.mockReturnValue(membershipQuery)
Membership.findOne.mockReturnValue(membershipQuery)

jest.unstable_mockModule('../src/models/userModel.js', () => ({ default: User }))
jest.unstable_mockModule('../src/models/membershipModel.js', () => ({ default: Membership }))

const { authenticateTenantUser } = await import('../src/services/tenantAuthService.js')
const { establishTenantSession, requireTenantAuth } = await import('../src/middleware/auth.js')
const { hashPassword } = await import('../src/services/passwordService.js')

describe('autenticação de contas tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        userQuery.select.mockReturnValue(userQuery)
        membershipQuery.populate.mockReturnValue(membershipQuery)
        User.findOne.mockReturnValue(userQuery)
        Membership.find.mockReturnValue(membershipQuery)
        Membership.findOne.mockReturnValue(membershipQuery)
        userQuery.lean.mockResolvedValue(null)
        membershipQuery.lean.mockResolvedValue([])
    })

    it('valida senha e retorna somente memberships ativos com tenant ativo', async () => {
        const passwordHash = await hashPassword('senha-correta-123')
        userQuery.lean.mockResolvedValue({
            _id: 'user-id',
            name: 'Pessoa',
            email: 'pessoa@example.com',
            passwordHash,
            status: 'active',
        })
        membershipQuery.lean.mockResolvedValue([
            {
                _id: 'membership-active',
                status: 'active',
                role: 'owner',
                tenantId: { _id: 'tenant-active', name: 'Organização', status: 'active' },
            },
            {
                _id: 'membership-suspended-tenant',
                status: 'active',
                role: 'admin',
                tenantId: { _id: 'tenant-suspended', name: 'Suspensa', status: 'suspended' },
            },
        ])

        await expect(authenticateTenantUser(' PESSOA@EXAMPLE.COM ', 'senha-correta-123'))
            .resolves.toEqual({
                userId: 'user-id',
                name: 'Pessoa',
                memberships: [{
                    membershipId: 'membership-active',
                    tenantId: 'tenant-active',
                    tenantName: 'Organização',
                    role: 'owner',
                }],
            })
        expect(User.findOne).toHaveBeenCalledWith({ email: 'pessoa@example.com' })
        expect(userQuery.select).toHaveBeenCalledWith('+passwordHash')
        expect(Membership.find).toHaveBeenCalledWith({ userId: 'user-id', status: 'active' })
    })

    it('rejeita credenciais inválidas e contas sem membership válido', async () => {
        const passwordHash = await hashPassword('senha-correta-123')
        userQuery.lean.mockResolvedValue({
            _id: 'user-id',
            name: 'Pessoa',
            passwordHash,
            status: 'active',
        })
        await expect(authenticateTenantUser('pessoa@example.com', 'incorreta')).resolves.toBeNull()
        expect(Membership.find).not.toHaveBeenCalled()

        membershipQuery.lean.mockResolvedValue([{
            _id: 'membership-id',
            role: 'owner',
            tenantId: { _id: 'tenant-id', status: 'suspended' },
        }])
        await expect(authenticateTenantUser('pessoa@example.com', 'senha-correta-123')).resolves.toBeNull()
    })

    it('regenera a sessão e guarda somente identidade e membership ativo', async () => {
        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-id',
            role: 'owner',
            tenantId: { _id: 'tenant-id', name: 'Organização', status: 'active' },
            userId: { _id: 'user-id', status: 'active' },
        })
        const req = {
            session: {
                regenerate: callback => callback(null),
                save: callback => callback(null),
            },
        }
        await establishTenantSession(req, { userId: 'user-id' }, {
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'owner',
        })

        expect(req.session.tenantAuth).toEqual({
            userId: 'user-id',
            tenantId: 'tenant-id',
            membershipId: 'membership-id',
            role: 'owner',
        })
        expect(req.session.user).toBeUndefined()
        expect(Membership.findOne).toHaveBeenCalledWith({
            userId: 'user-id',
            tenantId: 'tenant-id',
            status: 'active',
            _id: 'membership-id',
        })
    })

    it('exige tenantAuth sem substituir a proteção legacy', () => {
        const next = jest.fn()
        const redirect = jest.fn()
        requireTenantAuth({ session: {} }, { redirect }, next)
        expect(redirect).toHaveBeenCalledWith('/login')
        expect(next).not.toHaveBeenCalled()

        requireTenantAuth({
            session: {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'membership-id',
                    role: 'owner',
                },
            },
        }, { redirect }, next)
        expect(next).toHaveBeenCalledTimes(1)
    })
})
