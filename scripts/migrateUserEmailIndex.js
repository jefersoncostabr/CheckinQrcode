import 'dotenv/config'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const guardName = 'users_email_migration_guard'
const isEmailKey = index => Object.keys(index.key).length === 1 && index.key.email === 1
const isPartial = index => isEmailKey(index) && index.unique === true &&
    index.partialFilterExpression?.email?.$type === 'string' &&
    Object.keys(index.partialFilterExpression).length === 1
const isGuard = index => isEmailKey(index) && index.unique === true && index.sparse === true &&
    !index.partialFilterExpression
const isLegacy = index => isEmailKey(index) && index.unique === true &&
    !index.sparse && !index.partialFilterExpression

export async function migrateUserEmailIndex(collection) {
    let indexes = await collection.indexes()
    const emailIndexes = indexes.filter(isEmailKey)
    if (emailIndexes.some(index => !['email_1', guardName].includes(index.name))) {
        throw new Error('Índice de e-mail inesperado. Inspecione os índices antes de continuar.')
    }
    let target = indexes.find(index => index.name === 'email_1')
    let guard = indexes.find(index => index.name === guardName)
    if ((target && !isPartial(target) && !isLegacy(target)) || (guard && !isGuard(guard))) {
        throw new Error('Configuração inesperada no índice de e-mail. Nenhum índice foi removido.')
    }
    if (target && isPartial(target)) {
        if (guard) await collection.dropIndex(guardName)
        return
    }
    if (!guard) {
        await collection.createIndex({ email: 1 }, { name: guardName, unique: true, sparse: true })
        indexes = await collection.indexes()
        guard = indexes.find(index => index.name === guardName)
        if (!guard || !isGuard(guard)) {
            throw new Error('Não foi possível verificar o índice de proteção. Nenhum índice foi removido.')
        }
    }
    if (target) await collection.dropIndex('email_1')
    await collection.createIndex({ email: 1 }, {
        name: 'email_1',
        unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
    })
    indexes = await collection.indexes()
    target = indexes.find(index => index.name === 'email_1')
    if (!target || !isPartial(target)) {
        throw new Error('Não foi possível verificar o índice parcial; o índice de proteção foi mantido.')
    }
    await collection.dropIndex(guardName)
}

async function main() {
    if (process.argv.length !== 4 || process.argv[2] !== '--confirm-database' || !process.argv[3]) {
        throw new Error('Uso: node scripts\\migrateUserEmailIndex.js --confirm-database NOME_DO_BANCO')
    }
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI não configurada.')
    const connection = await mongoose.createConnection(process.env.MONGO_URI, { autoIndex: false }).asPromise()
    try {
        if (connection.db.databaseName !== process.argv[3]) {
            throw new Error('O nome do banco conectado não corresponde à confirmação.')
        }
        const collection = connection.db.collection('users')
        if (!await connection.db.listCollections({ name: 'users' }, { nameOnly: true }).hasNext()) {
            await collection.createIndex({ email: 1 }, {
                name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string' } },
            })
        } else {
            await migrateUserEmailIndex(collection)
        }
        console.log('Índice de e-mail verificado.')
    } finally {
        await connection.close()
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('Falha ao migrar índice de e-mail:', error.message)
        process.exitCode = 1
    })
}
