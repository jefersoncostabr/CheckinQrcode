document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const quantidadeAtualEl = document.getElementById('quantidadeAtual');
    const statusEl = document.getElementById('status');
    const salaFiltro = document.getElementById('salaFiltro');
    const salaSelect = document.getElementById('salaSelect');
    const listaSalasEl = document.getElementById('listaSalas');

    // Botões
    const btnAtualizarQtd = document.getElementById('btnAtualizarQtd');
    const btnReduzir = document.getElementById('btnReduzir');
    const btnAddPresenca = document.getElementById('btnAddPresenca');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnGerarQRCode = document.getElementById('btnGerarQRCode');
    const btnAddSala = document.getElementById('btnAddSala');

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

    // --- GERENCIAMENTO DE SALAS ---

    async function carregarSalas() {
        await apiRequest('/api/salas', { method: 'GET' }, (data) => {
            const salas = Array.isArray(data.salas) ? data.salas : [];

            // Preenche o filtro e o select para QR Code
            salaFiltro.innerHTML = '<option value="">Todas as Salas</option>';
            salaSelect.innerHTML = '<option value="">Selecione uma sala</option>';
            listaSalasEl.innerHTML = '';

            salas.forEach(sala => {
                const opt = document.createElement('option');
                opt.value = sala;
                opt.textContent = sala;
                salaFiltro.appendChild(opt);

                const opt2 = opt.cloneNode(true);
                salaSelect.appendChild(opt2);

                const li = document.createElement('li');
                li.textContent = sala;
                const btnExcluir = document.createElement('button');
                btnExcluir.textContent = 'Excluir';
                btnExcluir.style.marginLeft = '10px';
                btnExcluir.addEventListener('click', () => removerSala(sala));
                li.appendChild(btnExcluir);
                listaSalasEl.appendChild(li);
            });

            // Atualiza a contagem com a sala selecionada
            fetchQuantidade();
        });
    }

    async function adicionarSala() {
        const input = document.getElementById('salaInput');
        const sala = input.value.trim();
        if (!sala) {
            updateStatus('Digite o nome da sala antes de adicionar.', 'error');
            return;
        }

        await apiRequest('/api/salas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sala })
        }, (data) => {
            input.value = '';
            updateStatus('Sala adicionada com sucesso.', 'success');
            carregarSalas();
        });
    }

    async function removerSala(sala) {
        if (!confirm(`Tem certeza que deseja remover a sala "${sala}"?`)) return;

        await apiRequest(`/api/salas?sala=${encodeURIComponent(sala)}`, { method: 'DELETE' }, (data) => {
            updateStatus('Sala removida com sucesso.', 'success');
            carregarSalas();
        });
    }

    // --- FUNÇÕES DE AÇÃO ---

    /**
     * Busca e atualiza a contagem atual de pessoas.
     */
    async function fetchQuantidade() {
        const sala = salaFiltro.value;
        const url = sala ? `/qtd?sala=${encodeURIComponent(sala)}` : '/qtd';
        quantidadeAtualEl.textContent = 'Carregando...';

        await apiRequest(url, { method: 'GET' }, (data) => {
            quantidadeAtualEl.textContent = data.quantidade;
            updateStatus('Contagem atualizada com sucesso.', 'success');
        });
    }

    // --- EVENT LISTENERS ---

    btnAtualizarQtd.addEventListener('click', fetchQuantidade);

    salaFiltro.addEventListener('change', () => {
        fetchQuantidade();
    });

    btnAddPresenca.addEventListener('click', () => {
        window.location.href = '/adm/adicionar-manual';
    });

    btnReduzir.addEventListener('click', async () => {
        const sala = salaFiltro.value;
        if (!sala) {
            updateStatus('Selecione a sala para reduzir o último check-in.', 'error');
            return;
        }

        if (!confirm('Tem certeza que deseja remover o último check-in desta sala? Esta ação não pode ser desfeita.')) {
            return;
        }

        await apiRequest(`/reduce?sala=${encodeURIComponent(sala)}`, { method: 'DELETE' }, (data) => {
            quantidadeAtualEl.textContent = data.novaQuantidade;
            updateStatus(data.mensagem, 'success');
        });
    });

    btnLimpar.addEventListener('click', async () => {
        const sala = salaFiltro.value;
        if (!sala) {
            updateStatus('Selecione a sala para limpar o histórico.', 'error');
            return;
        }

        if (!confirm('ATENÇÃO: Tem certeza que deseja zerar a lista de presença desta sala? Esta ação não pode ser desfeita.')) {
            return;
        }

        await apiRequest(`/clean?sala=${encodeURIComponent(sala)}`, { method: 'DELETE' }, (data) => {
            quantidadeAtualEl.textContent = data.novaQuantidade;
            updateStatus(data.mensagem, 'success');
        });
    });

    btnGerarQRCode.addEventListener('click', async () => {
        const sala = salaSelect.value;
        if (!sala) {
            updateStatus('Selecione uma sala para gerar o QR Code.', 'error');
            return;
        }

        updateStatus('Gerando QR Code, aguarde...', 'info');
        await apiRequest(`/adm/gerar-qrcode?sala=${encodeURIComponent(sala)}`, { method: 'GET' }, (data) => {
            // Limpa a área de status antes de adicionar o novo conteúdo
            statusEl.innerHTML = '';
            statusEl.className = 'status-message success'; // Aplica a classe de sucesso

            // Cria e exibe a imagem do QR Code
            const img = document.createElement('img');
            img.src = data.qrCodeDataUri;
            img.alt = `QR Code para a sala ${sala}`;
            img.style.maxWidth = '300px';
            img.style.display = 'block';
            img.style.margin = '10px auto';

            // Cria e exibe o botão/link de download
            const downloadLink = document.createElement('a');
            downloadLink.href = data.qrCodeDataUri;
            downloadLink.download = `qrcode_${sala.replace(/\s+/g, '_')}.png`;
            downloadLink.innerText = 'Baixar QR Code';
            downloadLink.style.display = 'inline-block';
            downloadLink.style.marginTop = '15px';
            downloadLink.style.padding = '10px 15px';
            downloadLink.style.backgroundColor = '#007bff';
            downloadLink.style.color = 'white';
            downloadLink.style.textDecoration = 'none';
            downloadLink.style.borderRadius = '5px';

            // Adiciona os novos elementos à página
            statusEl.appendChild(img);
            statusEl.appendChild(downloadLink);
        });
    });

    btnAddSala.addEventListener('click', adicionarSala);

    // Carregar a contagem inicial e as salas ao carregar a página
    carregarSalas();
});