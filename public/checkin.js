// comentário teste(remover)

// Função para obter a data de hoje no formato YYYY-MM-DD
const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// O check-in da aplicação usa exclusivamente tokens tenant-scoped no fragmento do QR.
const fragmentoQr = window.location.hash.slice(1);
const tenantQrToken = fragmentoQr.startsWith('token=')
    ? new URLSearchParams(fragmentoQr).get('token')
    : fragmentoQr;
const salaAtual = tenantQrToken || '';
let checkinRoomKey = salaAtual;

const tituloEl = document.querySelector('h1');
const salaStatus = document.getElementById('salaStatus');
const nomeInput = document.getElementById('nomeInput');
const senhaInput = document.getElementById('senhaInput');
const btnCriarConta = document.getElementById('btnCriarConta');
const btnEntrar = document.getElementById('btnEntrar');
const btnConfirmar = document.getElementById('btnConfirmar');
const btnSair = document.getElementById('btnSair');
const statusConta = document.getElementById('statusConta');
const facePanel = document.getElementById('facePanel');
const faceConsent = document.getElementById('faceConsent');
const faceName = document.getElementById('faceName');
const faceCheckinBtn = document.getElementById('faceCheckinBtn');
const faceEnrollBtn = document.getElementById('faceEnrollBtn');
const faceDeleteBtn = document.getElementById('faceDeleteBtn');
const faceVideo = document.getElementById('faceVideo');
const faceCameraStage = document.getElementById('faceCameraStage');
const faceCaptureCancel = document.getElementById('faceCaptureCancel');
const faceStatus = document.getElementById('faceStatus');
let faceCaptureController;

function obterChaveArmazenamentoFacial() {
    return `checkin_tenant_face_${tenantQrToken}`;
}

function habilitarExclusaoSemQrAtivo() {
    if (!tenantQrToken || !localStorage.getItem(obterChaveArmazenamentoFacial())) return
    facePanel.hidden = false
    faceConsent.closest('label').hidden = true
    faceName.closest('.face-register').hidden = true
    faceCheckinBtn.hidden = true
    faceEnrollBtn.hidden = true
    faceStatus.textContent = 'Este QR não está mais ativo. Você ainda pode excluir seu perfil biométrico.'
    atualizarBotaoExclusao()
}

function iniciarCapturaFacial() {
    faceCaptureController = new AbortController();
    facePanel.classList.add('capture-active');
    document.body.classList.add('face-capture-active');
    faceCameraStage.hidden = false;
    faceCaptureCancel.hidden = false;
    return faceCaptureController;
}

function finalizarCapturaFacial() {
    facePanel.classList.remove('capture-active');
    facePanel.removeAttribute('data-capture-state');
    document.body.classList.remove('face-capture-active');
    faceCameraStage.hidden = true;
    faceCaptureCancel.hidden = true;
    faceCaptureController = undefined;
}

function atualizarFeedbackCaptura(state, message) {
    facePanel.dataset.captureState = state;
    faceStatus.textContent = message;
}

faceCaptureCancel.addEventListener('click', () => faceCaptureController?.abort());

function atualizarBotaoExclusao() {
    faceDeleteBtn.hidden = !localStorage.getItem(obterChaveArmazenamentoFacial());
}

function verificarConsentimento() {
    if (!faceConsent.checked) {
        faceStatus.textContent = 'Marque o consentimento antes de usar a câmera.';
        return false;
    }
    return true;
}

async function enviarCheckinFacial(descritor) {
    const storageKey = `checkin_realizado_${checkinRoomKey}_${getTodayString()}`;
    if (localStorage.getItem(storageKey)) {
        throw new Error('Este dispositivo já confirmou presença hoje.');
    }

    const response = await fetch('/api/checkin/tenant/biometrics/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tenantQrToken, descritor, consentimento: faceConsent.checked }),
    });
    const data = await response.json();
    if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível fazer o check-in facial.');

    localStorage.setItem(storageKey, 'true');
    nomeInput.disabled = true;
    senhaInput.disabled = true;
    btnCriarConta.disabled = true;
    btnEntrar.disabled = true;
    btnConfirmar.disabled = true;
    faceCheckinBtn.disabled = true;
    faceEnrollBtn.disabled = true;
    faceStatus.textContent = data.nome
        ? `Presença confirmada para ${data.nome}.`
        : data.mensagem || 'Presença confirmada.';
}

faceCheckinBtn.addEventListener('click', async () => {
    if (!verificarConsentimento()) return;
    faceCheckinBtn.disabled = true;
    faceEnrollBtn.disabled = true;
    let checkinConcluido = false;
    const controller = iniciarCapturaFacial();
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(
            faceVideo,
            status => { faceStatus.textContent = status; },
            atualizarFeedbackCaptura,
            controller.signal,
        );
        await enviarCheckinFacial(descritor);
        checkinConcluido = true;
    } catch (error) {
        faceStatus.textContent = error.name === 'AbortError'
            ? 'Captura cancelada. Você pode tentar novamente.'
            : FaceRecognition.mensagemErroFacial(error);
    } finally {
        finalizarCapturaFacial();
        faceCheckinBtn.disabled = checkinConcluido;
        faceEnrollBtn.disabled = checkinConcluido;
    }
});

