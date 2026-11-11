import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'

const personQuery = { select: jest.fn(), lean: jest.fn() }
const profileLookupQuery = { select: jest.fn(), lean: jest.fn() }
const profileListQuery = { select: jest.fn(), lean: jest.fn() }
const deleteProfileQuery = { select: jest.fn(), lean: jest.fn() }
const Person = {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
}
const BiometricProfile = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    deleteOne: jest.fn(),
}
const Attendance = { create: jest.fn() }
const obterContextoQr = jest.fn()
class TenantCheckinError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.statusCode = statusCode
    }
}

personQuery.select.mockReturnValue(personQuery)
personQuery.lean.mockResolvedValue(null)
profileLookupQuery.select.mockReturnValue(profileLookupQuery)
profileLookupQuery.lean.mockResolvedValue(null)
profileListQuery.select.mockReturnValue(profileListQuery)
profileListQuery.lean.mockResolvedValue([])
deleteProfileQuery.select.mockReturnValue(deleteProfileQuery)
deleteProfileQuery.lean.mockResolvedValue(null)
Person.findOneAndUpdate.mockReturnValue(personQuery)
Person.findOne.mockReturnValue(personQuery)
BiometricProfile.findOne.mockReturnValue(profileLookupQuery)
BiometricProfile.find.mockReturnValue(profileListQuery)
BiometricProfile.deleteOne.mockResolvedValue({ deletedCount: 1 })
Attendance.create.mockResolvedValue({})

jest.unstable_mockModule('../src/models/personModel.js', () => ({ default: Person }))
jest.unstable_mockModule('../src/models/biometricProfileModel.js', () => ({
    default: BiometricProfile,
}))
jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))
jest.unstable_mockModule('../src/services/tenantCheckinService.js', () => ({
    obterContextoQr,
    TenantCheckinError,
}))

const {
    cadastrarBiometriaAdminDoTenant,
    cadastrarBiometriaDoTenant,
    excluirBiometriaDoTenant,
    excluirBiometriaAdministrativaDoTenant,
    registrarCheckinFacialDoTenant,
    TenantBiometricError,
} = await import('../src/services/tenantBiometricService.js')

const token = 'A'.repeat(43)
const deleteToken = 'B'.repeat(43)
const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'
const personId = '65f1a0000000000000000003'
const profileId = '65f1a0000000000000000004'
const descriptor = Array(128).fill(0)

function setupContext(roomStatus = 'open') {
    obterContextoQr.mockResolvedValue({
        tenantId,
        room: { _id: roomId, name: 'Sala Azul', status: roomStatus },
    })
}

