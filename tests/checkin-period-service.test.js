import { jest } from '@jest/globals'
import mongoose from 'mongoose'

const session = {
    withTransaction: jest.fn(async callback => callback()),
    endSession: jest.fn(),
}
const roomQuery = { lean: jest.fn() }
const personQuery = { session: jest.fn().mockReturnThis(), lean: jest.fn() }
const userQuery = { session: jest.fn().mockReturnThis(), lean: jest.fn() }
const deletedQuery = { lean: jest.fn() }
const Room = { findOneAndUpdate: jest.fn(() => roomQuery) }
const Attendance = {
    create: jest.fn(),
    findOneAndDelete: jest.fn(() => deletedQuery),
    deleteMany: jest.fn(),
}
const CheckinPeriod = { findOneAndUpdate: jest.fn(), find: jest.fn() }
const Person = { findOne: jest.fn(() => personQuery) }
const User = { findOne: jest.fn(() => userQuery) }

jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))
jest.unstable_mockModule('../src/models/checkinPeriodModel.js', () => ({ default: CheckinPeriod }))
jest.unstable_mockModule('../src/models/personModel.js', () => ({ default: Person }))
jest.unstable_mockModule('../src/models/userModel.js', () => ({ default: User }))

const {
    inserirPresencaNoPeriodo,
    adicionarPresencaManualAoUltimoPeriodo,
    removerPresenca,
    limparPresencasDoPeriodo,
    listarPeriodosDoTenant,
} = await import('../src/services/checkinPeriodService.js')

const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'
const periodId = '65f1a0000000000000000003'
const attendanceId = '65f1a0000000000000000004'
const personId = '65f1a0000000000000000005'
const userId = '65f1a0000000000000000006'
const checkedInAt = new Date('2026-01-01T10:00:00Z')
const attendance = { personId, personNameSnapshot: 'Ana', personNameKey: 'ana', method: 'qr' }

beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session)
    session.withTransaction.mockImplementation(async callback => callback())
    roomQuery.lean.mockResolvedValue({ _id: roomId, currentPeriodId: periodId, status: 'open' })
    personQuery.lean.mockResolvedValue({ _id: personId, userId })
    userQuery.lean.mockResolvedValue({ _id: userId, tipo_cliente: 'cliente' })
    Attendance.create.mockResolvedValue([{ _id: attendanceId, ...attendance, createdAt: checkedInAt }])
    CheckinPeriod.findOneAndUpdate.mockResolvedValue({ _id: periodId })
    deletedQuery.lean.mockResolvedValue({ _id: attendanceId, periodId })
    CheckinPeriod.find = jest.fn(() => ({
        select: jest.fn(() => ({
            sort: jest.fn(() => ({
                lean: jest.fn().mockResolvedValue([]),
            })),
        })),
    }))
})

afterEach(() => jest.restoreAllMocks())

test('registra presença e retrato na transação já existente', async () => {
    await inserirPresencaNoPeriodo({ tenantId, roomId, attendance, personId, checkedInAt, session })

    expect(mongoose.startSession).not.toHaveBeenCalled()
    expect(Person.findOne).toHaveBeenCalledWith({ _id: personId, tenantId })
    expect(personQuery.session).toHaveBeenCalledWith(session)
    expect(userQuery.session).toHaveBeenCalledWith(session)
    expect(Attendance.create).toHaveBeenCalledWith(
        [expect.objectContaining({ tenantId, roomId, periodId })], { session },
    )
    expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: periodId, tenantId, roomId, status: 'open' },
        { $push: { participants: {
            attendanceId, personId, userId, name: 'Ana',
            tipo_cliente: 'cliente', checkedInAt,
        } } },
        { session, returnDocument: 'after', runValidators: true },
    )
})

test('registra presença legada sem criar histórico retroativo', async () => {
    roomQuery.lean.mockResolvedValue({ currentPeriodId: periodId, status: 'open', legacyPeriod: true })
    await inserirPresencaNoPeriodo({ tenantId, roomId, attendance, personId, checkedInAt })
    expect(Attendance.create).toHaveBeenCalledTimes(1)
    expect(CheckinPeriod.findOneAndUpdate).not.toHaveBeenCalled()
    expect(session.endSession).toHaveBeenCalled()
})

test('permite presença manual em sala fechada e impede check-in comum', async () => {
    roomQuery.lean.mockResolvedValue({ currentPeriodId: periodId, status: 'closed' })
    await expect(inserirPresencaNoPeriodo({ tenantId, roomId, attendance }))
        .rejects.toMatchObject({ statusCode: 403 })
    expect(Attendance.create).not.toHaveBeenCalled()

    const manual = { personNameSnapshot: 'Ana', personNameKey: 'ana', method: 'manual' }
    Attendance.create.mockResolvedValue([{ _id: attendanceId, ...manual, createdAt: checkedInAt }])
    await adicionarPresencaManualAoUltimoPeriodo({ tenantId, roomId, attendance: manual })
    expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'closed' }),
        { $push: { participants: expect.objectContaining({ personId: null, userId: null, tipo_cliente: null }) } },
        expect.anything(),
    )
})

