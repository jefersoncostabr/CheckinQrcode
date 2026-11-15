import { jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const script = readFileSync(new URL('../public/admScript.js', import.meta.url), 'utf8')

function criarElemento() {
    return {
        style: {},
        classList: { add() {}, remove() {} },
        children: [],
        listeners: {},
        addEventListener(evento, callback) { this.listeners[evento] = callback },
        appendChild(elemento) { this.children.push(elemento) },
        append(...elementos) { this.children.push(...elementos) },
        replaceChildren(...elementos) { this.children = elementos },
        setAttribute() {},
        set innerHTML(valor) { if (valor === '') this.children = [] },
    }
}

async function iniciarPainel() {
    const elementos = new Map()
    const document = {
        getElementById(id) {
            if (!elementos.has(id)) elementos.set(id, criarElemento())
            return elementos.get(id)
        },
        querySelector(seletor) { return this.getElementById(seletor) },
        createElement: criarElemento,
        addEventListener: jest.fn(),
    }
    const salas = [
        { id: '1', nome: 'Sala aberta', status: 'open' },
        { id: '2', nome: 'Sala fechada', status: 'closed' },
    ]
    const fetch = jest.fn(async (url, options = {}) => {
        let data
        if (url === '/api/tenant/auth/session') data = { tenant: { name: 'Evento', role: 'admin' } }
        else if (url === '/api/tenant/dashboard') data = { salas: [{ id: '1', nome: 'Sala aberta', aberta: true, quantidade: 2 }] }
        else if (url === '/api/tenant/rooms') data = { salas }
        else if (url === '/api/tenant/qrcodes') data = { qrcodes: [] }
        else if (url === '/api/tenant/biometrics/profiles') data = { pessoas: [] }
        else throw new Error(`URL inesperada: ${url}`)
        return { ok: true, status: 200, json: async () => data }
    })
    const console = { error: jest.fn() }
    runInNewContext(script, {
        document, fetch, console, URLSearchParams,
        window: { setInterval: jest.fn(), location: {} },
    })
    document.addEventListener.mock.calls.find(([evento]) => evento === 'DOMContentLoaded')[1]()
    await new Promise(resolve => setImmediate(resolve))
    return { document, fetch, console }
}

test('inicializa o painel e mostra as salas abertas e fechadas', async () => {
    const { document, console } = await iniciarPainel()
    const checkins = document.getElementById('listaCheckins').children
    const salas = document.getElementById('listaSalas').children

    expect(checkins[0].children[1].textContent).toBe('2 check-ins')
    expect(document.getElementById('checkinsVazio').hidden).toBe(true)
    expect(salas.map(sala => sala.children[0].textContent)).toEqual([
        'Sala aberta (aberta)', 'Sala fechada (fechada)',
    ])
    expect(salas.map(sala => sala.children[1].children[3].textContent)).toEqual([
        'Fechar sala', 'Reabrir sala',
    ])
    expect(console.error).not.toHaveBeenCalled()
})

test('o botão de adicionar sala usa a função registrada na inicialização', async () => {
    const { document, fetch, console } = await iniciarPainel()
    document.getElementById('salaInput').value = ' Nova sala '

    await document.getElementById('btnAddSala').listeners.click()

    expect(fetch).toHaveBeenCalledWith('/api/tenant/rooms', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Nova sala' }),
    }))
    expect(document.getElementById('salaInput').value).toBe('')
    expect(console.error).not.toHaveBeenCalled()
})
