import mongoose from 'mongoose'
import { jest } from '@jest/globals'

const listQuery = {
    select: jest.fn(),
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
}
const roomListQuery = { select: jest.fn(), sort: jest.fn(), lean: jest.fn() }
const roomQuery = { select: jest.fn(), lean: jest.fn() }
const deleteQuery = { lean: jest.fn() }
const findOneQuery = { lean: jest.fn() }
const Attendance = {
    countDocuments: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    find: jest.fn(),
    aggregate: jest.fn(),
    findOneAndDelete: jest.fn(),
    findOne: jest.fn(),
}
const Room = {
    exists: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
}
const Class = {
    find: jest.fn(),
}
const CheckinPeriod = {
    find: jest.fn(),
}

const inserirPresencaNoPeriodo = jest.fn()
const adicionarPresencaManualAoUltimoPeriodo = jest.fn()
const removerPresencaDoPeriodoAberto = jest.fn()
const removerPresenca = jest.fn()
const limparPresencasDoPeriodo = jest.fn()
const obterPeriodoCorrente = jest.fn()

for (const method of ['select', 'sort', 'skip', 'limit']) {
    listQuery[method].mockReturnValue(listQuery)
}
listQuery.lean.mockResolvedValue([])
roomListQuery.select.mockReturnValue(roomListQuery)
roomListQuery.sort.mockReturnValue(roomListQuery)
roomListQuery.lean.mockResolvedValue([])
roomQuery.select.mockReturnValue(roomQuery)
roomQuery.lean.mockResolvedValue(null)
deleteQuery.lean.mockResolvedValue(null)
findOneQuery.lean.mockResolvedValue(null)
Attendance.find.mockReturnValue(listQuery)
Attendance.findOne.mockReturnValue(findOneQuery)
Attendance.findOneAndDelete.mockReturnValue(deleteQuery)
Room.find.mockReturnValue(roomListQuery)
Room.findOne.mockReturnValue(roomQuery)

const periodoMockQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn(),
}
const classMockQuery = {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn(),
}
classMockQuery.select.mockReturnValue(classMockQuery)
classMockQuery.populate.mockReturnValue(classMockQuery)

jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/models/classModel.js', () => ({ default: Class }))
jest.unstable_mockModule('../src/models/checkinPeriodModel.js', () => ({ default: CheckinPeriod }))
jest.unstable_mockModule('../src/services/checkinPeriodService.js', () => ({
    inserirPresencaNoPeriodo,
    adicionarPresencaManualAoUltimoPeriodo,
    removerPresencaDoPeriodoAberto,
    removerPresenca,
    limparPresencasDoPeriodo,
    obterPeriodoCorrente,
}))

const sessionMock = {
    withTransaction: jest.fn(async callback => callback()),
    endSession: jest.fn(),
}
const {
    excluirPresencaDoTenant,
    criarPresencaManualDoTenant,
    gerarRelatorioDePresencasDoTenant,
    limparPresencasDaSalaDoTenant,
    listarPresencasDoTenant,
    obterResumoDoTenant,
    removerUltimaPresencaDoTenant,
    TenantAttendanceError,
} = await import('../src/services/tenantAttendanceService.js')

const tenantId = '65f1a0000000000000000001'
const roomId = '65f1a0000000000000000002'
const attendanceId = '65f1a0000000000000000003'
const periodoId = '65f1a0000000000000000004'
const classId = '65f1a0000000000000000005'
const professorId = '65f1a0000000000000000006'

