import 'dotenv/config'
import mongoose from 'mongoose'
import Tenant from '../src/models/tenantModel.js'
import Room from '../src/models/roomModel.js'
import Attendance from '../src/models/attendanceModel.js'
import CheckinPeriod from '../src/models/checkinPeriodModel.js'

// Cole aqui o ID da organização desejada.
// Para usar outra organização, altere apenas esta variável. Ex: 6af4b64fed866ca4e8878f55
// Execute assim:
// node scripts\\criarCheckinsFicticios.js
// O banco alvo deve ser definido nesta mesma variável. Ex: dbAlvo='Checkin_de_sala'
const idTenanteAlvo = '6af4b64fed866ca4e8878f55'
// Coloque o Banco alvo aqui. Ex: 'Checkin_de_sala'
const dbAlvo = 'Checkin_de_sala'

const nomesFicticios = [
    'Pessoa Ficticia 01',
    'Pessoa Ficticia 02',
    'Pessoa Ficticia 03',
]

function normalizarNome(nome) {
    return nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

async function main() {
    if (!/^[a-fA-F0-9]{24}$/.test(idTenanteAlvo)) {
        throw new Error(
            'Informe um ID de tenant válido na variável idTenanteAlvo.',
        )
    }

    if (
        process.argv.length !== 2
    ) {
        throw new Error(
            'Uso: node scripts\\criarCheckinsFicticios.js ' +
            '(defina dbAlvo no código, na linha 13)',
        )
    }

    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI não configurada.')
    }

    if (!dbAlvo || dbAlvo === 'NOME_DO_BANCO_AQUI') {
        throw new Error(
            'Variável dbAlvo não configurada no código. Defina na linha 13 ' +
            'exemplo: const dbAlvo = "Checkin_de_sala"',
        )
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, {
            autoIndex: false,
            autoCreate: false,
        })

        if (mongoose.connection.db.databaseName !== dbAlvo) {
            throw new Error(
                'O nome do banco conectado não corresponde ao dbAlvo configurado.',
            )
        }

        const tenantId = new mongoose.Types.ObjectId(idTenanteAlvo)
        const session = await mongoose.startSession()

        try {
            let resultado

            await session.withTransaction(async () => {
                const tenant = await Tenant.findOne({
                    _id: tenantId,
                    status: 'active',
                }).session(session).lean()

                if (!tenant) {
                    throw new Error('Tenant ativo não encontrado.')
                }

                const sala = await Room.findOne({
                    tenantId,
                    status: { $in: ['open', 'closed'] },
                    legacyPeriod: { $ne: true },
                    currentPeriodId: { $type: 'objectId' },
                }).sort({ name: 1, _id: 1 }).session(session).lean()

                if (!sala) {
                    throw new Error(
                        'O tenant não possui sala não arquivada e não ' +
                        'legada com período corrente válido.',
                    )
                }

                const agora = Date.now()
                const idsPeriodos = []

                for (let numero = 1; numero <= 3; numero += 1) {
                    const inicio = new Date(
                        agora - numero * 24 * 60 * 60 * 1000,
                    )
                    const fim = new Date(inicio.getTime() + 60 * 60 * 1000)
                    const periodId = new mongoose.Types.ObjectId()

                    const presencas = nomesFicticios.map((nome, indice) => {
                        const horario = new Date(
                            inicio.getTime() + (indice + 1) * 5 * 60 * 1000,
                        )

                        return {
                            _id: new mongoose.Types.ObjectId(),
                            tenantId,
                            roomId: sala._id,
                            periodId,
                            personId: null,
                            personNameSnapshot: nome,
                            personNameKey: normalizarNome(nome),
                            method: 'manual',
                            createdAt: horario,
                            updatedAt: horario,
                        }
                    })

                    await Attendance.create(presencas, { session, ordered: true })

                    await CheckinPeriod.create([{
                        _id: periodId,
                        tenantId,
                        roomId: sala._id,
                        roomName: sala.name,
                        startedAt: inicio,
                        endedAt: fim,
                        status: 'closed',
                        participants: presencas.map(presenca => ({
                            attendanceId: presenca._id,
                            personId: null,
                            userId: null,
                            name: presenca.personNameSnapshot,
                            tipo_cliente: null,
                            checkedInAt: presenca.createdAt,
                        })),
                        createdAt: inicio,
                        updatedAt: fim,
                    }], { session })

                    idsPeriodos.push(String(periodId))
                }

                resultado = {
                    tenant: tenant.name,
                    sala: sala.name,
                    idsPeriodos,
                }
            })

            console.log('Dados fictícios criados com sucesso.')
            console.log('Tenant:', resultado.tenant)
            console.log('Sala:', resultado.sala)
            console.log('Períodos:', resultado.idsPeriodos.join(', '))
            console.log('Total: 3 períodos e 9 presenças.')
        } finally {
            await session.endSession()
        }
    } finally {
        await mongoose.disconnect()
    }
}

main().catch(error => {
    console.error('Falha ao criar dados fictícios:', error.message)
    process.exitCode = 1
})
