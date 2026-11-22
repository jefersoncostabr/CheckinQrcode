import mongoose from 'mongoose'
import CheckinPeriod from '../models/checkinPeriodModel.js'
import Attendance from '../models/attendanceModel.js'
import Room from '../models/roomModel.js'
import Person from '../models/personModel.js'
import User from '../models/userModel.js'

export class CheckinPeriodError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'CheckinPeriodError'
        this.statusCode = statusCode
    }
}

async function comSessao(session, operation) {
    try {
        if (session) return await operation(session)
        const novaSessao = await mongoose.startSession()
        try {
            return await novaSessao.withTransaction(() => operation(novaSessao))
        } finally {
            await novaSessao.endSession()
        }
    } catch (error) {
        if (error?.code === 10334 || error?.codeName === 'BSONObjectTooLarge') {
            throw new CheckinPeriodError('O histórico atingiu o tamanho máximo permitido.', 413)
        }
        throw error
    }
}

async function bloquearSala(tenantId, roomId, session, incluirArquivada = false) {
    const filter = { _id: roomId, tenantId }
    if (!incluirArquivada) filter.status = { $ne: 'archived' }
    const sala = await Room.findOneAndUpdate(
        filter,
        { $inc: { periodRevision: 1 } },
        { returnDocument: 'after', session },
    ).lean()
    if (!sala) throw new CheckinPeriodError('Sala não encontrada.', 404)
    if (!sala.currentPeriodId) {
        throw new CheckinPeriodError('Sala sem período corrente. Execute a migração de períodos.', 409)
    }
    return sala
}

async function atualizarPeriodo(sala, tenantId, roomId, update, session) {
    const periodo = await CheckinPeriod.findOneAndUpdate(
        { _id: sala.currentPeriodId, tenantId, roomId, status: sala.status },
        update,
        { session, returnDocument: 'after', runValidators: true },
    )
    if (!periodo) throw new CheckinPeriodError('Período da sala não encontrado ou inconsistente.', 409)
}

export async function inserirPresencaNoPeriodo({
    tenantId, roomId, attendance, personId, checkedInAt, session, permitirFechada = false,
}) {
    return comSessao(session, async transaction => {
        const sala = await bloquearSala(tenantId, roomId, transaction)
        if (sala.status !== 'open' && !(permitirFechada && sala.status === 'closed')) {
            throw new CheckinPeriodError('Esta sala está fechada para check-in.', 403)
        }
        if (attendance.periodId && String(attendance.periodId) !== String(sala.currentPeriodId)) {
            throw new CheckinPeriodError('O período da sala mudou. Tente novamente.', 409)
        }

        let person = null
        let user = null
        if (personId && !sala.legacyPeriod) {
            person = await Person.findOne({ _id: personId, tenantId }).session(transaction).lean()
            if (!person) throw new CheckinPeriodError('Pessoa não encontrada nesta organização.', 404)
            if (person.userId) {
                user = await User.findOne({ _id: person.userId }).session(transaction).lean()
                if (!user || !['cliente', 'equipe'].includes(user.tipo_cliente)) {
                    throw new CheckinPeriodError('Conta sem tipo de cliente válido.', 409)
                }
            }
        }

        const [created] = await Attendance.create([{
            ...attendance,
            tenantId,
            roomId,
            periodId: sala.currentPeriodId,
        }], { session: transaction })

        if (!sala.legacyPeriod) {
            await atualizarPeriodo(sala, tenantId, roomId, {
                $push: {
                    participants: {
                        attendanceId: created._id,
                        personId: person?._id || null,
                        userId: user?._id || null,
                        name: created.personNameSnapshot,
                        tipo_cliente: user?.tipo_cliente || null,
                        checkedInAt: created.createdAt || checkedInAt,
                    },
                },
            }, transaction)
        }
        return created
    })
}

export async function adicionarPresencaManualAoUltimoPeriodo(options) {
    return inserirPresencaNoPeriodo({ ...options, permitirFechada: true })
}

export async function removerPresenca({ tenantId, roomId, attendanceId, somenteAtual = false, ultima = false }) {
    return comSessao(null, async session => {
        const sala = await bloquearSala(tenantId, roomId, session, !somenteAtual)
        const filter = { tenantId, roomId }
        if (attendanceId) filter._id = attendanceId
        if (somenteAtual) filter.periodId = sala.currentPeriodId
        const deleted = await Attendance.findOneAndDelete(filter, {
            session,
            ...(ultima ? { sort: { createdAt: -1, _id: -1 } } : {}),
        }).lean()
        if (!deleted) return null
        if (!sala.legacyPeriod && sala.status === 'open' &&
            String(deleted.periodId) === String(sala.currentPeriodId)) {
            await atualizarPeriodo(sala, tenantId, roomId, {
                $pull: { participants: { attendanceId: deleted._id } },
            }, session)
        }
        return deleted
    })
}

export async function limparPresencasDoPeriodo(tenantId, roomId) {
    return comSessao(null, async session => {
        const sala = await bloquearSala(tenantId, roomId, session)
        const result = await Attendance.deleteMany(
            { tenantId, roomId, periodId: sala.currentPeriodId },
            { session },
        )
        if (!sala.legacyPeriod && sala.status === 'open') {
            await atualizarPeriodo(sala, tenantId, roomId, { $set: { participants: [] } }, session)
        }
        return result.deletedCount
    })
}

export async function obterPeriodoCorrente(tenantId, roomId) {
    const sala = await Room.findOne({ _id: roomId, tenantId }).lean()
    if (!sala || !sala.currentPeriodId) return null
    if (sala.legacyPeriod) return { _id: sala.currentPeriodId, status: sala.status }
    return CheckinPeriod.findOne({ _id: sala.currentPeriodId, tenantId, roomId }).lean()
}

export async function listarPeriodosDoTenant(tenantId) {
    const periodos = await CheckinPeriod.find({ tenantId })
        .select('_id roomId roomName startedAt endedAt status participants createdAt updatedAt')
        .sort({ startedAt: -1, _id: -1 })
        .lean()

    return periodos.map(({ _id, ...periodo }) => ({
        id: String(_id),
        ...periodo,
    }))
}

