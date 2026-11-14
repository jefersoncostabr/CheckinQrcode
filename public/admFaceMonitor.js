const salaSelect = document.getElementById('monitorSala');
const consentimento = document.getElementById('monitorConsent');
const painelMonitor = document.getElementById('monitorPanel');
const botaoIniciar = document.getElementById('monitorStart');
const botaoParar = document.getElementById('monitorStop');
const statusMonitor = document.getElementById('monitorStatus');
const cameraStage = document.getElementById('monitorCameraStage');
const videoMonitor = document.getElementById('monitorVideo');

const botaoLerQr = document.getElementById('lerQrSala');
const botaoPararLeituraQr = document.getElementById('pararLeituraQr');
const videoQrSala = document.getElementById('videoQrSala');
const cameraStageQr = document.getElementById('qrCameraStage');
const statusQrSala = document.getElementById('statusQrSala');

let controladorMonitor;
let controlesLeitorQr;
let leitorQrAtivo = false;
let qrEmProcessamento = false;

function atualizarFeedback(state, message) {
    painelMonitor.dataset.captureState = state;
    statusMonitor.textContent = message;
}

async function carregarSalasAbertas() {
    try {
        const response = await fetch('/api/tenant/rooms');
        if (!response.ok) {
            throw new Error(`Erro ao carregar salas (${response.status}).`);
        }

        const data = await response.json();
        if (!data.sucesso || !Array.isArray(data.salas)) {
            throw new Error('A resposta do servidor não contém a lista de salas.');
        }

        const salasAbertas = data.salas.filter(sala => sala.status === 'open');
        salaSelect.replaceChildren(new Option('Selecione uma sala aberta', ''));

        for (const sala of salasAbertas) {
            salaSelect.add(new Option(sala.nome, sala.id));
        }

        if (salasAbertas.length === 0) {
            statusMonitor.textContent = 'Não há salas abertas para check-in.';
            botaoIniciar.disabled = true;
            return;
        }

        const salaSolicitada = new URLSearchParams(window.location.search).get('roomId');

        if (salaSolicitada !== null) {
            const salaAberta = salasAbertas.find(sala => String(sala.id) === salaSolicitada);

            if (!salaAberta) {
                statusMonitor.textContent = 'A sala solicitada não está aberta ou não está disponível. Selecione outra sala aberta.';
                botaoIniciar.disabled = false;
                return;
            }

            salaSelect.value = String(salaAberta.id);
            statusMonitor.textContent = 'Sala selecionada. Confirme que as pessoas foram informadas.';
            botaoIniciar.disabled = false;
            return;
        }

        statusMonitor.textContent = 'Selecione uma sala e confirme que as pessoas foram informadas.';
        botaoIniciar.disabled = false;
    } catch (error) {
        statusMonitor.textContent = error.message || 'Não foi possível carregar as salas.';
        botaoIniciar.disabled = true;
    }
}

function pararLeituraQr() {
    leitorQrAtivo = false;
    controlesLeitorQr?.stop();
    controlesLeitorQr = undefined;

    const stream = videoQrSala.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    videoQrSala.srcObject = null;
    cameraStageQr.hidden = true;
    painelMonitor.classList.remove('qr-capture-active');
    document.body.classList.remove('monitoring-active');
    botaoLerQr.disabled = false;
    botaoPararLeituraQr.hidden = true;
}

async function validarQrESelecionarSala(textoQr) {
    let urlQr;

    try {
        urlQr = new URL(textoQr, window.location.origin);
    } catch {
        throw new Error('O conteúdo lido não é um endereço de QR Code válido.');
    }

    if (!['http:', 'https:'].includes(urlQr.protocol) || urlQr.pathname !== '/add') {
        throw new Error('Este QR Code não é um QR de sala do sistema.');
    }

    const token = new URLSearchParams(urlQr.hash.slice(1)).get('token') || urlQr.hash.slice(1)
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new Error('O QR Code não contém um token de sala válido.');
    }

    const response = await fetch('/api/checkin/tenant/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
    })
    const data = await response.json();

    if (!response.ok || !data.sucesso || !data.sala) {
        throw new Error(data.mensagem || 'A sala do QR Code não foi encontrada.');
    }

    if (data.sala.aberta === false) {
        throw new Error('A sala do QR Code está fechada.');
    }

    const opcaoSala = [...salaSelect.options].find(
        opcao => opcao.value === String(data.sala.id),
    );

    if (!opcaoSala) {
        throw new Error('A sala lida não está entre as salas abertas disponíveis.');
    }

    salaSelect.value = String(data.sala.id);
    statusQrSala.textContent = `Sala selecionada: ${data.sala.nome}. Confirme o consentimento e inicie o monitoramento.`;
}