describe('serviço de biometria isolada por tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        personQuery.select.mockReturnValue(personQuery)
        personQuery.lean.mockResolvedValue({ _id: personId, name: 'Ana Silva', nameKey: 'ana silva', status: 'active' })
        profileLookupQuery.select.mockReturnValue(profileLookupQuery)
        profileLookupQuery.lean.mockResolvedValue(null)
        profileListQuery.select.mockReturnValue(profileListQuery)
        profileListQuery.lean.mockResolvedValue([])
        deleteProfileQuery.select.mockReturnValue(deleteProfileQuery)
        deleteProfileQuery.lean.mockResolvedValue(null)
        Person.findOneAndUpdate.mockReturnValue(personQuery)
        Person.findOne.mockReturnValue(personQuery)
        BiometricProfile.findOne.mockReturnValue(profileLookupQuery)
        BiometricProfile.find.mockReturnValue(profileListQuery)
        BiometricProfile.deleteOne.mockResolvedValue({ deletedCount: 1 })
        BiometricProfile.create.mockResolvedValue({ _id: profileId })
        Attendance.create.mockResolvedValue({})
        setupContext()
    })

    it('exige consentimento e valida descritor antes de persistir', async () => {
        await expect(cadastrarBiometriaDoTenant({
            token,
            name: 'Ana Silva',
            descriptor,
            consentimento: false,
        })).rejects.toMatchObject({ statusCode: 400 })
        await expect(cadastrarBiometriaDoTenant({
            token,
            name: 'Ana Silva',
            descriptor: [1, 2],
            consentimento: true,
        })).rejects.toBeInstanceOf(TenantBiometricError)
        expect(Person.findOneAndUpdate).not.toHaveBeenCalled()
        expect(BiometricProfile.create).not.toHaveBeenCalled()
    })

    it('cadastra biometria administrativa no tenant informado pelo middleware', async () => {
        BiometricProfile.create.mockResolvedValue({ _id: profileId })

        await expect(cadastrarBiometriaAdminDoTenant({
            tenantId,
            name: 'Ana Silva',
            descriptor,
            consentimento: true,
        })).resolves.toMatchObject({ profileId })

        expect(obterContextoQr).not.toHaveBeenCalled()
        expect(Person.findOneAndUpdate).toHaveBeenCalledWith(
            { tenantId, nameKey: 'ana silva' },
            {
                $setOnInsert: {
                    tenantId,
                    name: 'Ana Silva',
                    nameKey: 'ana silva',
                    status: 'active',
                },
            },
            { new: true, upsert: true, runValidators: true },
        )
    })

    it('exclui perfil administrativo somente dentro do tenant', async () => {
        await expect(excluirBiometriaAdministrativaDoTenant(tenantId, profileId))
            .resolves.toBe(true)
        expect(BiometricProfile.deleteOne).toHaveBeenCalledWith({
            _id: profileId,
            tenantId,
        })
    })

    it('cria pessoa e perfil no tenant do QR e devolve apenas credencial de exclusão', async () => {
        const result = await cadastrarBiometriaDoTenant({
            token,
            name: ' Ána Silva ',
            descriptor,
            consentimento: true,
        })

        expect(Person.findOneAndUpdate).toHaveBeenCalledWith(
            { tenantId, nameKey: 'ana silva' },
            {
                $setOnInsert: {
                    tenantId,
                    name: 'Ána Silva',
                    nameKey: 'ana silva',
                    status: 'active',
                },
            },
            { new: true, upsert: true, runValidators: true },
        )
        expect(BiometricProfile.create).toHaveBeenCalledWith(expect.objectContaining({
            tenantId,
            personId,
            descriptor,
            deleteTokenHash: expect.any(String),
            descriptorVersion: 'face-api.js-0.22.2',
            consent: expect.objectContaining({
                status: 'granted',
                policyVersion: '1',
                recordedAt: expect.any(Date),
            }),
        }))
        expect(result).toEqual({ profileId, deleteToken: expect.any(String) })
        expect(result).not.toHaveProperty('descriptor')
    })

    it('compara somente perfis consentidos do tenant e registra presença facial', async () => {
        profileListQuery.lean.mockResolvedValue([{
            _id: profileId,
            tenantId,
            personId,
            descriptor,
            consent: { status: 'granted' },
        }])
        personQuery.lean.mockResolvedValue({
            _id: personId,
            name: 'Ana Silva',
            nameKey: 'ana silva',
            status: 'active',
        })

        await expect(registrarCheckinFacialDoTenant({
            token,
            descriptor,
            consentimento: true,
            sourceIp: '127.0.0.1',
        })).resolves.toEqual({ sucesso: true })

        expect(BiometricProfile.find).toHaveBeenCalledWith({
            tenantId,
            'consent.status': 'granted',
        })
        expect(Person.findOne).toHaveBeenCalledWith({
            _id: personId,
            tenantId,
            status: 'active',
        })
        expect(Attendance.create).toHaveBeenCalledWith({
            tenantId,
            roomId,
            personId,
            personNameSnapshot: 'Ana Silva',
            personNameKey: 'ana silva',
            method: 'face',
            sourceIp: '127.0.0.1',
        })
    })

    it('não consulta perfis sem consentimento e rejeita tenant ou sala inativos', async () => {
        await expect(registrarCheckinFacialDoTenant({
            token,
            descriptor,
            consentimento: false,
        })).rejects.toMatchObject({ statusCode: 400 })
        expect(BiometricProfile.find).not.toHaveBeenCalled()

        setupContext('closed')
        await expect(registrarCheckinFacialDoTenant({
            token,
            descriptor,
            consentimento: true,
        })).rejects.toMatchObject({ statusCode: 403 })
        expect(BiometricProfile.find).not.toHaveBeenCalled()
    })

    it('não encontra perfil de outro tenant ou pessoa inativa', async () => {
        profileListQuery.lean.mockResolvedValue([])

        await expect(registrarCheckinFacialDoTenant({
            token,
            descriptor,
            consentimento: true,
        })).rejects.toMatchObject({ statusCode: 404 })
        expect(BiometricProfile.find).toHaveBeenCalledWith({
            tenantId,
            'consent.status': 'granted',
        })
        expect(Attendance.create).not.toHaveBeenCalled()
    })

    it('exclui perfil somente com hash de credencial correspondente e QR do mesmo tenant', async () => {
        BiometricProfile.findOne.mockReturnValue(deleteProfileQuery)
        deleteProfileQuery.lean.mockResolvedValue({
            _id: profileId,
            tenantId,
            deleteTokenHash: createHash('sha256').update(deleteToken).digest('hex'),
        })

        await expect(excluirBiometriaDoTenant({
            profileId,
            deleteToken,
        })).resolves.toEqual({ deleted: true })

        expect(BiometricProfile.findOne).toHaveBeenCalledWith({ _id: profileId })
        expect(BiometricProfile.deleteOne).toHaveBeenCalledWith({
            _id: profileId,
            deleteTokenHash: createHash('sha256').update(deleteToken).digest('hex'),
        })
    })

    it('não exclui perfil quando credencial não corresponde', async () => {
        BiometricProfile.findOne.mockReturnValue(deleteProfileQuery)
        deleteProfileQuery.lean.mockResolvedValue({
            _id: profileId,
            tenantId,
            deleteTokenHash: createHash('sha256').update(deleteToken).digest('hex'),
        })

        await expect(excluirBiometriaDoTenant({
            profileId,
            deleteToken: 'C'.repeat(43),
        })).rejects.toMatchObject({ statusCode: 403 })
        expect(BiometricProfile.deleteOne).not.toHaveBeenCalled()
    })
})
