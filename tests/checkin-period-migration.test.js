import { jest } from '@jest/globals'
import mongoose from 'mongoose'
import { migrateCheckinPeriods } from '../scripts/migrateCheckinPeriods.js'

function bancoMock() {
    const tenantId = new mongoose.Types.ObjectId()
    const legacy = { _id: new mongoose.Types.ObjectId(), tenantId }
    const modern = {
        _id: new mongoose.Types.ObjectId(), tenantId,
        currentPeriodId: new mongoose.Types.ObjectId(), legacyPeriod: false,
    }
    const attendance = { roomId: legacy._id, tenantId }
    let indexes = [
        { name: '_id_', key: { _id: 1 } },
        { name: 'antigo', key: { tenantId: 1, roomId: 1, personNameKey: 1 }, unique: true },
    ]
    const rooms = {
        find: jest.fn(filter => (async function* () {
            for (const room of [legacy, modern]) {
                if (filter.currentPeriodId === null && room.currentPeriodId == null) yield room
                if (filter.legacyPeriod === true && room.legacyPeriod) yield room
            }
        })()),
        updateOne: jest.fn(async (filter, update) => {
            if (String(filter._id) === String(legacy._id) && legacy.currentPeriodId == null) {
                Object.assign(legacy, update.$set)
            }
        }),
        countDocuments: jest.fn(async () => [legacy, modern]
            .filter(room => !(room.currentPeriodId instanceof mongoose.Types.ObjectId)).length),
    }
    const attendances = {
        aggregate: jest.fn(() => ({ toArray: async () => [] })),
        updateMany: jest.fn(async (filter, update) => {
            if (String(filter.roomId) === String(attendance.roomId) && !attendance.periodId) {
                Object.assign(attendance, update.$set)
            }
        }),
        countDocuments: jest.fn(async filter => {
            if (filter.roomId) {
                return attendance.periodId &&
                    String(attendance.periodId) !== String(filter.periodId.$ne) ? 1 : 0
            }
            return attendance.periodId instanceof mongoose.Types.ObjectId ? 0 : 1
        }),
        indexes: jest.fn(async () => indexes),
        createIndex: jest.fn(async (key, options) => {
            indexes.push({ key, ...options })
        }),
        dropIndex: jest.fn(async name => {
            indexes = indexes.filter(index => index.name !== name)
        }),
    }
    const periods = { findOne: jest.fn().mockResolvedValue(null) }
    const db = { collection: name => ({ rooms, attendances, checkinPeriods: periods })[name] }
    return { db, rooms, attendances, periods, legacy, modern, attendance }
}

test('migra dados antigos e aceita repetição sem alterar períodos existentes', async () => {
    const { db, legacy, modern, attendance, attendances } = bancoMock()
    const modernPeriod = modern.currentPeriodId
    await migrateCheckinPeriods(db)
    const legacyPeriod = legacy.currentPeriodId
    expect(legacy.legacyPeriod).toBe(true)
    expect(attendance.periodId).toEqual(legacyPeriod)
    expect(modern.currentPeriodId).toEqual(modernPeriod)
    expect(attendances.dropIndex).toHaveBeenCalledWith('antigo')

    await migrateCheckinPeriods(db)
    expect(legacy.currentPeriodId).toEqual(legacyPeriod)
    expect(attendance.periodId).toEqual(legacyPeriod)
    expect(modern.currentPeriodId).toEqual(modernPeriod)
    expect(attendances.createIndex).toHaveBeenCalledTimes(1)
    expect(attendances.dropIndex).toHaveBeenCalledTimes(1)
})

test('não altera dados quando há presença sem sala ou tenant correspondente', async () => {
    const { db, rooms, attendances } = bancoMock()
    attendances.aggregate.mockReturnValue({ toArray: async () => [{}] })
    await expect(migrateCheckinPeriods(db)).rejects.toThrow('tenant inconsistente')
    expect(rooms.updateOne).not.toHaveBeenCalled()
    expect(attendances.dropIndex).not.toHaveBeenCalled()
})

test('mantém o índice antigo quando não consegue criar o novo', async () => {
    const { db, attendances } = bancoMock()
    attendances.createIndex.mockRejectedValue(new Error('falha no índice'))
    await expect(migrateCheckinPeriods(db)).rejects.toThrow('falha no índice')
    expect(attendances.dropIndex).not.toHaveBeenCalled()
})

test('não substitui identificador ausente quando a sala já possui histórico', async () => {
    const { db, rooms, periods, attendances } = bancoMock()
    periods.findOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId() })
    await expect(migrateCheckinPeriods(db)).rejects.toThrow('já possui histórico')
    expect(rooms.updateOne).not.toHaveBeenCalled()
    expect(attendances.dropIndex).not.toHaveBeenCalled()
})
