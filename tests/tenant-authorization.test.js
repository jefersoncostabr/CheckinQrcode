import { jest } from '@jest/globals'

const membershipQuery = {
    populate: jest.fn(),
    lean: jest.fn(),
}
const Membership = { findOne: jest.fn() }

membershipQuery.populate.mockReturnValue(membershipQuery)
membershipQuery.lean.mockResolvedValue(null)
Membership.findOne.mockReturnValue(membershipQuery)
jest.unstable_mockModule('../src/models/membershipModel.js', () => ({ default: Membership }))

const {
    TENANT_PERMISSIONS,
    TENANT_ROLE_PERMISSIONS,
    authorizeTenantPermission,
    loadActiveTenant,
    roleHasTenantPermission,
} = await import('../src/middleware/authorizeTenant.js')

function createResponse() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
    }
}

describe('autorização por papel e tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        membershipQuery.populate.mockReturnValue(membershipQuery)
        Membership.findOne.mockReturnValue(membershipQuery)
        membershipQuery.lean.mockResolvedValue(null)
    })

    it('define permissões explícitas por papel, mantendo owner como papel máximo', () => {
        expect(TENANT_ROLE_PERMISSIONS.owner).toEqual(TENANT_PERMISSIONS)
        expect(roleHasTenantPermission('admin', 'rooms:manage')).toBe(true)
        expect(roleHasTenantPermission('admin', 'tenant:manage')).toBe(false)
        expect(roleHasTenantPermission('operator', 'attendance:create')).toBe(true)
        expect(roleHasTenantPermission('operator', 'attendance:manage')).toBe(false)
        expect(roleHasTenantPermission('viewer', 'reports:read')).toBe(true)
        expect(roleHasTenantPermission('viewer', 'attendance:create')).toBe(false)
        expect(TENANT_ROLE_PERMISSIONS.user).toEqual(['attendance:create'])
        expect(roleHasTenantPermission('user', 'attendance:create')).toBe(true)
        expect(roleHasTenantPermission('user', 'rooms:read')).toBe(false)
        expect(roleHasTenantPermission('user', 'attendance:read')).toBe(false)
        expect(roleHasTenantPermission('unknown', 'rooms:read')).toBe(false)
    })

    it('rejeita permissões inválidas ao configurar o middleware', () => {
        expect(() => authorizeTenantPermission('admin:*'))
            .toThrow('Permissão de tenant desconhecida: admin:*')
    })

    it('rejeita requisições sem tenantAuth antes de consultar o banco', async () => {
        const middleware = authorizeTenantPermission('rooms:read')
        const response = createResponse()
        const next = jest.fn()

        await middleware({ session: {} }, response, next)

        expect(response.status).toHaveBeenCalledWith(401)
        expect(Membership.findOne).not.toHaveBeenCalled()
        expect(next).not.toHaveBeenCalled()
    })

    it('consulta membership ativo no banco e anexa somente o tenant autorizado', async () => {
        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-id',
            role: 'operator',
            tenantId: { _id: 'tenant-id', status: 'active' },
            userId: { _id: 'user-id', status: 'active' },
        })
        const middleware = authorizeTenantPermission('attendance:create')
        const request = {
            session: {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'membership-id',
                    role: 'owner',
                },
            },
        }
        const response = createResponse()
        const next = jest.fn()

        await middleware(request, response, next)

        expect(Membership.findOne).toHaveBeenCalledWith({
            _id: 'membership-id',
            userId: 'user-id',
            tenantId: 'tenant-id',
            status: 'active',
        })
        expect(membershipQuery.populate).toHaveBeenNthCalledWith(
            1,
            { path: 'tenantId', select: 'name status' },
        )
        expect(membershipQuery.populate).toHaveBeenNthCalledWith(
            2,
            { path: 'userId', select: 'name status' },
        )
        expect(request.tenant).toEqual({
            id: 'tenant-id',
            membershipId: 'membership-id',
            role: 'operator',
        })
        expect(next).toHaveBeenCalledTimes(1)
        expect(response.status).not.toHaveBeenCalled()
    })

    it('não confia no papel da sessão e bloqueia papel desatualizado ou associação inativa', async () => {
        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-id',
            role: 'viewer',
            tenantId: { _id: 'tenant-id', status: 'active' },
            userId: { _id: 'user-id', status: 'active' },
        })
        const middleware = authorizeTenantPermission('rooms:manage')
        const response = createResponse()
        const next = jest.fn()
        const request = {
            session: {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'membership-id',
                    role: 'owner',
                },
            },
        }

        await middleware(request, response, next)

        expect(response.status).toHaveBeenCalledWith(403)
        expect(next).not.toHaveBeenCalled()
        expect(request.tenant).toBeUndefined()
    })

    it('nega membership, usuário ou tenant desativado', async () => {
        const middleware = authorizeTenantPermission('reports:read')
        const response = createResponse()
        const next = jest.fn()
        const request = {
            session: {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'membership-id',
                },
            },
        }

        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-id',
            role: 'owner',
            tenantId: { _id: 'tenant-id', status: 'suspended' },
            userId: { _id: 'user-id', status: 'active' },
        })
        await middleware(request, response, next)
        expect(response.status).toHaveBeenCalledWith(403)
        expect(next).not.toHaveBeenCalled()

        jest.clearAllMocks()
        membershipQuery.populate.mockReturnValue(membershipQuery)
        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-id',
            role: 'owner',
            tenantId: { _id: 'tenant-id', status: 'active' },
            userId: { _id: 'user-id', status: 'disabled' },
        })
        Membership.findOne.mockReturnValue(membershipQuery)
        await middleware(request, response, next)
        expect(response.status).toHaveBeenCalledWith(403)
        expect(next).not.toHaveBeenCalled()
    })

    it('resolve o tenant ativo da sessão e ignora IDs enviados fora da sessão', async () => {
        membershipQuery.lean.mockResolvedValue({
            _id: 'membership-session',
            role: 'operator',
            tenantId: { _id: 'tenant-session', name: 'Sala A', status: 'active' },
            userId: { _id: 'user-session', status: 'active' },
        })
        const request = {
            session: {
                tenantAuth: {
                    userId: 'user-session',
                    tenantId: 'tenant-session',
                    membershipId: 'membership-session',
                },
            },
            query: { tenantId: 'tenant-attacker' },
            body: { tenantId: 'tenant-attacker' },
        }
        const response = createResponse()
        const next = jest.fn()

        await loadActiveTenant(request, response, next)

        expect(Membership.findOne).toHaveBeenCalledWith({
            userId: 'user-session',
            tenantId: 'tenant-session',
            status: 'active',
            _id: 'membership-session',
        })
        expect(request.tenant).toEqual({
            id: 'tenant-session',
            membershipId: 'membership-session',
            role: 'operator',
        })
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('retorna 401 para sessão sem seleção e 403 para membership revogado', async () => {
        const response = createResponse()
        const next = jest.fn()

        await loadActiveTenant({ session: {} }, response, next)
        expect(response.status).toHaveBeenCalledWith(401)
        expect(Membership.findOne).not.toHaveBeenCalled()

        membershipQuery.lean.mockResolvedValue(null)
        await loadActiveTenant({
            session: {
                tenantAuth: {
                    userId: 'user-id',
                    tenantId: 'tenant-id',
                    membershipId: 'revoked-membership',
                },
            },
        }, response, next)
        expect(response.status).toHaveBeenLastCalledWith(403)
        expect(next).not.toHaveBeenCalled()
    })
})
