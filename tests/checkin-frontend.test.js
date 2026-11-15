import { jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const script = readFileSync(new URL('../public/checkin.js', import.meta.url), 'utf8')

async function iniciarTela({ sessaoExpirada = false } = {}) {
    const elementos = new Map()
    const elemento = id => {
        if (!elementos.has(id)) {
            elementos.set(id, {
                value: '', hidden: false, disabled: false, textContent: '',
                listeners: {}, classList: { add() {}, remove() {} },
                addEventListener(evento, callback) { this.listeners[evento] = callback },
            })
        }
        return elementos.get(id)
    }
    let sessao = false
    const fetch = jest.fn(async (url, options) => {
        let status = 200
        let data = { sucesso: true }
        const sala = { id: 'sala-1', nome: 'Sala Azul' }
        const pessoa = { id: 'user-1', nome: 'Ana' }
        if (url.endsWith('/resolve')) data = { sucesso: true, sala }
        else if (url.endsWith('/sessao')) {
            status = sessao ? 200 : 401
            data = sessao ? { sucesso: true, sala, pessoa } : { sucesso: false }
        } else if (url.endsWith('/criar-conta') || url.endsWith('/login')) {
            sessao = true
            data = { sucesso: true, sala, pessoa }
        } else if (url.endsWith('/logout')) {
            sessao = false
            status = 204
        } else if (url.endsWith('/attendance') && sessaoExpirada) {
            status = 401
            data = { sucesso: false, mensagem: 'Sessão expirada. Faça login novamente.' }
        } else if (!url.endsWith('/attendance')) {
            throw new Error(`Rota inesperada: ${url}`)
        }
        return { ok: status >= 200 && status < 300, status, json: async () => data }
    })

    runInNewContext(script, {
        document: { getElementById: elemento, querySelector: elemento },
        window: { location: { hash: `#${'A'.repeat(43)}` } },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        URLSearchParams, AbortController, fetch,
    })
    await new Promise(resolve => setImmediate(resolve))
    return { elemento, fetch }
}

test('cadastra uma vez, permite sair e entrar com outra conta no mesmo aparelho', async () => {
    const { elemento, fetch } = await iniciarTela()
    elemento('nomeInput').value = 'Ana'
    elemento('senhaInput').value = 'senha123'

    await elemento('btnCriarConta').listeners.click()

    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/attendance'))).toHaveLength(0)
    expect(elemento('statusConta').textContent).toContain('presença confirmada')
    expect(elemento('btnSair').hidden).toBe(false)
    expect(elemento('btnConfirmar').disabled).toBe(true)

    await elemento('btnSair').listeners.click()

    expect(elemento('nomeInput').disabled).toBe(false)
    expect(elemento('senhaInput').disabled).toBe(false)
    expect(elemento('btnEntrar').hidden).toBe(false)

    elemento('nomeInput').value = 'Outra pessoa'
    elemento('senhaInput').value = 'senha123'
    await elemento('btnEntrar').listeners.click()

    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/attendance'))).toHaveLength(1)
    expect(elemento('btnSair').hidden).toBe(false)
    expect(elemento('senhaInput').value).toBe('')
    const chamadaSessao = fetch.mock.calls.find(([url]) => url.endsWith('/sessao'))
    expect(chamadaSessao[1].method).toBe('POST')
    expect(JSON.parse(chamadaSessao[1].body).token).toBe('A'.repeat(43))
})

test('permite entrar novamente quando a sessão expira ao confirmar presença', async () => {
    const { elemento } = await iniciarTela({ sessaoExpirada: true })
    elemento('nomeInput').value = 'Ana'
    elemento('senhaInput').value = 'senha123'

    await elemento('btnEntrar').listeners.click()

    expect(elemento('statusConta').textContent).toContain('Sessão expirada')
    expect(elemento('nomeInput').disabled).toBe(false)
    expect(elemento('senhaInput').disabled).toBe(false)
    expect(elemento('btnEntrar').hidden).toBe(false)
})
