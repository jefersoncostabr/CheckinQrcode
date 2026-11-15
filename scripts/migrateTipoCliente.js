import 'dotenv/config'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const invalidTipo = {
    $expr: {
        $not: [{
            $and: [
                { $eq: [{ $type: '$tipo_cliente' }, 'string'] },
                { $in: ['$tipo_cliente', ['cliente', 'equipe']] },
            ],
        }],
    },
}

export async function migrateTipoCliente(users, memberships) {
    const invalidosExistentes = await users.countDocuments({
        tipo_cliente: { $exists: true },
        ...invalidTipo,
    })

    if (invalidosExistentes > 0) {
        throw new Error('Existem valores inválidos em tipo_cliente. Corrija-os antes da migração.')
    }

    const preenchidos = await users.updateMany(
        { tipo_cliente: { $exists: false } },
        { $set: { tipo_cliente: 'equipe' } },
    )

    let promovidos = 0
    const vinculos = memberships.find(
        { role: { $in: ['operator', 'admin', 'owner'] } },
        { projection: { userId: 1 } },
    )

    for await (const vinculo of vinculos) {
        if (!vinculo.userId) {
            throw new Error('Existe um vínculo privilegiado sem userId. Corrija-o e execute novamente.')
        }

        const resultado = await users.updateOne(
            { _id: vinculo.userId, tipo_cliente: 'cliente' },
            { $set: { tipo_cliente: 'equipe' } },
        )
        promovidos += resultado.modifiedCount
    }

    const invalidosRestantes = await users.countDocuments(invalidTipo)
    if (invalidosRestantes > 0) {
        throw new Error('Ainda existem usuários sem tipo válido. Verifique a migração.')
    }

    return { preenchidos: preenchidos.modifiedCount, promovidos }
}

async function main() {
    if (process.argv.length !== 4 ||
        process.argv[2] !== '--confirm-database' ||
        !process.argv[3]) {
        throw new Error(
            'Uso: node scripts\\migrateTipoCliente.js --confirm-database NOME_DO_BANCO',
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

        const existeUsers = await connection.db
            .listCollections({ name: 'users' }, { nameOnly: true })
            .hasNext()

        if (!existeUsers) {
            throw new Error('A coleção users não existe no banco confirmado.')
        }

        const resultado = await migrateTipoCliente(
            connection.db.collection('users'),
            connection.db.collection('memberships'),
        )

        console.log(
            `Migração concluída: ${resultado.preenchidos} preenchidos; ` +
            `${resultado.promovidos} ajustados para equipe.`,
        )
    } finally {
        await connection.close()
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('Falha ao migrar tipo de cliente:', error.message)
        process.exitCode = 1
    })
}
