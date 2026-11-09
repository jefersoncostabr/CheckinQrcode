const faceTestName = document.getElementById('faceTestName');
const faceTestButton = document.getElementById('faceTestButton');
const faceTestVideo = document.getElementById('faceTestVideo');
const faceTestStatus = document.getElementById('faceTestStatus');
const faceTestResult = document.getElementById('faceTestResult');

faceTestButton.addEventListener('click', async () => {
    faceTestResult.hidden = true;
    faceTestButton.disabled = true;
    try {
        const descritor = await FaceRecognition.capturarDescritorFacial(faceTestVideo, status => {
            faceTestStatus.textContent = status;
        });
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
        faceTestStatus.textContent = FaceRecognition.mensagemErroFacial(error);
    } finally {
        faceTestButton.disabled = false;
    }
});
