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
        options: [],
        value: '',
        addEventListener(evento, callback) { this.listeners[evento] = callback },
        appendChild(elemento) { this.children.push(elemento) },
        append(...elementos) { this.children.push(...elementos) },
        replaceChildren(...elementos) { this.children = elementos },
        setAttribute() {},
        set innerHTML(valor) { if (valor === '') this.children = [] },
        scrollIntoView() {},
    }
}

async function iniciarPainel({ qrcodes = [] } = {}) {
    const elementos = new Map()
    const confirm = jest.fn(() => true)
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
        const method = (options.method || 'GET').toUpperCase()
        const qrPatch = url.match(/^\/api\/tenant\/qrcodes\/([^\/]+)$/)
        if (url === '/api/tenant/auth/session') data = { tenant: { name: 'Evento', role: 'admin' } }
        else if (url === '/api/tenant/dashboard') data = { salas: [{ id: '1', nome: 'Sala aberta', aberta: true, quantidade: 2 }] }
        else if (url === '/api/tenant/rooms') data = { salas }
        else if (url === '/api/tenant/qrcodes' && method === 'GET') data = qrcodes
        else if (url === '/api/tenant/qrcodes' && method === 'POST') data = { qrcode: { id: 'qr-criado-1', qrCodeDataUri: 'data:image/png;base64,abc' } }
        else if (qrPatch && method === 'PATCH') data = { qrcode: { id: qrPatch[1], qrCodeDataUri: 'data:image/png;base64,abc' } }
        else if (url.match(/^\/api\/tenant\/qrcodes\/[^\/]+\/visual$/) && method === 'GET') data = { qrcode: { qrCodeDataUri: 'data:image/png;base64,abc' } }
        else if (url === '/api/tenant/biometrics/profiles') data = { pessoas: [] }
        else throw new Error(`URL inesperada: ${url} ${method}`)
        return { ok: true, status: 200, json: async () => data }
    })
    const console = { error: jest.fn() }
    runInNewContext(script, {
        document, fetch, console, confirm, URLSearchParams,
        window: { setInterval: jest.fn(), location: {} },
    })
    document.addEventListener.mock.calls.find(([evento]) => evento === 'DOMContentLoaded')[1]()
    await new Promise(resolve => setImmediate(resolve))
    return { document, fetch, console, confirm }
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

test('QR com status active exibe "Em uso" e o roomName', async () => {
    const { document } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-ativo-1',
                status: 'active',
                roomId: '1',
                roomName: 'Sala aberta',
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 1,
        },
    })

    const itens = document.getElementById('listaQrCodes').children
    expect(itens.length).toBe(1)

    const item = itens[0]
    const header = item.children[0]
    expect(header.children[0].textContent).toBe('QR TIVO-1')
    expect(header.children[1].textContent).toBe('Em uso')
    expect(item.children[1].textContent).toBe('Sala: Sala aberta')
})

test('QR com status available exibe "Disponível" e seletor de salas', async () => {
    const { document } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-disp-1',
                status: 'available',
                roomId: null,
                roomName: null,
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 1,
        },
    })

    const itens = document.getElementById('listaQrCodes').children
    expect(itens.length).toBe(1)

    const item = itens[0]
    const header = item.children[0]
    expect(header.children[0].textContent).toBe('QR DISP-1')
    expect(header.children[1].textContent).toBe('Disponível')
    expect(item.children[1].textContent).toBe('Sala: ainda não associado')

    const actions = item.children[3]
    const select = actions.children[0]
    const btnAssociar = actions.children[1]
    expect(select.tagName || select.className).toContain('qr-room-select')
    expect(btnAssociar.textContent).toBe('Associar à sala')
})

test('QR com status revoked nao e renderizado', async () => {
    const { document } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-revogado-1',
                status: 'revoked',
                roomId: null,
                roomName: null,
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 0,
        },
    })

    const itens = document.getElementById('listaQrCodes').children
    expect(itens.length).toBe(0)
    expect(document.getElementById('qrsVazio').hidden).toBe(false)
})

