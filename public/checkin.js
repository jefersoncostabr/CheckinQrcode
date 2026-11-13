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
const btn = document.getElementById('btn');
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
        salaStatus.textContent = 'Confirme sua presença.';
        nomeInput.disabled = false;
        btn.disabled = false;
        checkinRoomKey = data.sala.id;
        facePanel.hidden = false;
        faceDeleteBtn.textContent = 'Excluir meu perfil biométrico';
        atualizarBotaoExclusao();
    } catch {
        salaStatus.textContent = 'Não foi possível verificar a sala. Tente novamente.';
    }
}

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
    btn.disabled = true;
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

async function confirmar() {
    const storageKey = `checkin_realizado_${checkinRoomKey}_${getTodayString()}`;
    // Verifica se este dispositivo já salvou um check-in na data de hoje
    if (localStorage.getItem(storageKey)) {
        alert("Você já confirmou presença neste dispositivo hoje!");
        return;
    }

    const nome = nomeInput.value.trim();

    if (!nome) {
        alert("Por favor, digite seu nome antes de confirmar.");
        return;
    }

    if (!tenantQrToken) {
        alert('QR Code inválido. Solicite à administração um QR Code novo desta organização.');
        return;
    }

    btn.disabled = true; btn.innerText = 'Registrando...';
    
    try {
        const res = await fetch('/api/checkin/tenant/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, token: tenantQrToken }),
        });
        const data = await res.json();
        if(data.sucesso) { 
            localStorage.setItem(storageKey, 'true'); // Marca neste celular que já foi feito hoje
            nomeInput.disabled = true;
            btn.innerText = 'Presença Confirmada! ✅';
        } else { 
            alert(data.mensagem); 
            btn.disabled = false; btn.innerText = 'Tentar Novamente'; 
        }
    } catch (e) { 
        alert('Erro de conexão'); 
        btn.disabled = false; btn.innerText = 'Tentar Novamente'; 
    }
}

validarSala();