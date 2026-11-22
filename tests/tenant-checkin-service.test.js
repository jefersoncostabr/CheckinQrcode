import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'

function criarQueryMock() {
    const query = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn(),
    }
    return query
}

const qrQuery = criarQueryMock()
const tenantQuery = criarQueryMock()
const roomQuery = criarQueryMock()
const existsQuery = { session: jest.fn() }
const QrCode = { findOne: jest.fn().mockReturnValue(qrQuery) }
const Tenant = { findOne: jest.fn().mockReturnValue(tenantQuery) }
const Room = { findOne: jest.fn().mockReturnValue(roomQuery) }
const Attendance = {
    exists: jest.fn().mockReturnValue(existsQuery),
    create: jest.fn(),
}
const User = { create: jest.fn(), findOne: jest.fn() }
const Membership = { create: jest.fn(), findOne: jest.fn() }
const Person = { create: jest.fn(), findOne: jest.fn(), exists: jest.fn() }

const sessionMock = {
    withTransaction: jest.fn(async callback => callback()),
    endSession: jest.fn(),
}
const tentativas = { findOneAndUpdate: jest.fn(), updateOne: jest.fn() }
const mongooseMock = {
    startSession: jest.fn(async () => sessionMock),
    connection: { collection: jest.fn(() => tentativas) },
    Types: { ObjectId: () => 'mocked-object-id' },
    Schema: class {
        constructor(obj) {
            this.obj = obj
        }
        static Types = { ObjectId: () => 'mocked-object-id' }
    },
}

jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))
jest.unstable_mockModule('../src/models/tenantModel.js', () => ({ default: Tenant }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))
jest.unstable_mockModule('../src/models/userModel.js', () => ({ default: User }))
jest.unstable_mockModule('../src/models/membershipModel.js', () => ({ default: Membership }))
jest.unstable_mockModule('../src/models/personModel.js', () => ({ default: Person }))
jest.unstable_mockModule('mongoose', () => ({ default: mongooseMock }))
jest.unstable_mockModule('../src/services/passwordService.js', () => ({
    hashPassword: jest.fn(async p => `hash:${p}`),
    verifyPassword: jest.fn(async (p, h) => h === `hash:${p}`),
}))
jest.unstable_mockModule('../src/services/checkinPeriodService.js', () => ({
    inserirPresencaNoPeriodo: jest.fn(),
    obterPeriodoCorrente: jest.fn(),
    adicionarPresencaManualAoUltimoPeriodo: jest.fn(),
    removerPresencaDoPeriodoAberto: jest.fn(),
}))

const {
    obterContextoQr,
    resolverQrCodeDeCheckin,
    cadastrarContaEPrimeiroCheckin,
    autenticarParticipante,
    consultarSessaoParticipante,
    registrarCheckinAutenticado,
    TenantCheckinError,
} = await import('../src/services/tenantCheckinService.js')
const {
    inserirPresencaNoPeriodo,
    obterPeriodoCorrente,
} = await import('../src/services/checkinPeriodService.js')
const token = 'A'.repeat(43)
const tokenHash = createHash('sha256').update(token).digest('hex')
const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'
const userId = '65f1a0000000000000000003'
const personId = '65f1a0000000000000000004'

function setupActiveQr(roomStatus = 'open') {
    qrQuery.lean.mockResolvedValue({
        _id: '65f1a0000000000000000003',
        tenantId,
        roomId,
    })
    tenantQuery.lean.mockResolvedValue({ _id: tenantId })
    roomQuery.lean.mockResolvedValue({
        _id: roomId,
        tenantId,
        name: 'Sala Azul',
        status: roomStatus,
    })
}

