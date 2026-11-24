import { jest } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const script = readFileSync(new URL('../public/admFaceMonitor.js', import.meta.url), 'utf8')
const token = 'A'.repeat(43)
const roomId = '65f1a0000000000000000001'
const periodoId = '65f1a0000000000000000002'

async function criarMonitor() {
    const elementos = new Map()
    let salaAberta = false
    let periodoAtual = periodoId
    let timeout
    const elemento = () => ({
        options: [], dataset: {}, value: '', hidden: false, disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener() {}, removeAttribute() {}, focus() {},
        replaceChildren(...items) { this.options = items },
        add(item) { this.options.push(item) },
    })
    const document = {
        body: elemento(),
        getElementById(id) {
            if (!elementos.has(id)) elementos.set(id, elemento())
            return elementos.get(id)
        },
    }
    const fetch = jest.fn(async url => {
        if (url === '/api/tenant/rooms') {
            return { ok: true, json: async () => ({ sucesso: true, salas: salaAberta ? [{ id: roomId, nome: 'Sala', status: 'open' }] : [] }) }
        }
        if (url === '/api/tenant/classes/start-from-qr') {
            salaAberta = true
            return { ok: true, json: async () => ({ sucesso: true, sala: { id: roomId, nome: 'Sala' }, periodoId }) }
        }
        if (url === '/api/checkin/tenant/resolve') {
            return { ok: true, json: async () => ({ sucesso: true, sala: { id: roomId, nome: 'Sala' } }) }
        }
        if (url.includes('/biometrics/monitor/')) {
            return { ok: true, json: async () => ({ sucesso: true, periodoId: periodoAtual }) }
        }
        throw new Error(`URL inesperada: ${url}`)
    })
    const FaceRecognition = {
        monitorarDescritoresFaciais: jest.fn((video, callback, status, feedback, signal) =>
            new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('parado'), { name: 'AbortError' })))
            })),
        mensagemErroFacial: error => error.message,
    }
    const context = {
        document, fetch, FaceRecognition, AbortController, URL, URLSearchParams, encodeURIComponent,
        window: { location: { origin: 'https://example.test', search: '' } },
        Option: function Option(text, value) { this.text = text; this.value = value },
        setTimeout: callback => { timeout = callback; return 1 },
        clearTimeout() {},
    }
    runInNewContext(`${script}\nglobalThis.testarQr = validarQrESelecionarSala; globalThis.iniciar = iniciarMonitoramentoFacial;`, context)
    await new Promise(resolve => setImmediate(resolve))
    return {
        context, document, fetch, FaceRecognition,
        mudarPeriodo: valor => { periodoAtual = valor },
        executarTimeout: () => timeout(),
    }
}

test('lê QR de aula no formato /add e atualiza lista de salas abertas', async () => {
    const { context, document, fetch } = await criarMonitor()
    document.getElementById('monitorConsent').checked = true
    const resultado = await context.testarQr(`https://example.test/add#class-start=${token}`)
    expect(resultado.tipo).toBe('class-start')
    expect(resultado.periodoId).toBe(periodoId)
    expect(document.getElementById('monitorSala').value).toBe(roomId)
    expect(fetch).toHaveBeenCalledWith('/api/tenant/classes/start-from-qr', expect.objectContaining({
        body: JSON.stringify({ token }),
    }))
    const checkin = await context.testarQr(`https://example.test/add#${token}`)
    expect(checkin.tipo).toBe('checkin')
})

test('não consome o QR sem confirmação de consentimento', async () => {
    const { context, fetch } = await criarMonitor()
    await expect(context.testarQr(`https://example.test/add#class-start=${token}`))
        .rejects.toThrow('consentimento')
    expect(fetch).not.toHaveBeenCalledWith('/api/tenant/classes/start-from-qr', expect.anything())
})

test('para a captura quando o período da sala muda', async () => {
    const monitor = await criarMonitor()
    const execucao = monitor.context.iniciar(roomId, periodoId)
    await new Promise(resolve => setImmediate(resolve))
    expect(monitor.FaceRecognition.monitorarDescritoresFaciais).toHaveBeenCalled()
    monitor.mudarPeriodo('outro-periodo')
    await monitor.executarTimeout()
    await execucao
    expect(monitor.document.getElementById('monitorStatus').textContent).toContain('período')
    expect(monitor.document.getElementById('monitorCameraStage').hidden).toBe(true)
})

test('informa falha de câmera depois da abertura sem dizer que a sala foi fechada', async () => {
    const monitor = await criarMonitor()
    monitor.FaceRecognition.monitorarDescritoresFaciais.mockRejectedValue(new Error('Câmera indisponível'))
    await monitor.context.iniciar(roomId, periodoId)
    expect(monitor.document.getElementById('monitorStatus').textContent).toBe('Câmera indisponível')
    expect(monitor.document.getElementById('statusQrSala').textContent).toContain('pode continuar aberta')
    expect(monitor.document.getElementById('monitorStart').disabled).toBe(false)
})
