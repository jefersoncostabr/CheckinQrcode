const faceModelsUrl = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';

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

async function capturarDescritorFacial(video, atualizarStatus) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(`O navegador bloqueia a câmera neste endereço (${window.location.origin}). No Android, um endereço por IP local precisa de HTTPS; localhost só é considerado seguro no próprio dispositivo.`);
    }
    if (!window.faceapi) {
        throw new Error('Não foi possível carregar o reconhecimento facial. Verifique a conexão e tente novamente.');
    }

    atualizarStatus('Carregando os modelos faciais...');
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(faceModelsUrl),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(faceModelsUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(faceModelsUrl),
        ]);
    } catch {
        throw new Error('Não foi possível baixar os modelos faciais. Confira a internet no celular e tente novamente.');
    }

    atualizarStatus('Aguardando permissão da câmera...');
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
    video.srcObject = stream;
    video.hidden = false;

    try {
        await video.play();
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error('A câmera não enviou imagem. Tente novamente.')), 8000);
                video.addEventListener('loadeddata', () => {
                    clearTimeout(timeoutId);
                    resolve();
                }, { once: true });
                video.addEventListener('error', () => {
                    clearTimeout(timeoutId);
                    reject(new Error('O vídeo da câmera não pôde ser iniciado.'));
                }, { once: true });
            });
        }
        atualizarStatus('Posicione apenas um rosto na câmera e aguarde...');
        await new Promise(resolve => setTimeout(resolve, 1200));
        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
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
        video.srcObject = null;
        video.hidden = true;
    }
}

window.FaceRecognition = {
    capturarDescritorFacial,
    mensagemErroFacial,
};
