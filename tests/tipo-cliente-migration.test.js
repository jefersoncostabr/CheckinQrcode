import { jest } from '@jest/globals'
import { migrateTipoCliente } from '../scripts/migrateTipoCliente.js'

function criarColecoes() {
    const users = {
        countDocuments: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 2 }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    }
    const memberships = {
        find: jest.fn(() => (async function* () {
            yield { userId: 'usuario-privilegiado' }
        })()),
    }
    return { users, memberships }
}

test('preenche ausentes e promove cliente com vínculo privilegiado', async () => {
    const { users, memberships } = criarColecoes()

    await expect(migrateTipoCliente(users, memberships)).resolves.toEqual({
        preenchidos: 2,
        promovidos: 1,
    })

    expect(users.updateMany).toHaveBeenCalledWith(
        { tipo_cliente: { $exists: false } },
        { $set: { tipo_cliente: 'equipe' } },
    )
    expect(memberships.find).toHaveBeenCalledWith(
        { role: { $in: ['operator', 'admin', 'owner'] } },
        { projection: { userId: 1 } },
    )
    expect(users.updateOne).toHaveBeenCalledWith(
        { _id: 'usuario-privilegiado', tipo_cliente: 'cliente' },
        { $set: { tipo_cliente: 'equipe' } },
    )
})

test('interrompe antes de escrever se houver tipo inválido', async () => {
    const { users, memberships } = criarColecoes()
    users.countDocuments.mockResolvedValueOnce(1)

    await expect(migrateTipoCliente(users, memberships))
        .rejects.toThrow('valores inválidos')

    expect(users.updateMany).not.toHaveBeenCalled()
    expect(users.updateOne).not.toHaveBeenCalled()
})

test('informa falha se ainda houver usuário sem tipo válido', async () => {
    const { users, memberships } = criarColecoes()
    users.countDocuments.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await expect(migrateTipoCliente(users, memberships))
        .rejects.toThrow('Ainda existem usuários sem tipo válido')
})