function setupPersonAtiva() {
    const personQuery = criarQueryMock()
    personQuery.lean.mockResolvedValue({
        _id: personId,
        tenantId,
        userId,
        name: 'Ana Silva',
        nameKey: 'ana silva',
        status: 'active',
    })
    Person.findOne.mockReturnValue(personQuery)

    const userQuery = criarQueryMock()
    userQuery.lean.mockResolvedValue({
        _id: userId,
        name: 'Ana Silva',
        passwordHash: 'hash:senha1234',
        status: 'active',
    })
    User.findOne.mockReturnValue(userQuery)

    const membershipQuery = criarQueryMock()
    membershipQuery.lean.mockResolvedValue({
        _id: 'membership-id',
        userId,
        tenantId,
        status: 'active',
        role: 'user',
    })
    Membership.findOne.mockReturnValue(membershipQuery)
}

function setupPersonSemConta() {
    const personQuery = criarQueryMock()
    personQuery.lean.mockResolvedValue({
        _id: personId,
        tenantId,
        userId: null,
        name: 'Ana Silva',
        nameKey: 'ana silva',
        status: 'active',
    })
    Person.findOne.mockReturnValue(personQuery)
}

describe('serviço de check-in por QR tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        qrQuery.select.mockReturnValue(qrQuery)
        qrQuery.lean.mockResolvedValue(null)
        tenantQuery.select.mockReturnValue(tenantQuery)
        tenantQuery.lean.mockResolvedValue(null)
        roomQuery.select.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue(null)
        QrCode.findOne.mockReturnValue(qrQuery)
        Tenant.findOne.mockReturnValue(tenantQuery)
        Room.findOne.mockReturnValue(roomQuery)
        Attendance.create.mockResolvedValue({})
        existsQuery.session.mockResolvedValue(null)
        User.create.mockResolvedValue([{}])
        Membership.create.mockResolvedValue([{}])
        Person.create.mockResolvedValue([{}])
        Person.exists.mockResolvedValue(null)
        Person.findOne.mockReturnValue(criarQueryMock())
        User.findOne.mockReturnValue(criarQueryMock())
        Membership.findOne.mockReturnValue(criarQueryMock())
        mongooseMock.startSession.mockResolvedValue(sessionMock)
        sessionMock.withTransaction.mockImplementation(async callback => callback())
        tentativas.findOneAndUpdate.mockResolvedValue({ count: 1, expiresAt: new Date(Date.now() + 900000) })
        tentativas.updateOne.mockResolvedValue({ matchedCount: 1 })
        obterPeriodoCorrente.mockResolvedValue({
            _id: 'periodo-id',
            tenantId,
            roomId,
            status: 'open',
        })
        inserirPresencaNoPeriodo.mockResolvedValue(undefined)
    })

    it('resolve token em QR ativo e consulta tenant e sala pelo escopo do próprio QR', async () => {
        setupActiveQr()

        await expect(resolverQrCodeDeCheckin(token)).resolves.toEqual({
            sala: { id: roomId, nome: 'Sala Azul' },
            aberta: true,
        })
        expect(QrCode.findOne).toHaveBeenCalledWith({ tokenHash, status: 'active' })
        expect(Tenant.findOne).toHaveBeenCalledWith({ _id: tenantId, status: 'active' })
        expect(Room.findOne).toHaveBeenCalledWith({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        })
    })

    it('não resolve QR inexistente, sem sala ou associado a tenant inativo', async () => {
        await expect(resolverQrCodeDeCheckin(token)).resolves.toBeNull()

        qrQuery.lean.mockResolvedValue({ tenantId, roomId })
        tenantQuery.lean.mockResolvedValue(null)
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        await expect(resolverQrCodeDeCheckin(token)).resolves.toBeNull()
    })

    it('valida token e nome, impede nomes duplicados e rejeita sala fechada', async () => {
        await expect(cadastrarContaEPrimeiroCheckin({ token, nome: '   ', senha: 'senha1234' }))
            .rejects.toMatchObject({ statusCode: 400 })
        await expect(cadastrarContaEPrimeiroCheckin({ token, nome: 'Ana Silva', senha: 'curta' }))
            .rejects.toMatchObject({ statusCode: 400 })

        setupActiveQr()
        Person.exists.mockResolvedValue({ _id: 'pessoa-id' })
        await expect(cadastrarContaEPrimeiroCheckin({ token, nome: 'Ana Silva', senha: 'senha1234' }))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(User.create).not.toHaveBeenCalled()

        setupActiveQr('closed')
        Person.exists.mockResolvedValue(null)
        await expect(cadastrarContaEPrimeiroCheckin({ token, nome: 'Ana Silva', senha: 'senha1234' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('cria conta, membership, person e attendance em transação sem email', async () => {
        setupActiveQr()
        Person.exists.mockResolvedValue(null)
        User.create.mockResolvedValue([{ _id: userId }])
        Membership.create.mockResolvedValue([{ _id: 'membership-id' }])
        Person.create.mockResolvedValue([{ _id: personId }])
        Attendance.create.mockResolvedValue([{}])

        const result = await cadastrarContaEPrimeiroCheckin({
            token,
            nome: '  Ána   Silva  ',
            senha: 'senha1234',
            sourceIp: '127.0.0.1',
            tipo_cliente: 'equipe',
        })

        expect(result.sala).toEqual({ id: roomId, nome: 'Sala Azul' })
        expect(result.pessoa.nome).toBe('Ána   Silva')
        expect(result.pessoa.tenantId).toBe(tenantId)
        expect(User.create).toHaveBeenCalledWith(
            [expect.objectContaining({
                name: 'Ána   Silva',
                passwordHash: 'hash:senha1234',
                status: 'active',
                tipo_cliente: 'cliente',
            })],
            { session: expect.anything() },
        )
        expect(User.create.mock.calls[0][0][0]).not.toHaveProperty('email')
        expect(Membership.create).toHaveBeenCalledWith(
            [expect.objectContaining({
                tenantId,
                userId: expect.anything(),
                role: 'user',
                status: 'active',
            })],
            { session: expect.anything() },
        )
        expect(Person.create).toHaveBeenCalledWith(
            [expect.objectContaining({
                tenantId,
                userId: expect.anything(),
                name: 'Ána   Silva',
                nameKey: 'ana silva',
                status: 'active',
            })],
            { session: expect.anything() },
        )
        expect(inserirPresencaNoPeriodo).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId,
                roomId,
                personId: expect.anything(),
                userId: expect.anything(),
                session: sessionMock,
            }),
        )
    })

    it('autentica participante com nome e senha corretos', async () => {
        setupActiveQr()
        setupPersonAtiva()

        const result = await autenticarParticipante({
            token,
            nome: 'Ana Silva',
            senha: 'senha1234',
            sourceIp: '127.0.0.1',
        })

        expect(result.nome).toBe('Ana Silva')
        expect(result.userId).toBe(userId)
        expect(result.personId).toBe(personId)
        expect(result.tenantId).toBe(tenantId)
        expect(tentativas.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ _id: expect.any(String) }),
            expect.any(Array),
            { upsert: true, returnDocument: 'after' },
        )
        expect(tentativas.updateOne).toHaveBeenCalledWith(
            expect.objectContaining({ _id: expect.any(String), expiresAt: expect.any(Date) }),
            { $inc: { count: -1 } },
        )
    })

    it('rejeita senha incorreta e aplica bloqueio de tentativas', async () => {
        setupActiveQr()
        setupPersonAtiva()

        let count = 0
        tentativas.findOneAndUpdate.mockImplementation(async () => ({
            count: ++count,
            expiresAt: new Date(Date.now() + 900000),
        }))
        for (let i = 0; i < 5; i++) {
            await expect(autenticarParticipante({
                token, nome: 'Ana Silva', senha: 'senha-errada', sourceIp: '127.0.0.1',
            })).rejects.toMatchObject({ statusCode: 401 })
        }

        await expect(autenticarParticipante({
            token, nome: 'Ana Silva', senha: 'senha-errada', sourceIp: '127.0.0.1',
        })).rejects.toMatchObject({ statusCode: 429 })
    })

    it('rejeita nome inexistente com mensagem genérica', async () => {
        setupActiveQr()
        const pessoaQuery = criarQueryMock()
        pessoaQuery.lean.mockResolvedValue(null)
        Person.findOne.mockReturnValue(pessoaQuery)

        await expect(autenticarParticipante({
            token, nome: 'Ninguem', senha: 'qualquer', sourceIp: '127.0.0.2',
        })).rejects.toMatchObject({ statusCode: 401 })
    })

    it('rejeita pessoa sem conta vinculada', async () => {
        setupActiveQr()
        setupPersonSemConta()

        await expect(autenticarParticipante({
            token, nome: 'Ana Silva', senha: 'senha1234', sourceIp: '127.0.0.2',
        })).rejects.toMatchObject({ statusCode: 401 })
    })

    it('registra presença autenticada vinculada à pessoa da sessão', async () => {
        setupActiveQr()
        setupPersonAtiva()
        Attendance.exists.mockResolvedValue(null)

        await expect(registrarCheckinAutenticado({
            token,
            userId,
            personId,
            tenantId,
            membershipId: 'membership-id',
            sourceIp: '127.0.0.1',
        })).resolves.toEqual({ sala: { id: roomId, nome: 'Sala Azul' } })

        expect(inserirPresencaNoPeriodo).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId,
                roomId,
                personId,
                userId,
            }),
        )
        expect(Membership.findOne).toHaveBeenCalledWith({
            _id: 'membership-id', tenantId, userId, status: 'active',
        })
        expect(Person.findOne).toHaveBeenCalledWith({
            _id: personId, tenantId, userId, status: 'active',
        })
    })

    it('impede presença duplicada na mesma sala para a mesma pessoa', async () => {
        setupActiveQr()
        setupPersonAtiva()
        Attendance.exists.mockResolvedValue({ _id: 'attendance-id' })

        await expect(registrarCheckinAutenticado({
            token, userId, personId, tenantId, membershipId: 'membership-id', sourceIp: '127.0.0.1',
        })).rejects.toMatchObject({ statusCode: 409 })
        expect(Attendance.create).not.toHaveBeenCalled()
    })

    it('rejeita sessão de outro tenant antes de registrar presença', async () => {
        setupActiveQr()

        await expect(registrarCheckinAutenticado({
            token, userId, personId, tenantId: 'outro-tenant', membershipId: 'membership-id',
        })).rejects.toMatchObject({ statusCode: 403 })
        expect(Attendance.create).not.toHaveBeenCalled()
    })

    it('rejeita vínculo desativado antes de registrar presença', async () => {
        setupActiveQr()
        setupPersonAtiva()
        Membership.findOne.mockReturnValue(criarQueryMock())

        await expect(registrarCheckinAutenticado({
            token, userId, personId, tenantId, membershipId: 'membership-id',
        })).rejects.toMatchObject({ statusCode: 403 })
        expect(Attendance.create).not.toHaveBeenCalled()
    })

    it('rejeita participante removido ou papel sem permissão', async () => {
        setupActiveQr()
        setupPersonAtiva()
        Person.findOne.mockReturnValue(criarQueryMock())
        await expect(registrarCheckinAutenticado({
            token, userId, personId, tenantId, membershipId: 'membership-id',
        })).rejects.toMatchObject({ statusCode: 403 })

        setupPersonAtiva()
        const membershipQuery = criarQueryMock()
        membershipQuery.lean.mockResolvedValue({ role: 'viewer' })
        Membership.findOne.mockReturnValue(membershipQuery)
        await expect(registrarCheckinAutenticado({
            token, userId, personId, tenantId, membershipId: 'membership-id',
        })).rejects.toMatchObject({ statusCode: 403 })
        expect(Attendance.create).not.toHaveBeenCalled()
    })
})
