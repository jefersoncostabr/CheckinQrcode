import Attendance from '../src/models/attendanceModel.js'
import BiometricProfile from '../src/models/biometricProfileModel.js'
import Membership from '../src/models/membershipModel.js'
import Person from '../src/models/personModel.js'
import QrCode from '../src/models/qrCodeModel.js'
import Room from '../src/models/roomModel.js'
import Tenant from '../src/models/tenantModel.js'
import User from '../src/models/userModel.js'

describe('modelos da fundação multi-tenant', () => {
    it('mantém o e-mail único e não seleciona hash de senha por padrão', () => {
        expect(User.schema.path('email').options.unique).toBe(true)
        expect(User.schema.path('passwordHash').options.select).toBe(false)
    })

    it('define papéis no vínculo e impede memberships duplicados', () => {
        expect(Membership.schema.path('role').enumValues).toEqual([
            'owner',
            'admin',
            'operator',
            'viewer',
            'user',
        ])
        expect(Membership.schema.indexes()).toContainEqual([
            { tenantId: 1, userId: 1 },
            { unique: true },
        ])
    })

    it('mantém slug único e protege o descritor biométrico de consultas comuns', () => {
        expect(Tenant.schema.path('slug').options.unique).toBe(true)
        expect(BiometricProfile.schema.path('descriptor').options.select).toBe(false)
        expect(BiometricProfile.schema.path('deleteTokenHash').options.select).toBe(false)
        expect(BiometricProfile.schema.path('personId').options.required).toBe(true)
        expect(BiometricProfile.schema.path('descriptor').doValidateSync(Array(127).fill(0)))
            .toBeInstanceOf(Error)
        expect(BiometricProfile.schema.path('descriptor').doValidateSync(Array(128).fill(0)))
            .toBeUndefined()
        expect(BiometricProfile.schema.indexes()).toContainEqual([
            { tenantId: 1, personId: 1 },
            { unique: true },
        ])
    })

    it('declara índices compostos com tenant nas entidades operacionais', () => {
        expect(Person.schema.indexes()).toContainEqual([
            { tenantId: 1, email: 1 },
            expect.objectContaining({ unique: true }),
        ])
        expect(Person.schema.path('nameKey').options.required).toBe(true)
        expect(Person.schema.indexes()).toContainEqual([
            { tenantId: 1, nameKey: 1 },
            { unique: true },
        ])
        expect(Room.schema.indexes()).toContainEqual([
            { tenantId: 1, activeName: 1 },
            expect.objectContaining({
                unique: true,
                partialFilterExpression: { activeName: { $type: 'string' } },
            }),
        ])
        expect(QrCode.schema.path('tokenHash').options.select).toBe(false)
        expect(QrCode.schema.indexes()).toContainEqual([
            { tenantId: 1, roomId: 1 },
            {},
        ])
        expect(Attendance.schema.indexes()).toContainEqual([
            { tenantId: 1, roomId: 1, createdAt: -1 },
            {},
        ])
        expect(Attendance.schema.path('personNameKey').options.required).toBe(true)
        expect(Attendance.schema.indexes()).toContainEqual([
            { tenantId: 1, roomId: 1, personNameKey: 1 },
            { unique: true },
        ])
    })
})
