import { jest } from '@jest/globals'
import { migrateUserEmailIndex } from '../scripts/migrateUserEmailIndex.js'

function collectionMock() {
    let indexes = [
        { name: '_id_', key: { _id: 1 } },
        { name: 'email_1', key: { email: 1 }, unique: true },
    ]
    return {
        indexes: jest.fn(async () => indexes),
        createIndex: jest.fn(async (key, options) => {
            indexes = [...indexes, { key, ...options }]
            return options.name
        }),
        dropIndex: jest.fn(async name => {
            indexes = indexes.filter(index => index.name !== name)
        }),
    }
}

test('mantém um índice único de proteção durante a migração e aceita repetição', async () => {
    const collection = collectionMock()

    await migrateUserEmailIndex(collection)
    await migrateUserEmailIndex(collection)

    expect(await collection.indexes()).toContainEqual({
        name: 'email_1', key: { email: 1 }, unique: true,
        partialFilterExpression: { email: { $type: 'string' } },
    })
    expect(collection.dropIndex.mock.calls).toEqual([
        ['email_1'], ['users_email_migration_guard'],
    ])
})

test('não remove o índice antigo quando não consegue criar a proteção', async () => {
    const collection = collectionMock()
    collection.createIndex.mockRejectedValue(new Error('falha na criação'))

    await expect(migrateUserEmailIndex(collection)).rejects.toThrow('falha na criação')
    expect(collection.dropIndex).not.toHaveBeenCalled()
})

test('mantém a proteção e pode retomar após falha ao criar o índice parcial', async () => {
    const collection = collectionMock()
    const criarIndice = collection.createIndex.getMockImplementation()
    collection.createIndex.mockImplementationOnce(criarIndice).mockRejectedValueOnce(new Error('falha'))

    await expect(migrateUserEmailIndex(collection)).rejects.toThrow('falha')
    expect(await collection.indexes()).toContainEqual({
        name: 'users_email_migration_guard', key: { email: 1 }, unique: true, sparse: true,
    })
    await migrateUserEmailIndex(collection)
    expect((await collection.indexes()).some(index => index.name === 'users_email_migration_guard')).toBe(false)
})