test('rejeita período que mudou e propaga falha do histórico', async () => {
    await expect(inserirPresencaNoPeriodo({
        tenantId, roomId, attendance: { ...attendance, periodId: 'outro' }, personId,
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(Attendance.create).not.toHaveBeenCalled()

    CheckinPeriod.findOneAndUpdate.mockRejectedValue(new Error('falha no histórico'))
    await expect(inserirPresencaNoPeriodo({ tenantId, roomId, attendance, personId }))
        .rejects.toThrow('falha no histórico')
    expect(session.withTransaction).toHaveBeenCalled()
})

test('informa erro de tamanho do histórico sem confirmar a operação', async () => {
    CheckinPeriod.findOneAndUpdate.mockRejectedValue(
        Object.assign(new Error('document too large'), { code: 10334 }),
    )
    await expect(inserirPresencaNoPeriodo({ tenantId, roomId, attendance, personId }))
        .rejects.toMatchObject({ statusCode: 413 })
    expect(session.withTransaction).toHaveBeenCalled()
})

test('remove histórico somente para presença do período aberto atual', async () => {
    await removerPresenca({ tenantId, roomId, attendanceId })
    expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: periodId, tenantId, roomId, status: 'open' }),
        { $pull: { participants: { attendanceId } } },
        expect.anything(),
    )
    CheckinPeriod.findOneAndUpdate.mockClear()
    roomQuery.lean.mockResolvedValue({ currentPeriodId: periodId, status: 'closed' })
    await removerPresenca({ tenantId, roomId, attendanceId })
    expect(CheckinPeriod.findOneAndUpdate).not.toHaveBeenCalled()
})

test('limpa apenas presenças do período corrente', async () => {
    Attendance.deleteMany.mockResolvedValue({ deletedCount: 2 })
    await expect(limparPresencasDoPeriodo(tenantId, roomId)).resolves.toBe(2)
    expect(Attendance.deleteMany).toHaveBeenCalledWith({ tenantId, roomId, periodId }, { session })
    expect(CheckinPeriod.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: periodId, tenantId, roomId, status: 'open' }),
        { $set: { participants: [] } },
        expect.anything(),
    )
})

test('lista períodos de check-in do tenant sem retornar tenantId', async () => {
    const documentos = [
        {
            _id: periodId,
            roomId,
            roomName: 'Sala A',
            startedAt: new Date('2026-01-01T10:00:00Z'),
            endedAt: null,
            status: 'open',
            participants: [],
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
        },
    ]
    const resultadoEsperado = [{
        id: String(periodId),
        roomId,
        roomName: 'Sala A',
        startedAt: documentos[0].startedAt,
        endedAt: null,
        status: 'open',
        participants: [],
        createdAt: documentos[0].createdAt,
        updatedAt: documentos[0].updatedAt,
    }]
    CheckinPeriod.find.mockImplementation(() => ({
        select: () => ({
            sort: () => ({
                lean: () => Promise.resolve(documentos),
            }),
        }),
    }))

    const resultado = await listarPeriodosDoTenant(tenantId)

    expect(CheckinPeriod.find).toHaveBeenCalledWith({ tenantId })
    expect(resultado).toEqual(resultadoEsperado)
    expect(resultado[0]).not.toHaveProperty('tenantId')
})

test('lista períodos abertos e fechados', async () => {
    const documentos = [
        {
            _id: 'periodo-aberto',
            roomId,
            roomName: 'Sala A',
            startedAt: new Date('2026-01-01T10:00:00Z'),
            endedAt: null,
            status: 'open',
            participants: [],
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
            _id: 'periodo-fechado',
            roomId,
            roomName: 'Sala A',
            startedAt: new Date('2026-01-01T09:00:00Z'),
            endedAt: new Date('2026-01-01T10:00:00Z'),
            status: 'closed',
            participants: [],
            createdAt: new Date('2026-01-01T09:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
        },
    ]
    CheckinPeriod.find.mockImplementation(() => ({
        select: () => ({
            sort: () => ({
                lean: () => Promise.resolve(documentos),
            }),
        }),
    }))

    const resultado = await listarPeriodosDoTenant(tenantId)

    expect(resultado).toHaveLength(2)
    expect(resultado[0].status).toBe('open')
    expect(resultado[1].status).toBe('closed')
    expect(resultado[0].id).toBe('periodo-aberto')
    expect(resultado[1].id).toBe('periodo-fechado')
})
