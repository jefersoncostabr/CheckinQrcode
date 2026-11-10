const salaSelect = document.getElementById('monitorSala');
const consentimento = document.getElementById('monitorConsent');
const botaoIniciar = document.getElementById('monitorStart');
const botaoParar = document.getElementById('monitorStop');
const statusMonitor = document.getElementById('monitorStatus');
const videoMonitor = document.getElementById('monitorVideo');

let controladorMonitor;

async function carregarSalasAbertas() {
    try {
        const response = await fetch('/api/salas');
        if (!response.ok) {
            throw new Error(`Erro ao carregar salas (${response.status}).`);
        }

        const data = await response.json();
        if (!data.sucesso || !Array.isArray(data.salas)) {
            throw new Error('A resposta do servidor não contém a lista de salas.');
        }

        const salasAbertas = data.salas.filter(sala => sala.aberta);
        salaSelect.replaceChildren(new Option('Selecione uma sala aberta', ''));

        for (const sala of salasAbertas) {
            salaSelect.add(new Option(`${sala.id} - ${sala.nome}`, sala.id));
        }

        if (salasAbertas.length === 0) {
            statusMonitor.textContent = 'Não há salas abertas para check-in.';
            botaoIniciar.disabled = true;
            return;
        }

        statusMonitor.textContent = 'Selecione uma sala e confirme que as pessoas foram informadas.';
        botaoIniciar.disabled = false;
    } catch (error) {
        statusMonitor.textContent = error.message || 'Não foi possível carregar as salas.';
        botaoIniciar.disabled = true;
    }
}

botaoIniciar.addEventListener('click', async () => {
    if (!consentimento.checked) {
        statusMonitor.textContent = 'Confirme que as pessoas foram informadas e consentiram.';
        return;
    }

    const salaId = Number(salaSelect.value);
    if (!Number.isInteger(salaId) || salaId <= 0) {
        statusMonitor.textContent = 'Selecione uma sala aberta.';
        return;
    }

    controladorMonitor = new AbortController();
    botaoIniciar.disabled = true;
    botaoParar.disabled = false;
    salaSelect.disabled = true;
    consentimento.disabled = true;

    try {
        await FaceRecognition.monitorarDescritoresFaciais(
            videoMonitor,
            async descritor => {
                statusMonitor.textContent = 'Rosto alinhado. Verificando cadastro e registrando presença...';

                try {
                    const response = await fetch('/api/face/checkin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ descritor, salaId }),
                    });
                    const data = await response.json();

                    if (!response.ok || !data.sucesso) {
                        throw new Error(data.mensagem || 'Não foi possível registrar a presença.');
                    }

                    statusMonitor.textContent =
                        `Presença registrada para ${data.nome} na sala selecionada.`;
                } catch (error) {
                    statusMonitor.textContent =
                        error.message || 'Falha ao verificar o rosto ou registrar presença.';
                }
            },
            mensagem => {
                statusMonitor.textContent = mensagem;
            },
            controladorMonitor.signal,
        );
    } catch (error) {
        if (error.name !== 'AbortError') {
            statusMonitor.textContent = FaceRecognition.mensagemErroFacial(error);
        }
    } finally {
        controladorMonitor = undefined;
        botaoIniciar.disabled = false;
        botaoParar.disabled = true;
        salaSelect.disabled = false;
        consentimento.disabled = false;
        videoMonitor.hidden = true;

        if (statusMonitor.textContent !== 'Monitoramento parado.') {
            statusMonitor.textContent = 'Monitoramento encerrado.';
        }
    }
});

botaoParar.addEventListener('click', () => {
    controladorMonitor?.abort();
    statusMonitor.textContent = 'Parando a câmera...';
});

carregarSalasAbertas();
