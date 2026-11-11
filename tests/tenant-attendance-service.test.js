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
const Attendance = {
    countDocuments: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    find: jest.fn(),
    aggregate: jest.fn(),
    findOneAndDelete: jest.fn(),
}
const Room = {
    exists: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
}

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
Attendance.find.mockReturnValue(listQuery)
Attendance.findOneAndDelete.mockReturnValue(deleteQuery)
Room.find.mockReturnValue(roomListQuery)
Room.findOne.mockReturnValue(roomQuery)

jest.unstable_mockModule('../src/models/attendanceModel.js', () => ({ default: Attendance }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))

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
        Attendance.find.mockReturnValue(listQuery)
        Attendance.findOneAndDelete.mockReturnValue(deleteQuery)
        Room.find.mockReturnValue(roomListQuery)
        Room.findOne.mockReturnValue(roomQuery)
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
        }])
        Attendance.aggregate.mockResolvedValue([
            { _id: new mongoose.Types.ObjectId(roomId), quantidade: 3 },
        ])

        await expect(obterResumoDoTenant(tenantId)).resolves.toEqual({
            salas: [{
                id: roomId,
                nome: 'Sala Azul',
                status: 'open',
                aberta: true,
                quantidade: 3,
            }],
            total: 3,
        })
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            status: { $ne: 'archived' },
        })
        expect(Attendance.aggregate).toHaveBeenCalledWith([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$roomId', quantidade: { $sum: 1 } } },
        ])
    })

    it('registra presença manual dentro da sala e tenant informados', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul' })
        Attendance.create.mockResolvedValue({})

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
        expect(Attendance.create).toHaveBeenCalledWith({
            tenantId,
            roomId,
            personNameSnapshot: 'Ana Silva',
            personNameKey: 'ana silva',
            method: 'manual',
            sourceIp: '127.0.0.1',
        })
    })

    it('remove a última presença ou limpa somente a sala do tenant', async () => {
        Room.exists.mockResolvedValue({ _id: roomId })
        deleteQuery.lean.mockResolvedValue({ _id: attendanceId, roomId })
        Attendance.deleteMany.mockResolvedValue({ deletedCount: 2 })

        await removerUltimaPresencaDoTenant(tenantId, roomId)
        await expect(limparPresencasDaSalaDoTenant(tenantId, roomId))
            .resolves.toEqual({ sucesso: true, registrosRemovidos: 2 })

        expect(Attendance.findOneAndDelete).toHaveBeenCalledWith(
            { tenantId, roomId },
            { sort: { createdAt: -1, _id: -1 } },
        )
        expect(Attendance.deleteMany).toHaveBeenCalledWith({ tenantId, roomId })
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
        await excluirPresencaDoTenant(tenantId, attendanceId)

        expect(Attendance.findOneAndDelete).toHaveBeenCalledWith({
            _id: attendanceId,
            tenantId,
        })
    })

    it('rejeita tenant, sala, presença ou paginação inválidos antes das consultas', async () => {
        await expect(listarPresencasDoTenant('invalid'))
            .rejects.toBeInstanceOf(TenantAttendanceError)
        await expect(excluirPresencaDoTenant(tenantId, 'invalid'))
            .rejects.toMatchObject({ statusCode: 400 })
        expect(Attendance.find).not.toHaveBeenCalled()
    })
})
