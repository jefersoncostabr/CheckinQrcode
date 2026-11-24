import { jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const script = readFileSync(new URL('../public/professor.js', import.meta.url), 'utf8')

function criarElemento() {
    return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {} },
        children: [],
        listeners: {},
        options: [],
        value: '',
        selectedIndex: 0,
        addEventListener(evento, callback) { this.listeners[evento] = callback },
        appendChild(elemento) { this.children.push(elemento) },
        append(...elementos) { this.children.push(...elementos) },
        replaceChildren(...elementos) { this.children = elementos },
        setAttribute() {},
        reset() { this.value = ''; this.children = [] },
        querySelector() { return this },
        set innerHTML(valor) { if (valor === '') this.children = [] },
        scrollIntoView() {},
    }
}

async function iniciarTela({ salas = [], aulas = [] } = {}) {
    const elementos = new Map()
    const fetchCalls = []
    let timerCallback
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
    const window = {
        location: {},
        confirm,
        addEventListener: jest.fn(),
    }
    const fetch = jest.fn(async (url, options = {}) => {
        fetchCalls.push({ url, options })
        const method = (options && options.method) || 'GET'
        if (url === '/api/tenant/rooms' && method === 'GET') {
            return { ok: true, status: 200, json: async () => ({ sucesso: true, salas }) }
        }
        if (url === '/api/tenant/classes' && method === 'GET') {
            return { ok: true, status: 200, json: async () => ({ sucesso: true, aulas }) }
        }
        if (url === '/api/tenant/classes' && method === 'POST') {
            const body = options && options.body ? JSON.parse(options.body) : {}
            const nova = {
                id: 'aula-nova',
                name: body.name,
                startTime: body.startTime,
                endTime: body.endTime,
                roomId: null,
                status: 'closed',
                periodoId: null,
            }
            return { ok: true, status: 201, json: async () => ({ sucesso: true, aula: nova }) }
        }
        if (url.match(/^\/api\/tenant\/classes\/[^\/]+\/start$/) && method === 'POST') {
            return { ok: true, status: 200, json: async () => ({ sucesso: true, aula: { id: 'aula-1', name: 'Matemática' }, sala: { id: 'sala-1', nome: 'Sala 1', status: 'open' }, periodoId: 'periodo-1' }) }
        }
        if (url.match(/^\/api\/tenant\/classes\/[^\/]+\/close$/) && method === 'POST') {
            return { ok: true, status: 200, json: async () => ({ sucesso: true, aula: { id: 'aula-1', name: 'Matemática' }, sala: { id: 'sala-1', nome: 'Sala 1', status: 'closed' }, periodoId: 'periodo-1' }) }
        }
        if (url.match(/^\/api\/tenant\/classes\/[^\/]+\/start-qr$/) && method === 'POST') {
            const expira = new Date(Date.now() + 2 * 60 * 1000).toISOString()
            return { ok: true, status: 201, json: async () => ({ sucesso: true, qrCodeDataUri: 'data:image/png;base64,abc', expiresAt: expira }) }
        }
        if (url === '/api/tenant/classes/start-from-qr' && method === 'POST') {
            return { ok: true, status: 200, json: async () => ({ sucesso: true, aula: { id: 'aula-1', name: 'Matemática' }, sala: { id: 'sala-1', nome: 'Sala 1', status: 'open' }, periodoId: 'periodo-1' }) }
        }
        throw new Error(`URL inesperada: ${url} ${method}`)
    })
    const console = { error: jest.fn() }

    runInNewContext(script, {
        document,
        fetch,
        console,
        confirm,
        window,
        URLSearchParams,
        setInterval: callback => { timerCallback = callback; return 1 },
        clearInterval: () => { timerCallback = undefined },
    })

    document.addEventListener.mock.calls.find(([evento]) => evento === 'DOMContentLoaded')[1]()
    await new Promise(resolve => setImmediate(resolve))

    return { document, fetch, console, confirm, elementos, fetchCalls, executarTimer: () => timerCallback() }
}

