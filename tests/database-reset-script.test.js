import { spawnSync } from 'node:child_process'
import path from 'node:path'

const scriptPath = path.resolve('scripts/resetDatabase.js')

function runReset(args, env = {}) {
    return spawnSync(process.execPath, [scriptPath, ...args], {
        encoding: 'utf8',
        env: {
            ...process.env,
            MONGO_URI: 'mongodb://localhost:27017/reset-test',
            NODE_ENV: 'development',
            ...env,
        },
    })
}

describe('proteções do script de reset do banco', () => {
    it('não inicia sem confirmação explícita do banco alvo', () => {
        const result = runReset([])

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('--confirm-reset')
        expect(result.stdout).not.toContain('Conectando ao host')
    })

    it('bloqueia a operação em ambiente de produção antes de conectar', () => {
        const result = runReset(
            ['--confirm-reset', 'reset-test'],
            { NODE_ENV: 'production' },
        )

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('bloqueada quando NODE_ENV=production')
        expect(result.stdout).not.toContain('Conectando ao host')
    })

    it('bloqueia hosts remotos sem a opção explícita antes de conectar', () => {
        const result = runReset(
            ['--confirm-reset', 'reset-test'],
            { MONGO_URI: 'mongodb://db.example.test:27017/reset-test' },
        )

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('--allow-remote')
        expect(result.stdout).not.toContain('Conectando ao host')
    })
})