botaoLerQr.addEventListener('click', async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        statusQrSala.textContent = 'A câmera exige HTTPS ou localhost neste dispositivo.';
        return;
    }

    if (!window.ZXingBrowser?.BrowserQRCodeReader) {
        statusQrSala.textContent = 'O leitor ZXing não carregou. Verifique a conexão e recarregue a página.';
        return;
    }

    leitorQrAtivo = true;
    qrEmProcessamento = false;
    botaoLerQr.disabled = true;
    botaoPararLeituraQr.hidden = false;
    cameraStageQr.hidden = false;
    painelMonitor.classList.add('qr-capture-active');
    document.body.classList.add('monitoring-active');
    statusQrSala.textContent = 'Aponte a câmera para o QR Code da sala.';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: 'user' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false,
        });

        if (!leitorQrAtivo) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }

        videoQrSala.srcObject = stream;
        await videoQrSala.play();

        const leitor = new ZXingBrowser.BrowserQRCodeReader();
        const controles = await leitor.decodeFromVideoElement(
            videoQrSala,
            (resultado, erro, controlesCallback) => {
                if (!resultado || qrEmProcessamento || !leitorQrAtivo) return;

                qrEmProcessamento = true;
                controlesLeitorQr = controlesCallback;
                pararLeituraQr();

                void validarQrESelecionarSala(resultado.getText())
                    .then(() => {
                        statusQrSala.textContent += ' O leitor QR foi desligado.';
                    })
                    .catch(error => {
                        statusQrSala.textContent =
                            error.message || 'Não foi possível validar o QR Code.';
                    });
            },
        );

        controlesLeitorQr = controles;

        if (!leitorQrAtivo || qrEmProcessamento) {
            controles.stop();
        }
    } catch (error) {
        pararLeituraQr();
        statusQrSala.textContent =
            error.message || 'Não foi possível abrir a câmera para ler o QR Code.';
    }
});

botaoPararLeituraQr.addEventListener('click', () => {
    pararLeituraQr();
    statusQrSala.textContent = 'Leitura do QR Code cancelada.';
});

botaoIniciar.addEventListener('click', async () => {
    if (!consentimento.checked) {
        statusMonitor.textContent = 'Confirme que as pessoas foram informadas e consentiram.';
        return;
    }

    const salaId = salaSelect.value;
    if (!salaId) {
        statusMonitor.textContent = 'Selecione uma sala aberta.';
        return;
    }

    controladorMonitor = new AbortController();
    painelMonitor.classList.add('capture-active');
    document.body.classList.add('monitoring-active');
    cameraStage.hidden = false;
    botaoParar.hidden = false;
    botaoIniciar.disabled = true;
    botaoParar.disabled = false;
    botaoParar.focus();
    salaSelect.disabled = true;
    consentimento.disabled = true;

    try {
        await FaceRecognition.monitorarDescritoresFaciais(
            videoMonitor,
            async descritor => {
                statusMonitor.textContent = 'Rosto alinhado. Verificando cadastro e registrando presença...';

                try {
                    const response = await fetch('/api/tenant/biometrics/checkin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ descritor, roomId: salaId, consentimento: true }),
                        signal: controladorMonitor.signal,
                    });
                    const data = await response.json();

                    if (!response.ok || !data.sucesso) {
                        throw new Error(data.mensagem || 'Não foi possível registrar a presença.');
                    }

                    atualizarFeedback('sucesso', 'Presença registrada na sala selecionada.');
                } catch (error) {
                    if (error.name === 'AbortError') throw error;
                    atualizarFeedback('ajuste', error.message || 'Falha ao verificar o rosto ou registrar presença.');
                }
            },
            message => statusMonitor.textContent = message,
            atualizarFeedback,
            controladorMonitor.signal,
        );
    } catch (error) {
        if (error.name === 'AbortError') {
            statusMonitor.textContent = 'Monitoramento parado.';
        } else {
            statusMonitor.textContent = FaceRecognition.mensagemErroFacial(error);
        }
    } finally {
        controladorMonitor = undefined;
        painelMonitor.classList.remove('capture-active');
        painelMonitor.removeAttribute('data-capture-state');
        document.body.classList.remove('monitoring-active');
        cameraStage.hidden = true;
        botaoIniciar.disabled = false;
        botaoParar.disabled = true;
        botaoParar.hidden = true;
        salaSelect.disabled = false;
        consentimento.disabled = false;
        videoMonitor.hidden = true;
        botaoIniciar.focus();
    }
});

botaoParar.addEventListener('click', () => {
    controladorMonitor?.abort();
    statusMonitor.textContent = 'Parando a câmera...';
});

carregarSalasAbertas();
