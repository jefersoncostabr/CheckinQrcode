document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-aula')
    const nomeInput = document.getElementById('nome-aula')
    const inicioInput = document.getElementById('inicio-aula')
    const fimInput = document.getElementById('fim-aula')
    const salaSelect = document.getElementById('sala-aula')
    const selecao = document.getElementById('selecao-aula')
    const estado = document.getElementById('estado-sala')
    const mensagem = document.getElementById('mensagem')
    const iniciar = document.getElementById('iniciar-aula')
    const gerarQr = document.getElementById('gerar-qr')
    const encerrar = document.getElementById('encerrar-aula')
    const areaQr = document.getElementById('area-qr')
    const imagemQr = document.getElementById('imagem-qr')
    const prazoQr = document.getElementById('prazo-qr')

    let salas = []
    let aulas = []
    let timerQr = null
    let consultandoQr = false
    let processando = false
    const btnSubmit = form.querySelector('button[type="submit"]')

    function atualizarFimAutomatico() {
        if (!inicioInput.value || fimInput.dataset.editado === 'true') return
        const [hora, minuto] = inicioInput.value.split(':').map(Number)
        const totalMinutos = (hora * 60 + minuto + 60) % (24 * 60)
        fimInput.value = `${String(Math.floor(totalMinutos / 60)).padStart(2, '0')}:${String(totalMinutos % 60).padStart(2, '0')}`
    }

    function setMensagem(texto, erro = false) {
        mensagem.textContent = texto
        mensagem.role = erro ? 'alert' : 'status'
    }

    function setCarregando(elemento, carregando) {
        if (carregando) {
            elemento.disabled = true
            elemento.dataset.textoOriginal = elemento.textContent
            elemento.textContent = 'Processando...'
        } else {
            if (elemento.dataset.textoOriginal) {
                elemento.textContent = elemento.dataset.textoOriginal
                delete elemento.dataset.textoOriginal
            }
        }
        processando = carregando
        btnSubmit.disabled = carregando
        selecao.disabled = carregando
        salaSelect.disabled = carregando
        atualizarEstadoSelecao()
    }

    async function carregarSalas() {
        try {
            const response = await fetch('/api/tenant/rooms', { cache: 'no-store' })
            if (!response.ok) throw new Error(`Erro ao carregar salas (${response.status}).`)
            const data = await response.json()
            if (!data.sucesso || !Array.isArray(data.salas)) throw new Error('Lista de salas inválida.')

            salas = data.salas
            salaSelect.replaceChildren()
            const placeholder = document.createElement('option')
            placeholder.value = ''
            placeholder.textContent = 'Selecione uma sala'
            salaSelect.appendChild(placeholder)

            for (const sala of salas) {
                const opcao = document.createElement('option')
                opcao.value = sala.id
                opcao.textContent = sala.nome
                salaSelect.appendChild(opcao)
            }

            await carregarAulas()
        } catch (error) {
            setMensagem(error.message || 'Não foi possível carregar as salas.', true)
        }
    }

    async function carregarAulas() {
        const response = await fetch('/api/tenant/classes', { cache: 'no-store' })
        if (!response.ok) throw new Error(`Erro ao carregar aulas (${response.status}).`)
        const data = await response.json()
        if (!data.sucesso || !Array.isArray(data.aulas)) throw new Error('Lista de aulas inválida.')

        aulas = data.aulas
        atualizarSelecao()
    }

    function atualizarSelecao() {
        const valorAnterior = selecao.value
        selecao.replaceChildren()

        aulas.forEach(aula => {
            const opcao = document.createElement('option')
            opcao.value = String(aula.id)
            const periodoInfo = aula.periodoId ? ' · período aberto' : ''
            const horario = aula.startTime && aula.endTime
                ? ` · ${aula.startTime}–${aula.endTime}`
                : ''
            opcao.textContent = `${aula.name}${horario}${periodoInfo}`
            selecao.appendChild(opcao)
        })

        if (aulas.some(aula => String(aula.id) === valorAnterior)) selecao.value = valorAnterior

        atualizarEstadoSelecao()
    }

    function atualizarEstadoSelecao() {
        const aula = aulas.find(item => String(item.id) === selecao.value)
        const ativa = aula && Boolean(aula.periodoId)
        const sala = salas.find(item => String(item.id) === salaSelect.value)
        const salaDisponivel = sala && sala.status === 'closed'

        iniciar.disabled = processando || ativa || !salaDisponivel
        gerarQr.disabled = processando || ativa || !salaDisponivel
        encerrar.disabled = processando || !ativa

        if (aula) {
            estado.textContent = ativa
                ? `Sala aberta para ${aula.name}${aula.roomName ? ` em ${aula.roomName}` : ''}.`
                : sala?.status === 'open'
                    ? 'A sala selecionada já está aberta para outra atividade.'
                    : salaDisponivel ? 'Aula sem sala aberta.' : 'Selecione uma sala fechada.'
        } else {
            estado.textContent = 'Selecione uma aula.'
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault()

        const nome = nomeInput.value.trim()
        const startTime = inicioInput.value
        const endTime = fimInput.value

        if (!nome || !startTime || !endTime) {
            setMensagem('Informe o nome da aula e os horários de início e fim.', true)
            return
        }
        if (endTime === startTime) {
            setMensagem('O horário de fim deve ser posterior ao início.', true)
            return
        }

        setCarregando(btnSubmit, true)
        setMensagem('')

        try {
            const response = await fetch('/api/tenant/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nome, startTime, endTime }),
            })
            const data = await response.json()
            if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Erro ao cadastrar aula.')

            form.reset()
            fimInput.dataset.editado = 'false'
            atualizarFimAutomatico()
            await carregarAulas()
            setMensagem('Aula cadastrada com sucesso.')
        } catch (error) {
            setMensagem(error.message || 'Erro ao cadastrar aula.', true)
        } finally {
            setCarregando(btnSubmit, false)
        }
    })

    selecao.addEventListener('change', () => {
        setMensagem('')
        areaQr.hidden = true
        pararTimerQr()
        atualizarEstadoSelecao()
    })

    inicioInput.addEventListener('input', atualizarFimAutomatico)
    fimInput.addEventListener('input', () => {
        fimInput.dataset.editado = 'true'
    })
    salaSelect.addEventListener('change', atualizarEstadoSelecao)

    async function iniciarAula() {
        const aula = aulas.find(item => String(item.id) === selecao.value)
        const roomId = salaSelect.value
        if (!aula || !roomId) {
            setMensagem('Selecione uma aula e uma sala para iniciar.', true)
            return
        }

        setCarregando(iniciar, true)
        setMensagem('')

        try {
            const response = await fetch(`/api/tenant/classes/${aula.id}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId }),
            })
            const data = await response.json()
            if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Erro ao iniciar aula.')

            areaQr.hidden = true
            pararTimerQr()
            await carregarAulas()
            setMensagem('Aula iniciada. Sala aberta para check-in.')
        } catch (error) {
            setMensagem(error.message || 'Erro ao iniciar aula.', true)
        } finally {
            setCarregando(iniciar, false)
        }
    }

    async function gerarQrInicio() {
        const aula = aulas.find(item => String(item.id) === selecao.value)
        const roomId = salaSelect.value
        if (!aula || !roomId) {
            setMensagem('Selecione uma aula e uma sala para gerar o QR.', true)
            return
        }

        setCarregando(gerarQr, true)
        setMensagem('')
        areaQr.hidden = true
        pararTimerQr()

        try {
            const response = await fetch(`/api/tenant/classes/${aula.id}/start-qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId }),
            })
            const data = await response.json()
            if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Erro ao gerar QR.')

            imagemQr.src = data.qrCodeDataUri
            const expira = new Date(data.expiresAt)
            prazoQr.textContent = `Validade: ${expira.toLocaleTimeString('pt-BR')} (2 minutos).`
            areaQr.hidden = false

            iniciarTimerQr(data.expiresAt, aula.id)
            setMensagem('QR Code gerado. Leia-o no monitor facial da sala.')
        } catch (error) {
            setMensagem(error.message || 'Erro ao gerar QR.', true)
        } finally {
            setCarregando(gerarQr, false)
        }
    }

    async function encerrarAula() {
        const aula = aulas.find(item => String(item.id) === selecao.value)
        if (!aula) {
            setMensagem('Selecione uma aula para encerrar.', true)
            return
        }

        if (!window.confirm('Encerrar o período desta aula?')) return

        setCarregando(encerrar, true)
        setMensagem('')

        try {
            const response = await fetch(`/api/tenant/classes/${aula.id}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await response.json()
            if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Erro ao encerrar aula.')

            await carregarAulas()
            setMensagem('Aula encerrada. Sala fechada.')
        } catch (error) {
            setMensagem(error.message || 'Erro ao encerrar aula.', true)
        } finally {
            setCarregando(encerrar, false)
        }
    }

    iniciar.addEventListener('click', iniciarAula)
    gerarQr.addEventListener('click', gerarQrInicio)
    encerrar.addEventListener('click', encerrarAula)

    function iniciarTimerQr(expiresAt, aulaId) {
        pararTimerQr()
        timerQr = setInterval(async () => {
            if (consultandoQr) return
            const agora = new Date()
            if (agora >= new Date(expiresAt)) {
                pararTimerQr()
                if (!areaQr.hidden) areaQr.hidden = true
                setMensagem('QR Code expirado. Gere outro para iniciar a aula.')
                return
            }
            consultandoQr = true
            try {
                await carregarAulas()
                if (areaQr.hidden || selecao.value !== String(aulaId)) return
                const aula = aulas.find(item => item.id === aulaId)
                if (aula && aula.periodoId) {
                    pararTimerQr()
                    if (!areaQr.hidden) areaQr.hidden = true
                    setMensagem('A sala foi aberta pelo monitor facial.')
                }
            } catch (error) {
                pararTimerQr()
                areaQr.hidden = true
                setMensagem(error.message || 'Não foi possível atualizar o estado da aula.', true)
            } finally {
                consultandoQr = false
            }
        }, 5000)
    }

    function pararTimerQr() {
        if (timerQr) {
            clearInterval(timerQr)
            timerQr = null
        }
    }

    window.addEventListener('beforeunload', pararTimerQr)

    atualizarFimAutomatico()
    carregarSalas()
    atualizarEstadoSelecao()
})