faceEnrollBtn.addEventListener('click', async () => {
    if (!verificarConsentimento()) return;
    const nome = faceName.value.trim();
    if (!nome) {
        faceStatus.textContent = 'Informe seu nome para cadastrar o rosto.';
        return;
    }

    faceCheckinBtn.disabled = true;
    faceEnrollBtn.disabled = true;
    let checkinConcluido = false;
    const controller = iniciarCapturaFacial();
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(
            faceVideo,
            status => { faceStatus.textContent = status; },
            atualizarFeedbackCaptura,
            controller.signal,
        );
        const response = await fetch('/api/checkin/tenant/biometrics/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tenantQrToken, nome, descritor, consentimento: faceConsent.checked }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível cadastrar o rosto.');

        localStorage.setItem(obterChaveArmazenamentoFacial(), JSON.stringify({
            id: data.perfilId,
            token: data.tokenExclusao,
        }));
        atualizarBotaoExclusao();
        faceStatus.textContent = data.mensagem;
        await enviarCheckinFacial(descritor);
        checkinConcluido = true;
    } catch (error) {
        faceStatus.textContent = error.name === 'AbortError'
            ? 'Captura cancelada. Você pode tentar novamente.'
            : FaceRecognition.mensagemErroFacial(error);
    } finally {
        finalizarCapturaFacial();
        faceCheckinBtn.disabled = checkinConcluido;
        faceEnrollBtn.disabled = checkinConcluido;
    }
});

faceDeleteBtn.addEventListener('click', async () => {
    const storageKey = obterChaveArmazenamentoFacial();
    const perfil = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!perfil?.id || !perfil?.token) {
        faceStatus.textContent = 'Credencial de exclusão não encontrada neste dispositivo.';
        return;
    }

    faceDeleteBtn.disabled = true;
    try {
        const response = await fetch(
            `/api/checkin/tenant/biometrics/profiles/${encodeURIComponent(perfil.id)}`,
            {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'x-biometric-delete-token': perfil.token },
            },
        );
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível excluir o cadastro.');
        localStorage.removeItem(storageKey);
        atualizarBotaoExclusao();
        faceStatus.textContent = data.mensagem;
    } catch (error) {
        faceStatus.textContent = error.message || 'Erro ao excluir o cadastro facial.';
    } finally {
        faceDeleteBtn.disabled = false;
    }
});

btnSair.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/checkin/tenant/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.mensagem || 'Não foi possível sair da conta.');
        }
    } catch (error) {
        statusConta.textContent = error.message;
        return;
    }
    sairConta();
});

function sairConta() {
    nomeInput.value = '';
    senhaInput.value = '';
    mostrarModoNaoAutenticado();
}

function mostrarModoAutenticado(pessoa, sala) {
    nomeInput.disabled = true;
    senhaInput.disabled = true;
    btnCriarConta.disabled = true;
    btnEntrar.disabled = true;
    btnCriarConta.hidden = true;
    btnEntrar.hidden = true;

    btnConfirmar.hidden = false;
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = 'Confirmar presença';
    btnSair.hidden = false;
    btnSair.disabled = false;

    statusConta.textContent = `Conectado como ${pessoa.nome}.`;
    salaStatus.textContent = `Presença para ${sala.nome}.`;
}

function mostrarModoNaoAutenticado() {
    nomeInput.disabled = false;
    senhaInput.disabled = false;
    atualizarBotoesConta();
    btnCriarConta.hidden = false;
    btnEntrar.hidden = false;

    btnConfirmar.hidden = true;
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Confirmar presença';
    btnSair.hidden = true;
    btnSair.disabled = true;

    statusConta.textContent = '';
    salaStatus.textContent = 'Confirme sua presença.';
}

async function consultarSessao() {
    if (!tenantQrToken) return;

    try {
        const response = await fetch('/api/checkin/tenant/sessao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tenantQrToken }),
        });

        if (response.status === 401) {
            mostrarModoNaoAutenticado();
            return;
        }

        if (!response.ok) {
            const data = await response.json();
            if (response.status === 403) mostrarModoNaoAutenticado();
            statusConta.textContent = data.mensagem || 'Erro ao verificar sessão.';
            return;
        }

        const data = await response.json();
        if (data.sucesso && data.pessoa) {
            mostrarModoAutenticado(data.pessoa, data.sala);
        } else {
            statusConta.textContent = 'Resposta inválida ao verificar a sessão. Atualize a página.';
        }
    } catch {
        statusConta.textContent = 'Não foi possível verificar a sessão. Atualize a página e tente novamente.';
    }
}

