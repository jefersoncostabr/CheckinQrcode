// comentário teste(remover)

// Função para obter a data de hoje no formato YYYY-MM-DD
const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// QRs novos usam id; o apelido fica aceito para QRs antigos.
const parametros = new URLSearchParams(window.location.search);
const salaIdAtual = parametros.get('id');
const salaLegada = parametros.get('sala');
const salaAtual = salaIdAtual || salaLegada || '';

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
const faceStatus = document.getElementById('faceStatus');
const faceStorageKey = 'checkin_face_profile';

async function validarSala() {
    if (!salaAtual) {
        salaStatus.textContent = 'Sala não cadastrada. Fale com a administração.';
        return;
    }
    try {
        const parametro = salaIdAtual ? 'id' : 'sala';
        const response = await fetch(`/api/checkin/sala?${parametro}=${encodeURIComponent(salaAtual)}`);
        const data = await response.json();
        if (!response.ok) {
            salaStatus.textContent = data.mensagem || 'Sala não cadastrada. Fale com a administração.';
            return;
        }
        tituloEl.textContent = `Check-in - ${data.sala.nome}`;
        salaStatus.textContent = 'Confirme sua presença.';
        nomeInput.disabled = false;
        btn.disabled = false;
        facePanel.hidden = false;
        atualizarBotaoExclusao();
        if (!window.isSecureContext) {
            faceStatus.textContent = `A câmera está bloqueada neste endereço (${window.location.origin}). No Android, o acesso por IP local em HTTP exige HTTPS. O check-in pelo nome continua disponível.`;
        }
    } catch {
        salaStatus.textContent = 'Não foi possível verificar a sala. Tente novamente.';
    }
}

function atualizarBotaoExclusao() {
    faceDeleteBtn.hidden = !localStorage.getItem(faceStorageKey);
}

function verificarConsentimento() {
    if (!faceConsent.checked) {
        faceStatus.textContent = 'Marque o consentimento antes de usar a câmera.';
        return false;
    }
    return true;
}

async function enviarCheckinFacial(descritor) {
    const storageKey = `checkin_realizado_${salaAtual}_${getTodayString()}`;
    if (localStorage.getItem(storageKey)) {
        throw new Error('Este dispositivo já confirmou presença hoje.');
    }

    const response = await fetch('/api/face/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descritor, ...(salaIdAtual ? { salaId: Number(salaIdAtual) } : { sala: salaLegada }) }),
    });
    const data = await response.json();
    if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível fazer o check-in facial.');

    localStorage.setItem(storageKey, 'true');
    nomeInput.disabled = true;
    btn.disabled = true;
    faceCheckinBtn.disabled = true;
    faceEnrollBtn.disabled = true;
    faceStatus.textContent = `Presença confirmada para ${data.nome}.`;
}

faceCheckinBtn.addEventListener('click', async () => {
    if (!verificarConsentimento()) return;
    faceCheckinBtn.disabled = true;
    faceEnrollBtn.disabled = true;
    let checkinConcluido = false;
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(faceVideo, status => {
            faceStatus.textContent = status;
        });
        await enviarCheckinFacial(descritor);
        checkinConcluido = true;
    } catch (error) {
        faceStatus.textContent = FaceRecognition.mensagemErroFacial(error);
    } finally {
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
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(faceVideo, status => {
            faceStatus.textContent = status;
        });
        const response = await fetch('/api/face/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, descritor, consentimento: faceConsent.checked }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível cadastrar o rosto.');

        localStorage.setItem(faceStorageKey, JSON.stringify({
            id: data.perfilId,
            token: data.tokenExclusao,
        }));
        atualizarBotaoExclusao();
        faceStatus.textContent = data.mensagem;
        await enviarCheckinFacial(descritor);
        checkinConcluido = true;
    } catch (error) {
        faceStatus.textContent = FaceRecognition.mensagemErroFacial(error);
    } finally {
        faceCheckinBtn.disabled = checkinConcluido;
        faceEnrollBtn.disabled = checkinConcluido;
    }
});

faceDeleteBtn.addEventListener('click', async () => {
    const perfil = JSON.parse(localStorage.getItem(faceStorageKey) || 'null');
    if (!perfil?.id || !perfil?.token) {
        faceStatus.textContent = 'Credencial de exclusão não encontrada neste dispositivo.';
        return;
    }

    faceDeleteBtn.disabled = true;
    try {
        const response = await fetch(`/api/face/profile/${encodeURIComponent(perfil.id)}`, {
            method: 'DELETE',
            headers: { 'x-face-delete-token': perfil.token },
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) throw new Error(data.mensagem || 'Não foi possível excluir o cadastro.');
        localStorage.removeItem(faceStorageKey);
        atualizarBotaoExclusao();
        faceStatus.textContent = data.mensagem;
    } catch (error) {
        faceStatus.textContent = error.message || 'Erro ao excluir o cadastro facial.';
    } finally {
        faceDeleteBtn.disabled = false;
    }
});

async function confirmar() {
    const storageKey = `checkin_realizado_${salaAtual}_${getTodayString()}`;
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

    if (!salaAtual) {
        alert('Sala não especificada. Fale com a administração.');
        return;
    }

    btn.disabled = true; btn.innerText = 'Registrando...';
    
    try {
        const res = await fetch('/add', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salaIdAtual ? { nome, salaId: Number(salaIdAtual) } : { nome, sala: salaLegada })
        });
        const data = await res.json();
        if(data.sucesso) { 
            localStorage.setItem(storageKey, 'true'); // Marca neste celular que já foi feito hoje
            nomeInput.disabled = true;
            btn.innerText = 'Presença Confirmada! ✅';
            btn.style.backgroundColor = '#28a745';
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