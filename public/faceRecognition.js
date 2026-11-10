const faceModelsUrl = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights';
let faceModelsPromise;

function carregarModelosFaciais() {
    if (!faceModelsPromise) {
        faceModelsPromise = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(faceModelsUrl),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(faceModelsUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(faceModelsUrl),
        ]).catch(error => {
            faceModelsPromise = null;
            throw error;
        });
    }

    return faceModelsPromise;
}

window.addEventListener('load', () => {
    carregarModelosFaciais().catch(error => {
        console.warn('Não foi possível pré-carregar os modelos faciais. A captura tentará carregá-los novamente.', error);
    });
}, { once: true });

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

function verificarCancelamento(signal) {
    if (signal?.aborted) {
        throw new DOMException('Captura cancelada.', 'AbortError');
    }
}

function obterStream(constraints, signal) {
    const cameraPromise = navigator.mediaDevices.getUserMedia(constraints);
    if (!signal) return cameraPromise;

    return new Promise((resolve, reject) => {
        const cancelar = () => reject(new DOMException('Captura cancelada.', 'AbortError'));
        if (signal.aborted) {
            cancelar();
            cameraPromise.then(stream => stream.getTracks().forEach(track => track.stop())).catch(() => {});
            return;
        }

        signal.addEventListener('abort', cancelar, { once: true });
        cameraPromise.then(stream => {
            signal.removeEventListener('abort', cancelar);
            if (signal.aborted) {
                stream.getTracks().forEach(track => track.stop());
                cancelar();
                return;
            }
            resolve(stream);
        }, error => {
            signal.removeEventListener('abort', cancelar);
            reject(error);
        });
    });
}

async function capturarDescritorFacial(video, atualizarStatus, atualizarFeedback = () => {}, signal) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(`O navegador bloqueia a câmera neste endereço (${window.location.origin}). No Android, um endereço por IP local precisa de HTTPS; localhost só é considerado seguro no próprio dispositivo.`);
    }
    if (!window.faceapi) {
        throw new Error('Não foi possível carregar o reconhecimento facial. Verifique a conexão e tente novamente.');
    }

    verificarCancelamento(signal);
    atualizarStatus('Preparando a captura facial...');
    atualizarFeedback('aguardando', 'Preparando a câmera e os modelos faciais...');
    try {
        await carregarModelosFaciais();
    } catch {
        throw new Error('Não foi possível baixar os modelos faciais. Confira a internet no celular e tente novamente.');
    }

    verificarCancelamento(signal);
    atualizarStatus('Aguardando permissão da câmera...');
    atualizarFeedback('aguardando', 'Permita o acesso à câmera quando o navegador solicitar.');
    let stream;
    try {
        stream = await obterStream({
            video: {
                facingMode: { ideal: 'user' },
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
            audio: false,
        }, signal);
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        if (!['OverconstrainedError', 'NotFoundError'].includes(error.name)) throw error;
        stream = await obterStream({ video: true, audio: false }, signal);
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
        atualizarStatus('Ajuste seu rosto dentro da moldura.');
        atualizarFeedback('procurando', 'Centralize seu rosto na moldura. A captura acontece automaticamente.');
        let deteccoesAlinhadas = 0;
        let ultimoFeedback = '';

        while (true) {
            verificarCancelamento(signal);
            const detections = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
                .withFaceLandmarks(true);

            let feedback;
            if (detections.length === 0) {
                feedback = ['procurando', 'Não detectamos um rosto. Aproxime-se e procure um local bem iluminado.'];
                deteccoesAlinhadas = 0;
            } else if (detections.length > 1) {
                feedback = ['ajuste', 'Detectamos mais de um rosto. Deixe apenas uma pessoa diante da câmera.'];
                deteccoesAlinhadas = 0;
            } else {
                const { x, y, width, height } = detections[0].detection.box;
                const centroX = (x + width / 2) / video.videoWidth;
                const centroY = (y + height / 2) / video.videoHeight;
                const larguraRosto = width / video.videoWidth;
                const alturaRosto = height / video.videoHeight;
                const enquadrado = centroX >= 0.37 && centroX <= 0.63 &&
                    centroY >= 0.3 && centroY <= 0.7 &&
                    larguraRosto >= 0.18 && larguraRosto <= 0.48 &&
                    alturaRosto <= 0.72;

                if (!enquadrado) {
                    feedback = ['ajuste', larguraRosto < 0.18
                        ? 'Rosto detectado. Aproxime-se um pouco da câmera.'
                        : larguraRosto > 0.62
                            ? 'Rosto muito próximo. Afaste-se um pouco da câmera.'
                            : 'Rosto detectado. Centralize-o dentro da moldura.'];
                    deteccoesAlinhadas = 0;
                } else {
                    deteccoesAlinhadas += 1;
                    feedback = ['alinhado', 'Ótimo! Mantenha o rosto parado; estamos finalizando a captura...'];
                    if (deteccoesAlinhadas >= 3) {
                        const caixaAlinhada = detections[0].landmarks.align(null, { useDlibAlignment: true });
                        const [rostoAlinhado] = await faceapi.extractFaces(video, [caixaAlinhada]);
                        const descriptor = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(rostoAlinhado);
                        verificarCancelamento(signal);
                        atualizarFeedback('sucesso', 'Rosto capturado com sucesso.');
                        atualizarStatus('Rosto capturado. Finalizando...');
                        return Array.from(descriptor);
                    }
                }
            }

            const chaveFeedback = feedback.join(':');
            if (chaveFeedback !== ultimoFeedback) {
                atualizarFeedback(...feedback);
                atualizarStatus(feedback[1]);
                ultimoFeedback = chaveFeedback;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
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