async function validarSala() {
    if (!salaAtual) {
        salaStatus.textContent = 'QR Code inválido. Solicite à administração um QR Code novo desta organização.';
        return;
    }
    try {
        const response = await fetch('/api/checkin/tenant/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tenantQrToken }),
        });
        const data = await response.json();
        if (!response.ok) {
            salaStatus.textContent = data.mensagem || 'Sala não cadastrada. Fale com a administração.';
            habilitarExclusaoSemQrAtivo()
            return;
        }
        tituloEl.textContent = `Check-in - ${data.sala.nome}`;
        salaStatus.textContent = 'Verificando sua sessão...';
        checkinRoomKey = data.sala.id;
        facePanel.hidden = false;
        faceDeleteBtn.textContent = 'Excluir meu perfil biométrico';
        atualizarBotaoExclusao();

        await consultarSessao();
    } catch {
        salaStatus.textContent = 'Não foi possível verificar a sala. Tente novamente.';
    }
}

async function criarConta() {
    const nome = nomeInput.value.trim();
    const senha = senhaInput.value;

    if (!nome) {
        statusConta.textContent = 'Informe seu nome completo.';
        return;
    }
    if (!senha) {
        statusConta.textContent = 'Informe uma senha.';
        return;
    }
    if (!tenantQrToken) {
        salaStatus.textContent = 'QR Code inválido. Solicite à administração um QR Code novo desta organização.';
        return;
    }

    btnCriarConta.disabled = true;
    btnEntrar.disabled = true;
    btnCriarConta.textContent = 'Criando conta...';

    try {
        const response = await fetch('/api/checkin/tenant/criar-conta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, senha, token: tenantQrToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) {
            statusConta.textContent = data.mensagem || 'Não foi possível criar a conta.';
            btnCriarConta.disabled = false;
            btnEntrar.disabled = false;
            btnCriarConta.textContent = 'Criar conta e confirmar presença';
            if (data.presencaRegistrada) senhaInput.value = '';
            return;
        }

        senhaInput.value = '';
        btnCriarConta.textContent = 'Criar conta e confirmar presença';
        mostrarModoAutenticado(data.pessoa, data.sala);
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Presença Confirmada! ✅';
        statusConta.textContent = `Conta criada e presença confirmada para ${data.pessoa.nome}.`;
    } catch {
        statusConta.textContent = 'Erro de conexão. Tente novamente.';
        btnCriarConta.disabled = false;
        btnEntrar.disabled = false;
        btnCriarConta.textContent = 'Criar conta e confirmar presença';
    }
}

async function entrar() {
    const nome = nomeInput.value.trim();
    const senha = senhaInput.value;

    if (!nome) {
        statusConta.textContent = 'Informe seu nome completo.';
        return;
    }
    if (!senha) {
        statusConta.textContent = 'Informe sua senha.';
        return;
    }
    if (!tenantQrToken) {
        salaStatus.textContent = 'QR Code inválido. Solicite à administração um QR Code novo desta organização.';
        return;
    }

    btnEntrar.disabled = true;
    btnCriarConta.disabled = true;
    btnEntrar.textContent = 'Entrando...';

    try {
        const response = await fetch('/api/checkin/tenant/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, senha, token: tenantQrToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) {
            statusConta.textContent = data.mensagem || 'Nome ou senha incorretos.';
            btnEntrar.disabled = false;
            btnCriarConta.disabled = false;
            btnEntrar.textContent = 'Entrar';
            return;
        }

        senhaInput.value = '';
        btnEntrar.textContent = 'Entrar';
        mostrarModoAutenticado(data.pessoa, data.sala);
        await confirmarPresenca();
    } catch {
        statusConta.textContent = 'Erro de conexão. Tente novamente.';
        btnEntrar.disabled = false;
        btnCriarConta.disabled = false;
        btnEntrar.textContent = 'Entrar';
    }
}

async function confirmarPresenca() {
    if (!tenantQrToken) {
        salaStatus.textContent = 'QR Code inválido. Solicite à administração um QR Code novo desta organização.';
        return;
    }

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Registrando...';

    try {
        const response = await fetch('/api/checkin/tenant/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tenantQrToken }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) {
            if (response.status === 401) {
                mostrarModoNaoAutenticado();
                statusConta.textContent = data.mensagem || 'Faça login novamente.';
                return;
            }
            statusConta.textContent = data.mensagem || 'Não foi possível confirmar a presença.';
            btnConfirmar.disabled = false;
            btnConfirmar.textContent = 'Confirmar presença';
            return;
        }

        nomeInput.disabled = true;
        senhaInput.disabled = true;
        btnCriarConta.disabled = true;
        btnEntrar.disabled = true;
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = 'Presença Confirmada! ✅';
        statusConta.textContent = data.mensagem || 'Presença confirmada.';
    } catch {
        statusConta.textContent = 'Erro de conexão. Tente novamente.';
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = 'Confirmar presença';
    }
}

btnCriarConta.addEventListener('click', criarConta);
btnEntrar.addEventListener('click', entrar);
btnConfirmar.addEventListener('click', confirmarPresenca);

function atualizarBotoesConta() {
    const incompleto = !nomeInput.value.trim() || !senhaInput.value;
    btnCriarConta.disabled = incompleto;
    btnEntrar.disabled = incompleto;
}

nomeInput.addEventListener('input', atualizarBotoesConta);
senhaInput.addEventListener('input', atualizarBotoesConta);

validarSala();
