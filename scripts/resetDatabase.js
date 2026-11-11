import dotenv from 'dotenv'
import mongoose from 'mongoose'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '..', '.env') })

function parseArguments(args) {
    let confirmedDatabase = null
    let allowRemote = false

    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--confirm-reset') {
            confirmedDatabase = args[index + 1] || null
            index += 1
        } else if (args[index] === '--allow-remote') {
            allowRemote = true
        } else {
            throw new Error(`Opção desconhecida: ${args[index]}`)
        }
    }

    if (!confirmedDatabase) {
        throw new Error(
            'Confirme a operação informando o nome exato do banco: ' +
            'npm run db:reset -- --confirm-reset <nome-do-banco>',
        )
    }

    return { confirmedDatabase, allowRemote }
}

function getDatabaseTarget(mongoUri, confirmedDatabase, allowRemote) {
    if (!mongoUri) {
        throw new Error('MONGO_URI não está configurada.')
    }

    let uri
    try {
        uri = new URL(mongoUri)
    } catch {
        throw new Error('MONGO_URI não é uma URL MongoDB válida.')
    }

    if (!['mongodb:', 'mongodb+srv:'].includes(uri.protocol)) {
        throw new Error('MONGO_URI deve usar o protocolo mongodb:// ou mongodb+srv://.')
    }

    const databaseName = decodeURIComponent(uri.pathname.replace(/^\/+/, ''))
    if (!databaseName) {
        throw new Error('MONGO_URI deve indicar explicitamente o nome do banco.')
    }
    if (confirmedDatabase !== databaseName) {
        throw new Error(
            `O nome confirmado (${confirmedDatabase}) não corresponde ao banco da MONGO_URI.`,
        )
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('A limpeza está bloqueada quando NODE_ENV=production.')
    }

    const hostname = uri.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const isLocalHost =
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname === '::1' ||
        /^127(?:\.\d{1,3}){3}$/.test(hostname)

    if (!isLocalHost && !allowRemote) {
        throw new Error(
            `O host ${hostname} não é local. Para permitir explicitamente, ` +
            'adicione --allow-remote.',
        )
    }

    return { databaseName, hostname }
}

async function resetDatabase() {
    const { confirmedDatabase, allowRemote } = parseArguments(process.argv.slice(2))
    const target = getDatabaseTarget(
        process.env.MONGO_URI,
        confirmedDatabase,
        allowRemote,
    )

    console.log(`Conectando ao host "${target.hostname}", banco "${target.databaseName}".`)
    console.log('Todos os documentos das coleções serão removidos; coleções e índices serão preservados.')
    await mongoose.connect(process.env.MONGO_URI)

    try {
        const database = mongoose.connection.db
        if (database.databaseName !== target.databaseName) {
            throw new Error(
                `O banco conectado (${database.databaseName}) não corresponde ao banco confirmado.`,
            )
        }

        const collections = await database.listCollections({}, { nameOnly: true }).toArray()
        const unsupported = collections.filter(
            collection =>
                !collection.name.startsWith('system.') &&
                collection.type !== 'collection' &&
                collection.type !== 'view',
        )
        if (unsupported.length > 0) {
            const names = unsupported.map(collection => collection.name).join(', ')
            throw new Error(
                `Tipos de coleção não suportados (${names}); nenhum documento foi removido.`,
            )
        }

        const applicationCollections = collections.filter(
            collection =>
                collection.type === 'collection' &&
                !collection.name.startsWith('system.'),
        )

        let totalRemoved = 0
        for (const collection of applicationCollections) {
            const result = await database.collection(collection.name).deleteMany({})
            totalRemoved += result.deletedCount
            console.log(`${collection.name}: ${result.deletedCount} documento(s) removido(s).`)
        }

        const skipped = collections.filter(
            collection =>
                collection.type !== 'collection' ||
                collection.name.startsWith('system.'),
        )
        for (const collection of skipped) {
            console.log(`${collection.name}: ignorada (não é uma coleção de dados comum).`)
        }

        console.log(
            `Limpeza concluída: ${totalRemoved} documento(s) removido(s) ` +
            `de ${applicationCollections.length} coleção(ões).`,
        )
    } finally {
        await mongoose.disconnect()
    }
}

const invokedScript = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false

if (invokedScript) {
    try {
        await resetDatabase()
    } catch (error) {
        console.error(`Falha ao limpar o banco: ${error.message}`)
        process.exitCode = 1
    }
}
