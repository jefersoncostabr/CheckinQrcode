const faceTestName = document.getElementById('faceTestName');
const faceTestButton = document.getElementById('faceTestButton');
const faceTestPanel = document.getElementById('faceTestPanel');
const faceTestVideo = document.getElementById('faceTestVideo');
const faceTestCameraStage = document.getElementById('faceTestCameraStage');
const faceTestStatus = document.getElementById('faceTestStatus');
const faceTestResult = document.getElementById('faceTestResult');
const faceTestCancel = document.getElementById('faceTestCancel');
let faceTestController;

faceTestCancel.addEventListener('click', () => faceTestController?.abort());

faceTestButton.addEventListener('click', async () => {
    faceTestResult.hidden = true;
    faceTestButton.disabled = true;
    faceTestController = new AbortController();
    faceTestPanel.classList.add('capture-active');
    faceTestPanel.removeAttribute('data-capture-state');
    faceTestCameraStage.hidden = false;
    faceTestCancel.hidden = false;
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(
            faceTestVideo,
            status => { faceTestStatus.textContent = status; },
            (state, message) => {
                faceTestPanel.dataset.captureState = state;
                faceTestStatus.textContent = message;
            },
            faceTestController.signal,
        );
        const nome = faceTestName.value.trim();
        const response = await fetch('/api/face/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descritor, ...(nome ? { nome } : {}) }),
        });
        const data = await response.json();
        if (!response.ok || !data.sucesso) {
            throw new Error(data.mensagem || 'Não foi possível verificar o cadastro facial.');
        }

        faceTestStatus.textContent = '';
        faceTestResult.classList.toggle('face-test-success', data.cadastrado);
        faceTestResult.classList.toggle('face-test-failure', !data.cadastrado || data.corresponde === false);
        if (!data.cadastrado) {
            faceTestResult.textContent = 'Este rosto não está cadastrado.';
        } else if (nome) {
            faceTestResult.textContent = data.corresponde
                ? 'Este rosto está cadastrado e corresponde ao nome informado.'
                : 'Este rosto está cadastrado, mas não corresponde ao nome informado.';
        } else {
            faceTestResult.textContent = 'Este rosto está cadastrado.';
        }
        faceTestResult.hidden = false;
    } catch (error) {
        faceTestStatus.textContent = error.name === 'AbortError'
            ? 'Captura cancelada. Você pode tentar novamente.'
            : FaceRecognition.mensagemErroFacial(error);
    } finally {
        faceTestController = undefined;
        faceTestPanel.classList.remove('capture-active');
        faceTestPanel.removeAttribute('data-capture-state');
        faceTestCameraStage.hidden = true;
        faceTestCancel.hidden = true;
        faceTestButton.disabled = false;
    }
});
