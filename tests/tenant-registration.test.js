import { jest } from '@jest/globals'

const session = {
    withTransaction: jest.fn(async callback => callback()),
    endSession: jest.fn(),
}
const tenantModel = { create: jest.fn() }
const userModel = { create: jest.fn() }
const membershipModel = { create: jest.fn() }

jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
}))
jest.unstable_mockModule('../src/models/tenantModel.js', () => ({ default: tenantModel }))
jest.unstable_mockModule('../src/models/userModel.js', () => ({ default: userModel }))
jest.unstable_mockModule('../src/models/membershipModel.js', () => ({ default: membershipModel }))

const { default: bcrypt } = await import('bcrypt')
const { BCRYPT_COST, hashPassword, verifyPassword } = await import('../src/services/passwordService.js')
const {
    createTenantOwner,
    RegistrationConflictError,
    RegistrationValidationError,
} = await import('../src/services/tenantRegistrationService.js')

const validInput = {
    tenantName: 'Minha Organização',
    name: 'Pessoa Administradora',
    email: '  ADMIN@EXEMPLO.COM ',
    password: 'senha-segura-123',
}

describe('fundação de cadastro multi-tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        tenantModel.create.mockResolvedValue([{ _id: 'tenant-id' }])
        userModel.create.mockResolvedValue([{ _id: 'user-id' }])
        membershipModel.create.mockResolvedValue([{ _id: 'membership-id' }])
        session.withTransaction.mockImplementation(async callback => callback())
    })

    it('gera e verifica hash bcrypt com fator de custo 10', async () => {
        const passwordHash = await hashPassword(validInput.password)

        expect(passwordHash).not.toBe(validInput.password)
        expect(await bcrypt.getRounds(passwordHash)).toBe(BCRYPT_COST)
        await expect(verifyPassword(validInput.password, passwordHash)).resolves.toBe(true)
        await expect(verifyPassword('senha-incorreta', passwordHash)).resolves.toBe(false)
    })

    it('cria tenant, conta e vínculo owner dentro de uma transação', async () => {
        const result = await createTenantOwner(validInput)

        expect(result).toEqual({
            tenantId: 'tenant-id',
            userId: 'user-id',
            membershipId: 'membership-id',
        })
        expect(session.withTransaction).toHaveBeenCalledTimes(1)
        expect(tenantModel.create).toHaveBeenCalledWith(
            [expect.objectContaining({ name: 'Minha Organização', slug: expect.stringMatching(/^minha-organizacao-/) })],
            { session },
        )
        expect(userModel.create).toHaveBeenCalledWith(
            [expect.objectContaining({
                name: 'Pessoa Administradora',
                email: 'admin@exemplo.com',
                passwordHash: expect.any(String),
            })],
            { session },
        )
        expect(userModel.create.mock.calls[0][0][0]).not.toHaveProperty('password')
        expect(membershipModel.create).toHaveBeenCalledWith(
            [{
                tenantId: 'tenant-id',
                userId: 'user-id',
                role: 'owner',
                status: 'active',
            }],
            { session },
        )
        expect(session.endSession).toHaveBeenCalledTimes(1)
    })

    it('não aceita e-mail ou senha inválidos antes de iniciar uma transação', async () => {
        await expect(createTenantOwner({ ...validInput, email: 'invalido' }))
            .rejects.toBeInstanceOf(RegistrationValidationError)
        await expect(createTenantOwner({ ...validInput, password: 'curta' }))
            .rejects.toBeInstanceOf(RegistrationValidationError)
        expect(session.withTransaction).not.toHaveBeenCalled()
    })

    it('mapeia duplicidade de e-mail para conflito e encerra a sessão', async () => {
        const duplicateError = Object.assign(new Error('duplicate key'), {
            code: 11000,
            keyPattern: { email: 1 },
        })
        userModel.create.mockRejectedValue(duplicateError)

        await expect(createTenantOwner(validInput)).rejects.toBeInstanceOf(RegistrationConflictError)
        expect(session.endSession).toHaveBeenCalledTimes(1)
    })
})
