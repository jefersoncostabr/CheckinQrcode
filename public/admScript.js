document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const quantidadeAtualEl = document.getElementById('quantidadeAtual');
    const statusEl = document.getElementById('status');

    // Botões
    const btnAtualizarQtd = document.getElementById('btnAtualizarQtd');
    const btnReduzir = document.getElementById('btnReduzir');
    const btnAddPresenca = document.getElementById('btnAddPresenca');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnGerarQRCode = document.getElementById('btnGerarQRCode');

    // --- FUNÇÕES AUXILIARES ---

    /**
     * Atualiza a mensagem de status na tela.
     * @param {string} message - A mensagem a ser exibida.
     * @param {'success'|'error'|'info'} type - O tipo de mensagem.
     */
    function updateStatus(message, type = 'info') {
        statusEl.innerHTML = `<p>${message}</p>`;
        statusEl.className = 'status-message'; // Reset class
        if (type === 'success') {
            statusEl.classList.add('success');
        } else if (type === 'error') {
            statusEl.classList.add('error');
        }
    }

    /**
     * Função genérica para fazer requisições à API.
     * @param {string} url - URL do endpoint.
     * @param {object} options - Opções para o fetch (método, etc.).
     * @param {function} callback - Função a ser chamada com o JSON de resposta.
     */
    async function apiRequest(url, options, callback) {
        try {
            const response = await fetch(url, options);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.mensagem || `Erro ${response.status}`);
            }

            if (callback) {
                callback(data);
            }
        } catch (error) {
            console.error(`Erro na requisição para ${url}:`, error);
            updateStatus(`Erro: ${error.message}`, 'error');
        }
    }

    // --- FUNÇÕES DE AÇÃO ---

    /**
     * Busca e atualiza a contagem atual de pessoas.
     */
    async function fetchQuantidade() {
        quantidadeAtualEl.textContent = 'Carregando...';
        await apiRequest('/qtd', { method: 'GET' }, (data) => {
            quantidadeAtualEl.textContent = data.quantidade;
            updateStatus('Contagem atualizada com sucesso.', 'success');
        });
    }

    // --- EVENT LISTENERS ---

    btnAtualizarQtd.addEventListener('click', fetchQuantidade);

    btnAddPresenca.addEventListener('click', () => {
        window.location.href = '/adm/adicionar-manual';
    });

    btnReduzir.addEventListener('click', async () => {
        if (!confirm('Tem certeza que deseja remover o último check-in? Esta ação não pode ser desfeita.')) {
            return;
        }
        await apiRequest('/reduce', { method: 'DELETE' }, (data) => {
            quantidadeAtualEl.textContent = data.novaQuantidade;
            updateStatus(data.mensagem, 'success');
        });
    });

    btnLimpar.addEventListener('click', async () => {
        if (!confirm('ATENÇÃO: Tem certeza que deseja zerar TODA a lista de presença? Esta ação não pode ser desfeita.')) {
            return;
        }
        await apiRequest('/clean', { method: 'DELETE' }, (data) => {
            quantidadeAtualEl.textContent = data.novaQuantidade;
            updateStatus(data.mensagem, 'success');
        });
    });

    btnGerarQRCode.addEventListener('click', async () => {
        updateStatus('Gerando QR Code, aguarde...', 'info');
        await apiRequest('/adm/gerar-qrcode', { method: 'GET' }, (data) => {
            const qrCodeMessage = `${data.mensagem}<br>Arquivo: <strong>${data.arquivo}</strong><br>URL: ${data.url}`;
            updateStatus(qrCodeMessage, 'success');
        });
    });

    // Carregar a contagem inicial ao carregar a página
    fetchQuantidade();
});