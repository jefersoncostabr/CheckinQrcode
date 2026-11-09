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
const faceModelsUrl = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

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

function mensagemErroFacial(error) {
    if (error instanceof Error && error.name === 'Error' && error.message) {
        return error.message;
    }

    switch (error?.name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return 'O navegador bloqueou a câmera. Permita o acesso à câmera nas configurações do site e confirme que a página está em HTTPS.';
        case 'NotFoundError':
            return 'Nenhuma câmera foi encontrada neste dispositivo.';
        case 'NotReadableError':
            return 'A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.';
        case 'OverconstrainedError':
            return 'Não foi possível iniciar a câmera frontal. Tente novamente ou confira as permissões do navegador.';
        case 'AbortError':
            return 'A inicialização da câmera foi interrompida. Tente novamente.';
        default:
            return 'Não foi possível iniciar o reconhecimento facial. Confira a conexão, a permissão da câmera e tente novamente.';
    }
}

async function obterDescritorFacial() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(`O navegador bloqueia a câmera neste endereço (${window.location.origin}). No Android, um endereço por IP local precisa de HTTPS; localhost só é considerado seguro no próprio dispositivo. O check-in pelo nome continua disponível.`);
    }
    if (!window.faceapi) {
        throw new Error('Não foi possível carregar o reconhecimento facial. Verifique a conexão e tente novamente.');
    }

    faceStatus.textContent = 'Carregando os modelos faciais...';
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(faceModelsUrl),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(faceModelsUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(faceModelsUrl),
        ]);
    } catch {
        throw new Error('Não foi possível baixar os modelos faciais. Confira a internet no celular e tente novamente.');
    }

    faceStatus.textContent = 'Aguardando permissão da câmera...';
    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
            audio: false,
        });
    } catch (error) {
        if (!['OverconstrainedError', 'NotFoundError'].includes(error.name)) throw error;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    faceVideo.srcObject = stream;
    faceVideo.hidden = false;

    try {
        await faceVideo.play();
        if (faceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('A câmera não enviou imagem. Tente novamente.')), 8000);
                faceVideo.addEventListener('loadeddata', () => {
                    clearTimeout(timeoutId);
                    resolve();
                }, { once: true });
                faceVideo.addEventListener('error', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('O vídeo da câmera não pôde ser iniciado.'));
                }, { once: true });
            });
        }
        faceStatus.textContent = 'Posicione apenas um rosto na câmera e aguarde...';
        await new Promise(resolve => setTimeout(resolve, 1200));
        const detections = await faceapi
            .detectAllFaces(faceVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
            .withFaceLandmarks(true)
            .withFaceDescriptors();
        if (detections.length !== 1) {
            throw new Error(detections.length === 0
                ? 'Nenhum rosto detectado. Ajuste a iluminação e tente novamente.'
                : 'Mais de um rosto detectado. Deixe apenas uma pessoa diante da câmera.');
        }
        return Array.from(detections[0].descriptor);
    } finally {
        stream.getTracks().forEach(track => track.stop());
        faceVideo.srcObject = null;
        faceVideo.hidden = true;
    }
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
        const descritor = await obterDescritorFacial();
        await enviarCheckinFacial(descritor);
        checkinConcluido = true;
    } catch (error) {
        faceStatus.textContent = mensagemErroFacial(error);
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
        const descritor = await obterDescritorFacial();
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
        faceStatus.textContent = mensagemErroFacial(error);
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