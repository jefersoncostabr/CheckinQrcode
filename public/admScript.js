document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const atualizacaoContagemEl = document.getElementById('atualizacaoContagem');
    const listaCheckinsEl = document.getElementById('listaCheckins');
    const checkinsVazioEl = document.getElementById('checkinsVazio');
    const statusEl = document.getElementById('status');
    const salaFiltro = document.getElementById('salaFiltro');
    const salaSelect = document.getElementById('salaSelect');
    const salaQrSelect = document.getElementById('salaQrSelect');
    const listaSalasEl = document.getElementById('listaSalas');
    const listaQrsEl = document.getElementById('listaQrs');
    const qrLimiteEl = document.getElementById('qrLimite');

    // Botões
    const btnAtualizarQtd = document.getElementById('btnAtualizarQtd');
    const btnReduzir = document.getElementById('btnReduzir');
    const btnAddPresenca = document.getElementById('btnAddPresenca');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnGerarQRCode = document.getElementById('btnGerarQRCode');
    const btnAddSala = document.getElementById('btnAddSala');
    const btnCriarQr = document.getElementById('btnCriarQr');
    let atualizandoCheckins = false;

    // Estilização dos botões de Adicionar (Verde - Igual ao Relatório)
    [btnAddPresenca, btnAddSala].forEach(btn => {
        if (btn) {
            btn.style.backgroundColor = '#28a745'; // Verde sucesso
            btn.style.color = '#ffffff';
            btn.style.border = 'none';
            btn.style.padding = '8px 16px';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
        }
    });

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
                opt.value = sala.id;
                opt.textContent = `${sala.id} - ${sala.nome}${sala.aberta ? '' : ' (fechada)'}`;
                opt.dataset.nome = sala.nome;
                salaFiltro.appendChild(opt);

                const opt2 = opt.cloneNode(true);
                salaSelect.appendChild(opt2);

                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.padding = '8px 0';
                li.style.borderBottom = '1px solid #eee';

                const spanNome = document.createElement('span');
                spanNome.textContent = `${sala.id} - ${sala.nome} (${sala.aberta ? 'aberta' : 'fechada'})`;
                spanNome.style.fontWeight = '500';
                li.appendChild(spanNome);

                const divBotoes = document.createElement('div');
                divBotoes.className = 'room-actions';

                const btnZerar = document.createElement('button');
                btnZerar.textContent = 'Zerar';
                btnZerar.className = 'action-button btn-warning';
                btnZerar.addEventListener('click', () => zerarHistoricoSala(sala.id, sala.nome));
                divBotoes.appendChild(btnZerar);

                const btnFechar = document.createElement('button');
                btnFechar.textContent = sala.aberta ? 'Fechar sala' : 'Reabrir sala';
                btnFechar.className = `action-button ${sala.aberta ? 'btn-danger' : 'btn-success'}`;
                btnFechar.addEventListener('click', () => alterarEstadoSala(sala));
                divBotoes.appendChild(btnFechar);

                const btnExcluir = document.createElement('button');
                btnExcluir.textContent = 'Excluir';
                btnExcluir.className = 'action-button btn-danger';
                btnExcluir.addEventListener('click', () => removerSala(sala.id, sala.nome));
                divBotoes.appendChild(btnExcluir);

                li.appendChild(divBotoes);
                listaSalasEl.appendChild(li);
            });

            atualizarCheckins();
        });
        carregarQrs();
    }

    async function adicionarSala() {
        const input = document.getElementById('salaInput');
        const sala = input.value.trim();
        if (!sala) {
            updateStatus('Digite o nome da sala antes de adicionar.', 'error');
            return;
        }
        if (!salaQrSelect.value) {
            updateStatus('Selecione um QR Code disponível para a sala.', 'error');
            return;
        }

        await apiRequest('/api/salas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sala,
                ...(salaQrSelect.value !== 'auto' ? { qrId: Number(salaQrSelect.value) } : {}),
            })
        }, (data) => {
            input.value = '';
            updateStatus('Sala adicionada com sucesso.', 'success');
            carregarSalas();
        });
    }

    async function carregarQrs() {
        await apiRequest('/api/qrcodes', { method: 'GET' }, (data) => {
            const qrcodes = Array.isArray(data.qrcodes) ? data.qrcodes : [];
            const disponiveis = qrcodes.filter(qr => qr.estado === 'disponivel');
            qrLimiteEl.textContent = `${data.quantidadeAtiva} de ${data.limite} QR codes ativos`;
            listaQrsEl.innerHTML = '';
            salaQrSelect.innerHTML = disponiveis.length
                ? '<option value="">Selecione um QR Code disponível</option>'
                : '<option value="auto">Criar QR automaticamente</option>';

            disponiveis.forEach(qr => {
                const li = document.createElement('li');
                li.append(`${qr.id} - disponível`);
                const option = document.createElement('option');
                option.value = qr.id;
                option.textContent = `QR ${qr.id}`;
                salaQrSelect.appendChild(option);

                const button = document.createElement('button');
                button.textContent = 'Excluir QR';
                button.className = 'action-button btn-danger';
                button.style.marginLeft = '12px';
                button.addEventListener('click', () => excluirQr(qr));
                li.appendChild(button);
                listaQrsEl.appendChild(li);
            });
            if (!disponiveis.length && data.quantidadeAtiva >= data.limite) {
                salaQrSelect.value = 'auto';
            }
        });
    }

    async function criarQr() {
        await apiRequest('/api/qrcodes', { method: 'POST' }, () => {
            updateStatus('QR Code disponível criado.', 'success');
            carregarQrs();
        });
    }

    async function excluirQr(qr) {
        if (qr.estado !== 'disponivel' || !confirm(`Excluir o QR Code disponível ${qr.id}?`)) return;
        await apiRequest(`/api/qrcodes/${qr.id}`, { method: 'DELETE' }, () => {
            updateStatus(`QR Code ${qr.id} excluído.`, 'success');
            carregarQrs();
        });
    }

    async function alterarEstadoSala(sala) {
        const aberta = !sala.aberta;
        const acao = aberta ? 'reabrir' : 'fechar';
        if (!confirm(`Deseja ${acao} a sala "${sala.nome}"? ${aberta ? '' : 'O QR Code deixará de aceitar check-ins.'}`)) return;
        await apiRequest(`/api/salas/${sala.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aberta }),
        }, () => {
            updateStatus(`Sala ${aberta ? 'reaberta' : 'fechada'}.`, 'success');
            carregarSalas();
        });
    }

    async function zerarHistoricoSala(salaId, salaNome) {
        if (!confirm(`Tem certeza que deseja zerar a contagem da sala "${salaNome}"?`)) return;

        await apiRequest(`/clean?sala=${encodeURIComponent(salaId)}`, { method: 'DELETE' }, (data) => {
            updateStatus(`Contagem da sala "${salaNome}" zerada com sucesso.`, 'success');
            atualizarCheckins();
        });
    }

    async function removerSala(salaId, salaNome) {
        if (!confirm(`Tem certeza que deseja remover a sala "${salaNome}" e seus registros? O QR ${salaId} ficará inativo e não poderá ser reutilizado.`)) return;

        await apiRequest(`/api/salas?sala=${encodeURIComponent(salaId)}`, { method: 'DELETE' }, (data) => {
            updateStatus(`Sala removida. Registros de check-in excluídos: ${data.registrosRemovidos}.`, 'success');
            carregarSalas();
        });
    }

    // --- FUNÇÕES DE AÇÃO ---

    async function atualizarCheckins() {
        if (atualizandoCheckins) return;
        atualizandoCheckins = true;
        btnAtualizarQtd.disabled = true;
        checkinsVazioEl.hidden = false;
        checkinsVazioEl.textContent = 'Atualizando check-ins...';
        listaCheckinsEl.replaceChildren();

        try {
            const [salasResponse, contagemResponse] = await Promise.all([
                fetch('/api/salas'),
                fetch('/qtd'),
            ]);
            const [salasData, contagemData] = await Promise.all([
                salasResponse.json(),
                contagemResponse.json(),
            ]);

            if (!salasResponse.ok) throw new Error(salasData.mensagem || 'Falha ao carregar as salas.');
            if (!contagemResponse.ok) throw new Error(contagemData.mensagem || 'Falha ao carregar os check-ins.');

            const salasAtivas = (Array.isArray(salasData.salas) ? salasData.salas : [])
                .filter(sala => sala.aberta && sala.nome?.trim() && sala.id != null);

            if (salasAtivas.length === 0) {
                checkinsVazioEl.textContent = 'salas inexistentes';
            } else {
                checkinsVazioEl.hidden = true;
                salasAtivas.forEach(sala => {
                    const item = document.createElement('li');
                    item.className = 'checkin-room';

                    const nome = document.createElement('strong');
                    nome.textContent = sala.nome;

                    const quantidade = Number(contagemData.salas?.[sala.nome]) || 0;
                    const total = document.createElement('span');
                    total.className = 'checkin-count';
                    total.textContent = `${quantidade} ${quantidade === 1 ? 'check-in' : 'check-ins'}`;

                    item.append(nome, total);
                    listaCheckinsEl.appendChild(item);
                });
            }

            const agora = new Date();
            atualizacaoContagemEl.textContent = agora.toLocaleTimeString('pt-BR');
            atualizacaoContagemEl.dateTime = agora.toISOString();
        } catch (error) {
            console.error('Erro ao atualizar check-ins:', error);
            checkinsVazioEl.textContent = 'Não foi possível carregar os check-ins.';
            updateStatus(`Erro ao atualizar check-ins: ${error.message}`, 'error');
        } finally {
            atualizandoCheckins = false;
            btnAtualizarQtd.disabled = false;
        }
    }

    // --- EVENT LISTENERS ---

    btnAtualizarQtd.addEventListener('click', atualizarCheckins);
    btnCriarQr.addEventListener('click', criarQr);

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
            atualizarCheckins();
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
            atualizarCheckins();
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
            img.alt = `QR Code para ${salaSelect.selectedOptions[0].textContent}`;
            img.style.maxWidth = '300px';
            img.style.display = 'block';
            img.style.margin = '10px auto';

            // Cria e exibe o botão/link de download
            const downloadLink = document.createElement('a');
            downloadLink.href = data.qrCodeDataUri;
            downloadLink.download = `qrcode_sala_${sala}.png`;
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
    window.setInterval(atualizarCheckins, 60 * 1000);
});