describe('serviço de presenças e relatórios tenant-scoped', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        for (const method of ['select', 'sort', 'skip', 'limit']) {
            listQuery[method].mockReturnValue(listQuery)
        }
        listQuery.lean.mockResolvedValue([])
        roomListQuery.select.mockReturnValue(roomListQuery)
        roomListQuery.sort.mockReturnValue(roomListQuery)
        roomListQuery.lean.mockResolvedValue([])
        roomQuery.select.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue(null)
        deleteQuery.lean.mockResolvedValue(null)
        findOneQuery.lean.mockResolvedValue(null)
        Attendance.find.mockReturnValue(listQuery)
        Attendance.findOne.mockReturnValue(findOneQuery)
        Attendance.findOneAndDelete.mockReturnValue(deleteQuery)
        Room.find.mockReturnValue(roomListQuery)
        Room.findOne.mockReturnValue(roomQuery)
        CheckinPeriod.find.mockReturnValue(periodoMockQuery)
        periodoMockQuery.select.mockReturnValue(periodoMockQuery)
        periodoMockQuery.lean.mockResolvedValue([])
        Class.find.mockReturnValue(classMockQuery)
        classMockQuery.select.mockReturnValue(classMockQuery)
        classMockQuery.populate.mockReturnValue(classMockQuery)
        classMockQuery.lean.mockResolvedValue([])
        obterPeriodoCorrente.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })
    })

    it('lista presenças limitadas ao tenant e pagina sem expor IP', async () => {
        Attendance.countDocuments.mockResolvedValue(1)
        listQuery.lean.mockResolvedValue([{
            _id: attendanceId,
            tenantId: 'other-tenant',
            roomId,
            personNameSnapshot: 'Ana Silva',
            method: 'qr',
            sourceIp: 'secret-ip',
            createdAt: new Date('2026-01-01T10:00:00Z'),
        }])
        roomListQuery.lean.mockResolvedValue([{ _id: roomId, name: 'Sala Azul' }])

        const result = await listarPresencasDoTenant(tenantId, { page: '2' })

        expect(Attendance.countDocuments).toHaveBeenCalledWith({ tenantId })
        expect(Attendance.find).toHaveBeenCalledWith({ tenantId })
        expect(listQuery.skip).toHaveBeenCalledWith(100)
        expect(result).toEqual({
            presencas: [{
                id: attendanceId,
                roomId,
                roomName: 'Sala Azul',
                nome: 'Ana Silva',
                metodo: 'qr',
                criadaEm: new Date('2026-01-01T10:00:00Z'),
            }],
            paginacao: { pagina: 2, porPagina: 100, total: 1, totalPaginas: 1 },
        })
        expect(JSON.stringify(result)).not.toContain('secret-ip')
    })

    it('valida a sala filtrada dentro do tenant e rejeita página inválida', async () => {
        Room.exists.mockResolvedValue(null)
        await expect(listarPresencasDoTenant(tenantId, { roomId }))
            .rejects.toMatchObject({ statusCode: 404 })
        expect(Attendance.find).not.toHaveBeenCalled()

        await expect(listarPresencasDoTenant(tenantId, { page: '0' }))
            .rejects.toBeInstanceOf(TenantAttendanceError)
    })

    it('monta o resumo com salas e presenças somente do tenant', async () => {
        roomListQuery.lean.mockResolvedValue([{
            _id: roomId,
            name: 'Sala Azul',
            status: 'open',
            currentPeriodId: periodoId,
        }])
        Attendance.aggregate.mockResolvedValue([
            { _id: periodoId, quantidade: 3 },
        ])
        CheckinPeriod.find.mockReturnValue(periodoMockQuery)
        periodoMockQuery.select.mockReturnValue(periodoMockQuery)
        periodoMockQuery.lean.mockResolvedValue([{
            _id: periodoId,
            classId,
        }])
        Class.find.mockReturnValue(classMockQuery)
        classMockQuery.select.mockReturnValue(classMockQuery)
        classMockQuery.populate.mockReturnValue(classMockQuery)
        classMockQuery.lean.mockResolvedValue([{
            _id: classId,
            name: 'Matemática',
            createdBy: { _id: professorId, name: 'Professor Teste', status: 'active' },
        }])

        await expect(obterResumoDoTenant(tenantId)).resolves.toEqual({
            salas: [{
                id: roomId,
                nome: 'Sala Azul',
                status: 'open',
                aberta: true,
                quantidade: 3,
                aulaId: classId,
                aulaNome: 'Matemática',
                professorId: professorId,
                professorNome: 'Professor Teste',
            }],
            total: 3,
        })
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            status: { $ne: 'archived' },
        })
        expect(Attendance.aggregate).toHaveBeenCalledWith([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    periodId: { $in: [periodoId] },
                },
            },
            { $group: { _id: '$periodId', quantidade: { $sum: 1 } } },
        ])
    })

    it('registra presença manual dentro da sala e tenant informados', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open', legacyPeriod: false })
        obterPeriodoCorrente.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })

        await expect(criarPresencaManualDoTenant(tenantId, {
            roomId,
            name: 'Ana Silva',
            sourceIp: '127.0.0.1',
        })).resolves.toEqual({ sucesso: true, sala: 'Sala Azul' })

        expect(Room.findOne).toHaveBeenCalledWith({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        })
        expect(adicionarPresencaManualAoUltimoPeriodo).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId,
                roomId: roomId,
                personId: null,
            }),
        )
    })

    it('remove a última presença do período aberto atualizando o histórico', async () => {
        removerPresenca.mockResolvedValue({ _id: attendanceId })
        Room.findOne.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue({
            _id: roomId,
            status: 'open',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        })
        obterPeriodoCorrente.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })
        Attendance.findOne.mockReturnValue(findOneQuery)
        findOneQuery.lean.mockResolvedValue({
            _id: attendanceId,
            roomId,
            periodId: periodoId,
        })

        await removerUltimaPresencaDoTenant(tenantId, roomId)

        expect(removerPresenca).toHaveBeenCalledWith({
            tenantId,
            roomId,
            somenteAtual: true,
            ultima: true,
        })
    })

    it('remove última presença de período fechado sem tocar o histórico', async () => {
        removerPresenca.mockResolvedValue({ _id: attendanceId })
        Room.findOne.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue({
            _id: roomId,
            status: 'closed',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        })
        obterPeriodoCorrente.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'closed',
        })
        Attendance.findOne.mockReturnValue(findOneQuery)
        findOneQuery.lean.mockResolvedValue({
            _id: attendanceId,
            roomId,
            periodId: periodoId,
        })

        await removerUltimaPresencaDoTenant(tenantId, roomId)

        expect(removerPresenca).toHaveBeenCalledWith({
            tenantId, roomId, somenteAtual: true, ultima: true,
        })
    })

    it('limpa presenças somente do período corrente em transação', async () => {
        Room.findOne.mockReturnValue(roomQuery)
        roomQuery.lean.mockResolvedValue({
            _id: roomId,
            status: 'open',
            legacyPeriod: false,
            currentPeriodId: periodoId,
        })
        obterPeriodoCorrente.mockResolvedValue({
            _id: periodoId,
            tenantId,
            roomId,
            status: 'open',
        })
        limparPresencasDoPeriodo.mockResolvedValue(2)

        const result = await limparPresencasDaSalaDoTenant(tenantId, roomId)
        expect(result).toEqual({ sucesso: true, registrosRemovidos: 2 })
    })

    it('gera agregação de relatório com filtro tenant e nomes das salas scoped', async () => {
        Attendance.aggregate.mockResolvedValue([
            { _id: new mongoose.Types.ObjectId(roomId), quantidade: 3 },
        ])
        roomListQuery.lean.mockResolvedValue([{ _id: roomId, name: 'Sala Azul' }])

        await expect(gerarRelatorioDePresencasDoTenant(tenantId)).resolves.toEqual({
            total: 3,
            salas: [{ roomId, roomName: 'Sala Azul', quantidade: 3 }],
        })
        expect(Attendance.aggregate).toHaveBeenCalledWith([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$roomId', quantidade: { $sum: 1 } } },
            { $sort: { quantidade: -1, _id: 1 } },
        ])
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            _id: { $in: [expect.any(mongoose.Types.ObjectId)] },
        })
    })

    it('exclui presença somente quando pertence ao tenant informado', async () => {
        Attendance.findOne.mockReturnValue(findOneQuery)
        findOneQuery.lean.mockResolvedValue({
            _id: attendanceId,
            tenantId,
            roomId,
            periodId: periodoId,
        })
        removerPresenca.mockResolvedValue({
            _id: attendanceId,
            roomId,
            personNameSnapshot: 'Ana',
            method: 'manual',
            createdAt: new Date(),
        })

        await excluirPresencaDoTenant(tenantId, attendanceId)

        expect(removerPresenca).toHaveBeenCalledWith({ tenantId, roomId, attendanceId })
    })

    it('rejeita tenant, sala, presença ou paginação inválidos antes das consultas', async () => {
        await expect(listarPresencasDoTenant('invalid'))
            .rejects.toBeInstanceOf(TenantAttendanceError)
        await expect(excluirPresencaDoTenant(tenantId, 'invalid'))
            .rejects.toMatchObject({ statusCode: 400 })
        expect(Attendance.find).not.toHaveBeenCalled()
    })
})