describe('página do professor (API real)', () => {
    it('carrega salas e aulas vazias inicialmente', async () => {
        const { document } = await iniciarTela({ salas: [], aulas: [] })
        const selecao = document.getElementById('selecao-aula')
        expect(selecao.children.length).toBe(0)
        expect(document.getElementById('estado-sala').textContent).toBe('Selecione uma aula.')
    })

    it('renderiza aulas e horários carregados do servidor', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'closed' }]
        const aulas = [{
            id: 'aula-1',
            name: 'Matemática',
            startTime: '08:00',
            endTime: '09:00',
            roomId: null,
            roomName: null,
            status: 'closed',
            periodoId: null,
        }]
        const { document } = await iniciarTela({ salas, aulas })
        const selecao = document.getElementById('selecao-aula')
        expect(selecao.children.length).toBe(1)
        expect(selecao.children[0].textContent).toContain('Matemática · 08:00–09:00')
    })

    it('cadastra aula pela API', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'closed' }]
        const { document, fetch } = await iniciarTela({ salas, aulas: [] })

        document.getElementById('nome-aula').value = 'História'
        document.getElementById('inicio-aula').value = '09:00'
        document.getElementById('fim-aula').value = '10:00'

        await document.getElementById('form-aula').listeners.submit({ preventDefault: jest.fn() })

        const postClasses = fetch.mock.calls.find(([url, options]) => url === '/api/tenant/classes' && options?.method === 'POST')
        expect(postClasses).toBeTruthy()
        const body = JSON.parse(postClasses[1].body)
        expect(body.name).toBe('História')
        expect(body).not.toHaveProperty('group')
        expect(body).not.toHaveProperty('roomId')
        expect(body.startTime).toBe('09:00')
        expect(body.endTime).toBe('10:00')
    })

    it('inicia aula pela API', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'closed' }]
        const aulas = [{
            id: 'aula-1', name: 'Matemática',
            startTime: '09:00', endTime: '10:00', roomId: 'sala-1', roomName: 'Sala 1', status: 'open', periodoId: 'periodo-1',
        }]
        const { document, fetch } = await iniciarTela({ salas, aulas })

        document.getElementById('selecao-aula').value = 'aula-1'
        document.getElementById('sala-aula').value = 'sala-1'
        await document.getElementById('iniciar-aula').listeners.click()

        const startCall = fetch.mock.calls.find(([url]) => url === '/api/tenant/classes/aula-1/start')
        expect(startCall).toBeTruthy()
        expect(JSON.parse(startCall[1].body)).toEqual({ roomId: 'sala-1' })
        expect(document.getElementById('estado-sala').textContent).toBe('Sala aberta para Matemática em Sala 1.')
    })

    it('encerra aula com confirmação', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'open' }]
        const aulas = [{
            id: 'aula-1', name: 'Matemática',
            startTime: '09:00', endTime: '10:00', roomId: 'sala-1', roomName: 'Sala 1', status: 'open', periodoId: 'periodo-1',
        }]
        const { document, fetch, confirm } = await iniciarTela({ salas, aulas })

        document.getElementById('selecao-aula').value = 'aula-1'
        await document.getElementById('encerrar-aula').listeners.click()

        expect(confirm).toHaveBeenCalled()
        const closeCall = fetch.mock.calls.find(([url]) => url === '/api/tenant/classes/aula-1/close')
        expect(closeCall).toBeTruthy()
    })

    it('cancela encerramento sem confirmação', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'open' }]
        const aulas = [{
            id: 'aula-1', name: 'Matemática',
            startTime: '09:00', endTime: '10:00', roomId: 'sala-1', roomName: 'Sala 1', status: 'open', periodoId: 'periodo-1',
        }]
        const { document, fetch, confirm } = await iniciarTela({ salas, aulas })

        document.getElementById('selecao-aula').value = 'aula-1'
        confirm.mockReturnValueOnce(false)
        await document.getElementById('encerrar-aula').listeners.click()

        const closeCalls = fetch.mock.calls.filter(([url]) => url.includes('/close'))
        expect(closeCalls).toHaveLength(0)
    })

    it('gera QR de início pela API', async () => {
        const salas = [{ id: 'sala-1', nome: 'Sala 1', status: 'closed' }]
        const aulas = [{
            id: 'aula-1', name: 'Matemática',
            startTime: '09:00', endTime: '10:00', roomId: null, roomName: null, status: 'closed', periodoId: null,
        }]
        const { document, fetch } = await iniciarTela({ salas, aulas })

        document.getElementById('selecao-aula').value = 'aula-1'
        document.getElementById('sala-aula').value = 'sala-1'
        await document.getElementById('gerar-qr').listeners.click()

        const qrCall = fetch.mock.calls.find(([url]) => url === '/api/tenant/classes/aula-1/start-qr')
        expect(qrCall).toBeTruthy()
        expect(JSON.parse(qrCall[1].body)).toEqual({ roomId: 'sala-1' })
        expect(document.getElementById('area-qr').hidden).toBe(false)
        expect(document.getElementById('imagem-qr').src).toBe('data:image/png;base64,abc')
    })

    it('consulta o servidor após exibir QR e preserva a aula selecionada', async () => {
        const aulas = [
            { id: 'aula-1', name: 'Matemática', startTime: '08:00', endTime: '09:00', roomName: null, status: 'closed', periodoId: null },
            { id: 'aula-2', name: 'História', startTime: '09:00', endTime: '10:00', roomName: null, status: 'closed', periodoId: null },
        ]
        const { document, executarTimer } = await iniciarTela({
            salas: [{ id: 'sala-1', nome: 'Sala 1', status: 'closed' }],
            aulas,
        })
        const selecao = document.getElementById('selecao-aula')
        selecao.value = 'aula-2'
        document.getElementById('sala-aula').value = 'sala-1'
        await document.getElementById('gerar-qr').listeners.click()
        aulas[1].periodoId = 'periodo-2'
        aulas[1].status = 'open'
        await executarTimer()
        expect(selecao.value).toBe('aula-2')
        expect(document.getElementById('area-qr').hidden).toBe(true)
        expect(document.getElementById('estado-sala').textContent).toContain('História')
        expect(document.getElementById('iniciar-aula').disabled).toBe(true)
        expect(document.getElementById('encerrar-aula').disabled).toBe(false)
    })

    it('preenche o fim com uma hora e permite editar o horário sugerido', async () => {
        const { document } = await iniciarTela()
        const inicio = document.getElementById('inicio-aula')
        const fim = document.getElementById('fim-aula')
        inicio.value = '09:30'
        inicio.listeners.input()
        expect(fim.value).toBe('10:30')
        fim.value = '11:15'
        fim.listeners.input()
        inicio.value = '10:00'
        inicio.listeners.input()
        expect(fim.value).toBe('11:15')
    })
})