test('clicar em "Associar à sala" envia PATCH com roomId', async () => {
    const { document, fetch } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-assoc-1',
                status: 'available',
                roomId: null,
                roomName: null,
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 1,
        },
    })

    const item = document.getElementById('listaQrCodes').children[0]
    const actions = item.children[3]
    const select = actions.children[0]
    select.value = '1'
    const btnAssociar = actions.children[1]

    await btnAssociar.listeners.click()

    expect(fetch).toHaveBeenCalledWith('/api/tenant/qrcodes/qr-assoc-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ roomId: '1' }),
    }))
})

test('quando existe QR available, clicar em "QR Code" da sala reutiliza sem POST', async () => {
    const { document, fetch } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-reuse-1',
                status: 'available',
                roomId: null,
                roomName: null,
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 1,
        },
    })

    const btnQrSala = document.getElementById('listaSalas').children[0].children[1].children[0]
    await btnQrSala.listeners.click()

    const postCalls = fetch.mock.calls.filter(([url, options]) =>
        url === '/api/tenant/qrcodes' && (options && options.method === 'POST')
    )
    expect(postCalls.length).toBe(0)

    const patchCalls = fetch.mock.calls.filter(([url, options]) =>
        url === '/api/tenant/qrcodes/qr-reuse-1' && (options && options.method === 'PATCH')
    )
    expect(patchCalls.length).toBe(1)
    expect(patchCalls[0][1].body).toBe(JSON.stringify({ roomId: '1' }))
})

test('quando nao existe QR available, clicar em "QR Code" da sala cria novo', async () => {
    const { document, fetch } = await iniciarPainel({
        qrcodes: {
            qrcodes: [],
            limite: 10,
            quantidadeAtiva: 0,
        },
    })

    const btnQrSala = document.getElementById('listaSalas').children[0].children[1].children[0]
    await btnQrSala.listeners.click()

    const postCalls = fetch.mock.calls.filter(([url, options]) =>
        url === '/api/tenant/qrcodes' && (options && options.method === 'POST')
    )
    expect(postCalls.length).toBeGreaterThan(0)
})

test('clicar em "Liberar" envia roomId null', async () => {
    const { document, fetch, confirm } = await iniciarPainel({
        qrcodes: {
            qrcodes: [{
                id: 'qr-liberar-1',
                status: 'active',
                roomId: '1',
                roomName: 'Sala aberta',
                criadaEm: '2026-01-01T10:00:00Z',
                atualizadaEm: null,
            }],
            limite: 10,
            quantidadeAtiva: 1,
        },
    })

    const item = document.getElementById('listaQrCodes').children[0]
    const actions = item.children[3]
    const btnLiberar = actions.children[1]

    await btnLiberar.listeners.click()

    expect(confirm).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith('/api/tenant/qrcodes/qr-liberar-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ roomId: null }),
    }))
})

test('resumo respeita limite e quantidadeAtiva', async () => {
    const { document } = await iniciarPainel({
        qrcodes: {
            qrcodes: [],
            limite: 5,
            quantidadeAtiva: 3,
        },
    })

    expect(document.getElementById('resumoQrs').textContent).toBe('3 de 5 QR Code(s) em uso ou disponíveis.')
})

test('criar QR disponível mantém a imagem e o download visíveis', async () => {
    const { document } = await iniciarPainel({
        qrcodes: {
            qrcodes: [],
            limite: 10,
            quantidadeAtiva: 0,
        },
    })

    await document.getElementById('btnCriarQrDisponivel').listeners.click()

    const status = document.getElementById('status')
    expect(status.children.some(elemento => elemento.src === 'data:image/png;base64,abc')).toBe(true)
    expect(status.children.some(elemento => elemento.download === 'qrcode_disponivel_qr-criado-1.png')).toBe(true)
    expect(status.children.some(elemento =>
        elemento.textContent === 'QR Code criado e disponível para associação.'
    )).toBe(true)
})
