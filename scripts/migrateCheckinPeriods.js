import 'dotenv/config'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OLD_ATTENDANCE_INDEX = { tenantId: 1, roomId: 1, personNameKey: 1 }
const NEW_ATTENDANCE_INDEX = {
    tenantId: 1,
    roomId: 1,
    periodId: 1,
    personNameKey: 1,
}
const NEW_INDEX_NAME = 'tenant_room_period_personNameKey_unique'

export async function migrarSalasEDados(collectionRooms, collectionAttendances, collectionPeriods) {
    const presencasSemSala = await collectionAttendances.aggregate([
        {
            $lookup: {
                from: 'rooms',
                localField: 'roomId',
                foreignField: '_id',
                as: 'room',
            },
        },
        {
            $match: {
                $or: [
                    { room: { $eq: [] } },
                    { $expr: { $ne: ['$tenantId', { $arrayElemAt: ['$room.tenantId', 0] }] } },
                ],
            },
        },
        { $limit: 1 },
    ]).toArray()

    if (presencasSemSala.length > 0) {
        throw new Error(
            'Existe presença sem sala correspondente ou com tenant inconsistente.',
        )
    }

    for await (const sala of collectionRooms.find({ currentPeriodId: null })) {
        if (await collectionPeriods.findOne({ tenantId: sala.tenantId, roomId: sala._id })) {
            throw new Error('Sala sem período corrente já possui histórico. Inspecione os dados antes de continuar.')
        }
        await collectionRooms.updateOne(
            { _id: sala._id, currentPeriodId: null },
            { $set: {
                currentPeriodId: new mongoose.Types.ObjectId(),
                legacyPeriod: true,
                periodRevision: 0,
            } },
        )
    }

    if (await collectionRooms.countDocuments({ currentPeriodId: { $not: { $type: 'objectId' } } })) {
        throw new Error('Existem salas com identificador de período inválido.')
    }

    for await (const sala of collectionRooms.find({ legacyPeriod: true })) {
        if (!sala.currentPeriodId) throw new Error('Sala legada sem identificador de período.')
        await collectionAttendances.updateMany(
            { roomId: sala._id, tenantId: sala.tenantId, periodId: { $exists: false } },
            { $set: { periodId: sala.currentPeriodId } },
        )
        const divergentes = await collectionAttendances.countDocuments({
            roomId: sala._id,
            tenantId: sala.tenantId,
            periodId: { $ne: sala.currentPeriodId },
        })
        if (divergentes) throw new Error('Presenças de sala legada possuem períodos inconsistentes.')
    }

    const presencasSemPeriodo = await collectionAttendances.countDocuments({
        periodId: { $not: { $type: 'objectId' } },
    })
    if (presencasSemPeriodo > 0) {
        throw new Error(`Existem ${presencasSemPeriodo} presença(s) sem periodId válido após a migração.`)
    }
}

async function listarIndices(collectionAttendances) {
    try {
        return await collectionAttendances.indexes()
    } catch (error) {
        if (error.code === 26) return []
        throw error
    }
}

export async function garantirNovoIndice(collectionAttendances) {
    const indexes = await listarIndices(collectionAttendances)
    const jaExiste = indexes.some(
        index =>
            index.name === NEW_INDEX_NAME &&
            JSON.stringify(index.key) === JSON.stringify(NEW_ATTENDANCE_INDEX) &&
            index.unique === true,
    )

    if (!jaExiste) {
        await collectionAttendances.createIndex(NEW_ATTENDANCE_INDEX, {
            name: NEW_INDEX_NAME,
            unique: true,
        })
    }

    const verificacao = await listarIndices(collectionAttendances)
    const confirmado = verificacao.some(
        index =>
            index.name === NEW_INDEX_NAME &&
            JSON.stringify(index.key) === JSON.stringify(NEW_ATTENDANCE_INDEX) &&
            index.unique === true,
    )
    if (!confirmado) {
        throw new Error(
            'Não foi possível verificar o novo índice único. O índice antigo foi mantido.',
        )
    }
}

export async function removerIndiceAntigo(collectionAttendances) {
    const indexes = await listarIndices(collectionAttendances)
    const antigo = indexes.find(
        index =>
            JSON.stringify(index.key) === JSON.stringify(OLD_ATTENDANCE_INDEX) &&
            index.unique === true &&
            !index.partialFilterExpression &&
            !index.sparse,
    )

    if (antigo) {
        await collectionAttendances.dropIndex(antigo.name)
    }
}

export async function migrateCheckinPeriods(db) {
    const collectionRooms = db.collection('rooms')
    const collectionAttendances = db.collection('attendances')
    const collectionPeriods = db.collection('checkinPeriods')
    await migrarSalasEDados(collectionRooms, collectionAttendances, collectionPeriods)
    await garantirNovoIndice(collectionAttendances)
    await removerIndiceAntigo(collectionAttendances)
}

async function main() {
    if (
        process.argv.length !== 4 ||
        process.argv[2] !== '--confirm-database' ||
        !process.argv[3]
    ) {
        throw new Error(
            'Uso: node scripts\\migrateCheckinPeriods.js --confirm-database NOME_DO_BANCO',
        )
    }
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI não configurada.')
    }

    const connection = await mongoose.createConnection(
        process.env.MONGO_URI,
        { autoIndex: false },
    ).asPromise()

    try {
        if (connection.db.databaseName !== process.argv[3]) {
            throw new Error('O nome do banco conectado não corresponde à confirmação.')
        }

        await migrateCheckinPeriods(connection.db)

        console.log('Migração de períodos de check-in concluída.')
    } finally {
        await connection.close()
    }
}

const invokedScript = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false

if (invokedScript) {
    main().catch(error => {
        console.error('Falha ao migrar períodos de check-in:', error.message)
        process.exitCode = 1
    })
}
