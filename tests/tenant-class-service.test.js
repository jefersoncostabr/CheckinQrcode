import { jest } from '@jest/globals'
import mongoose from 'mongoose'
import { createHash } from 'node:crypto'

const query = value => ({
    session() { return this },
    lean: jest.fn().mockResolvedValue(value),
})
const Class = { create: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn() }
const Room = { findOne: jest.fn(), findOneAndUpdate: jest.fn() }
const CheckinPeriod = { create: jest.fn(), find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn() }
const ClassStartQr = { findOne: jest.fn(), findOneAndUpdate: jest.fn(), deleteMany: jest.fn(), create: jest.fn() }
const token = 'A'.repeat(43)
const tokenHash = createHash('sha256').update(token).digest('hex')
const session = { withTransaction: jest.fn(callback => callback()), endSession: jest.fn() }

const User = { findById: jest.fn() }

jest.unstable_mockModule('../src/models/classModel.js', () => ({ default: Class }))
jest.unstable_mockModule('../src/models/userModel.js', () => ({ default: User }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/checkinPeriodModel.js', () => ({ default: CheckinPeriod }))
jest.unstable_mockModule('../src/models/classStartQrModel.js', () => ({
    default: ClassStartQr,
    gerarTokenClassStart: () => ({ token, tokenHash }),
}))
jest.spyOn(mongoose, 'startSession').mockResolvedValue(session)

const {
    cadastrarAulaDoTenant,
    consumirQrStartClassDoTenant,
    iniciarAulaDoTenant,
    encerrarAulaDoTenant,
} =
    await import('../src/services/tenantClassService.js')

const tenantId = '65f1a0000000000000000001'
const classId = '65f1a0000000000000000002'
const roomId = '65f1a0000000000000000003'
const periodoId = '65f1a0000000000000000004'
const aula = { _id: classId, name: 'Aula' }
const sala = { _id: roomId, name: 'Sala', status: 'closed', periodRevision: 2 }

beforeEach(() => {
    jest.clearAllMocks()
    Class.findOne.mockReturnValue(query(aula))
    Class.create.mockResolvedValue({
        _id: classId, name: 'Aula', startTime: '09:00', endTime: '10:00',
    })
    User.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: classId, name: 'Professor Teste', status: 'active' }),
    })
    Room.findOne.mockReturnValue(query(sala))
    Room.findOneAndUpdate.mockReturnValue(query({ ...sala, status: 'open' }))
    CheckinPeriod.create.mockResolvedValue([{ _id: periodoId }])
    CheckinPeriod.find.mockReturnValue(query([{
        _id: periodoId, tenantId, roomId, classId, status: 'open',
    }]))
    CheckinPeriod.findOne.mockReturnValue(query(null))
    ClassStartQr.findOne.mockReturnValue(query({
        _id: 'qr-id', classId, roomId, periodRevision: 2,
        expiresAt: new Date(Date.now() + 60000),
    }))
    ClassStartQr.findOneAndUpdate.mockResolvedValue({})
    ClassStartQr.deleteMany.mockResolvedValue({})
})

test('cadastra aula com horários sem exigir sala', async () => {
    const result = await cadastrarAulaDoTenant(
        tenantId,
        classId,
        { name: 'Aula', startTime: '09:00', endTime: '10:00' },
    )
    expect(result).toMatchObject({
        name: 'Aula',
        startTime: '09:00',
        endTime: '10:00',
        roomId: null,
        professorId: classId,
        professorNome: 'Professor Teste',
    })
    expect(Class.create).toHaveBeenCalledWith({
        tenantId,
        name: 'Aula',
        startTime: '09:00',
        endTime: '10:00',
        createdBy: classId,
    })
    expect(User.findById).toHaveBeenCalledWith(classId)
    await expect(cadastrarAulaDoTenant(tenantId, classId, {
        name: 'Aula', startTime: '10:00', endTime: '10:00',
    })).rejects.toMatchObject({ statusCode: 400 })
})

test('consome o QR e abre a sala usando a mesma transação', async () => {
    const result = await consumirQrStartClassDoTenant(tenantId, token)
    expect(result).toMatchObject({ sala: { status: 'open' }, periodoId })
    expect(ClassStartQr.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'qr-id', tenantId }, expect.any(Object), { session },
    )
    expect(ClassStartQr.deleteMany).toHaveBeenCalledWith({ tenantId, classId }, { session })
    expect(Room.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: roomId, tenantId, status: 'closed', periodRevision: 2 },
        expect.any(Object), expect.objectContaining({ session }),
    )
})

test('rejeita QR vencido e revisão alterada sem abrir a sala', async () => {
    ClassStartQr.findOne.mockReturnValueOnce(query({
        classId, roomId, periodRevision: 2, expiresAt: new Date(Date.now() - 1),
    }))
    await expect(consumirQrStartClassDoTenant(tenantId, token)).rejects.toMatchObject({ statusCode: 403 })
    ClassStartQr.findOne.mockReturnValueOnce(query({
        classId, roomId, periodRevision: 1, expiresAt: new Date(Date.now() + 60000),
    }))
    await expect(consumirQrStartClassDoTenant(tenantId, token)).rejects.toMatchObject({ statusCode: 409 })
    expect(CheckinPeriod.create).not.toHaveBeenCalled()
})

test('rejeita QR inexistente ou de outro tenant sem criar período', async () => {
    ClassStartQr.findOne.mockReturnValueOnce(query(null))
    await expect(consumirQrStartClassDoTenant(tenantId, token)).rejects.toMatchObject({ statusCode: 403 })
    expect(ClassStartQr.findOne).toHaveBeenCalledWith({ tenantId, tokenHash, consumedAt: null })
    expect(CheckinPeriod.create).not.toHaveBeenCalled()
})

test('início manual retorna sala aberta e invalida QRs na transação', async () => {
    const result = await iniciarAulaDoTenant(tenantId, classId, roomId)
    expect(result.sala.status).toBe('open')
    expect(ClassStartQr.deleteMany).toHaveBeenCalledWith({ tenantId, classId }, { session })
})

test('encerramento retorna sala fechada', async () => {
    Room.findOne.mockReturnValue(query({ ...sala, status: 'open', currentPeriodId: periodoId }))
    Room.findOneAndUpdate.mockReturnValue(query({ ...sala, status: 'closed' }))
    CheckinPeriod.findOne.mockReturnValue(query({ _id: periodoId }))
    CheckinPeriod.findOneAndUpdate.mockResolvedValue({ _id: periodoId })
    const result = await encerrarAulaDoTenant(tenantId, classId)
    expect(result.sala.status).toBe('closed')
    expect(ClassStartQr.deleteMany).toHaveBeenCalledWith({ tenantId, classId }, { session })
})
