document.addEventListener('DOMContentLoaded', () => {
    // Elementos da UI
    const atualizacaoContagemEl = document.getElementById('atualizacaoContagem');
    const listaCheckinsEl = document.getElementById('listaCheckins');
    const checkinsVazioEl = document.getElementById('checkinsVazio');
    const statusEl = document.getElementById('status');
    const listaSalasEl = document.getElementById('listaSalas');
    const qrManagementCard = document.getElementById('qrManagementCard');
    const listaQrCodesEl = document.getElementById('listaQrCodes');
    const qrsVazioEl = document.getElementById('qrsVazio');
    const resumoQrsEl = document.getElementById('resumoQrs');
    const btnCriarQrDisponivel = document.getElementById('btnCriarQrDisponivel');
    document.querySelectorAll('[data-painel-toggle]').forEach(botao => {
        const conteudo = document.getElementById(botao.getAttribute('aria-controls'));
        let expandido = true;

        function atualizarToggle() {
            conteudo.hidden = !expandido;
            botao.textContent = expandido ? '\u25B2' : '\u25BC';
            botao.setAttribute('aria-expanded', String(expandido));

            const acao = expandido ? 'Recolher' : 'Expandir';
            const nomePainel = botao.dataset.painelToggle;
            botao.setAttribute('aria-label', `${acao} ${nomePainel}`);
            botao.title = `${acao} ${nomePainel}`;
        }

        atualizarToggle();

        botao.addEventListener('click', () => {
            expandido = !expandido;
            atualizarToggle();
        });
    });
    let qrCodesTenant = [];
    let podeConsultarQrs = false;
    let salasTenant = [];
    let podeGerenciarQrs = false;

    // Botões
    const btnAtualizarQtd = document.getElementById('btnAtualizarQtd');
    const btnAddPresenca = document.getElementById('btnAddPresenca');
    const btnCadastrarUsuario = document.getElementById('btnCadastrarUsuario');
    const btnAddSala = document.getElementById('btnAddSala');
    const cadastroUsuarioDialog = document.getElementById('cadastroUsuarioDialog');
    const cadastroUsuarioForm = document.getElementById('cadastroUsuarioForm');
    const nomeUsuarioInput = document.getElementById('nomeUsuarioInput');
    const consentimentoUsuario = document.getElementById('consentimentoUsuario');
    const videoCadastroUsuario = document.getElementById('videoCadastroUsuario');
    const cameraCadastroStage = document.getElementById('cameraCadastroStage');
    const statusCadastroUsuario = document.getElementById('statusCadastroUsuario');
    const btnConfirmarCadastro = document.getElementById('btnConfirmarCadastro');
    const btnCancelarCadastro = document.getElementById('btnCancelarCadastro');
    let atualizandoCheckins = false;
    let capturaUsuarioController;

    // Estilização dos botões de Adicionar (Verde - Igual ao Relatório)
    [btnAddPresenca, btnAddSala].forEach(btn => {
        if (btn) {
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
        statusEl.replaceChildren();
        const paragraph = document.createElement('p');
        paragraph.textContent = message;
        statusEl.appendChild(paragraph);
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
            const data = response.status === 204 ? {} : await response.json();

            if (!response.ok) {
                throw new Error(data.mensagem || `Erro ${response.status}`);
            }

            if (callback) {
                await callback(data);
            }
            return data;
        } catch (error) {
            console.error(`Erro na requisição para ${url}:`, error);
            updateStatus(`Erro: ${error.message}`, 'error');
        }
    }

    function mostrarQrCode(data, filename, message = '', type = 'success') {
        statusEl.replaceChildren();
        statusEl.className = `status-message ${type}`;

        if (message) {
            const feedback = document.createElement('p');
            feedback.textContent = message;
            statusEl.appendChild(feedback);
        }

        const img = document.createElement('img');
        img.src = data.qrCodeDataUri;
        img.alt = 'QR Code de check-in';
        img.style.maxWidth = '300px';
        img.style.display = 'block';
        img.style.margin = '10px auto';

        const download = document.createElement('a');
        download.href = data.qrCodeDataUri;
        download.download = filename;
        download.textContent = 'Baixar QR Code';
        download.style.display = 'inline-block';
        download.style.margin = '10px';

        const warning = document.createElement('p');
        warning.textContent = 'Guarde esta imagem. Este QR pode ser exibido novamente enquanto estiver disponível para a sala.';
        statusEl.append(img, download, warning);
    }

    async function configurarSessaoTenant() {
        const response = await fetch('/api/tenant/auth/session', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) {
            window.location.replace('/login');
            return;
        }

        const tenant = data.tenant;
        document.getElementById('tenantNameDisplay').textContent = tenant.name;
        const manage = ['owner', 'admin'].includes(tenant.role);
        podeGerenciarQrs = manage;
        podeConsultarQrs = ['owner', 'admin', 'operator'].includes(tenant.role);
        document.getElementById('attendanceDashboardCard').hidden =
            !['owner', 'admin', 'operator', 'viewer'].includes(tenant.role);
        const podeVerAcoesPresenca = ['owner', 'admin', 'operator'].includes(tenant.role);
        btnAddPresenca.hidden = !podeVerAcoesPresenca;
        btnCadastrarUsuario.hidden = !podeVerAcoesPresenca;
        document.getElementById('roomManagementCard').hidden = !manage;
        qrManagementCard.hidden = !manage;
        btnCriarQrDisponivel.hidden = !manage;
        btnCriarQrDisponivel.disabled = !manage;
        btnAddSala.disabled = !manage;
        btnCadastrarUsuario.disabled = !manage;
        document.querySelector('a[href="/relatorio"]').hidden =
            !['owner', 'admin', 'viewer'].includes(tenant.role);
        document.querySelector('a[href="/teste-rosto"]').hidden = !manage;
    }

    // --- GERENCIAMENTO DE SALAS ---

    async function carregarSalas() {
        await apiRequest('/api/tenant/rooms', { method: 'GET' }, (data) => {
            salasTenant = Array.isArray(data.salas) ? data.salas : [];
            const salas = salasTenant;

            listaSalasEl.innerHTML = '';

            salas.forEach(sala => {
                const salaAberta = sala.status === 'open';

                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.style.padding = '8px 0';
                li.style.borderBottom = '1px solid #eee';

                const spanNome = document.createElement('span');
                spanNome.textContent = `${sala.nome} (${salaAberta ? 'aberta' : 'fechada'})`;
                spanNome.style.fontWeight = '500';
                li.appendChild(spanNome);

                const divBotoes = document.createElement('div');
                divBotoes.className = 'room-actions';

                const btnQrCode = document.createElement('button');
                btnQrCode.type = 'button';
                btnQrCode.textContent = 'QR Code';
                btnQrCode.className = 'action-button';
                btnQrCode.setAttribute('aria-label', `QR Code da sala ${sala.nome}`);
                btnQrCode.addEventListener('click', () => exibirQrDaSala(sala.id));
                divBotoes.appendChild(btnQrCode);

                const btnMonitorar = document.createElement('a');
                const parametrosMonitor = new URLSearchParams({ roomId: String(sala.id) });
                btnMonitorar.href = `/adm/monitor-facial?${parametrosMonitor}`;
                btnMonitorar.className = 'action-button btn-secondary';
                btnMonitorar.textContent = 'Monitorar';
                btnMonitorar.target = '_blank';
                btnMonitorar.rel = 'noopener';
                btnMonitorar.setAttribute('aria-label', `Monitorar presença da sala ${sala.nome}`);
                divBotoes.appendChild(btnMonitorar);

                const btnZerar = document.createElement('button');
                btnZerar.textContent = 'Zerar';
                btnZerar.className = 'action-button btn-warning';
                btnZerar.addEventListener('click', () => zerarHistoricoSala(sala.id, sala.nome));
                divBotoes.appendChild(btnZerar);

                const btnFechar = document.createElement('button');
                btnFechar.textContent = salaAberta ? 'Fechar sala' : 'Reabrir sala';
                btnFechar.className = `action-button ${salaAberta ? 'btn-danger' : 'btn-success'}`;
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
        await apiRequest('/api/tenant/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: sala }),
        }, async () => {
            input.value = '';
            updateStatus('Sala criada na organização.', 'success');
            await carregarSalas();
        });
    }

    function formatarDataQr(valor) {
        if (!valor) return 'Data indisponível';
        const data = new Date(valor);
        if (Number.isNaN(data.getTime())) return 'Data indisponível';

        return new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
        }).format(data);
    }

    function criarBotaoQr(texto, classe, acao, title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `action-button ${classe}`;
        button.textContent = texto;
        if (title) button.title = title;
        button.addEventListener('click', acao);
        return button;
    }

    function renderizarQrCodes(data) {
        const qrsUtilizaveis = qrCodesTenant.filter(qr => qr.status !== 'revoked');
        listaQrCodesEl.replaceChildren();

        const limite = Number.isInteger(data.limite) ? data.limite : 10;
        const quantidadeAtiva = Number.isInteger(data.quantidadeAtiva)
            ? data.quantidadeAtiva
            : qrsUtilizaveis.length;

        resumoQrsEl.textContent =
            `${quantidadeAtiva} de ${limite} QR Code(s) em uso ou disponíveis.`;
        btnCriarQrDisponivel.disabled =
            !podeGerenciarQrs || quantidadeAtiva >= limite;

        if (qrsUtilizaveis.length === 0) {
            qrsVazioEl.hidden = false;
            qrsVazioEl.textContent =
                'Nenhum QR Code reutilizável foi criado.';
            return;
        }

        qrsVazioEl.hidden = true;
        const salasJaAssociadas = new Set(
            qrsUtilizaveis
                .filter(qr => qr.status === 'active' && qr.roomId)
                .map(qr => String(qr.roomId)),
        );

        qrsUtilizaveis.forEach(qr => {
            const item = document.createElement('li');
            item.className = 'qr-code-item';

            const cabecalho = document.createElement('div');
            cabecalho.className = 'qr-code-header';

            const identificacao = document.createElement('strong');
            const codigoQr = `QR ${String(qr.id).slice(-6).toUpperCase()}`;
            const apelido = typeof qr.apelido === 'string'
                ? qr.apelido.trim()
                : '';
            identificacao.textContent = apelido || codigoQr;
            identificacao.title = apelido
                ? `${apelido} - Identificador ${codigoQr}`
                : codigoQr;
            identificacao.setAttribute(
                'aria-label',
                apelido
                    ? `QR Code ${apelido}, identificador ${codigoQr}`
                    : codigoQr,
            );

            const situacao = document.createElement('span');
            situacao.className =
                qr.status === 'active'
                    ? 'qr-status qr-status-active'
                    : 'qr-status qr-status-available';
            situacao.textContent =
                qr.status === 'active' ? 'Em uso' : 'Disponível';

            cabecalho.append(identificacao, situacao);

            const sala = document.createElement('p');
            sala.className = 'qr-code-room';
            sala.textContent =
                qr.status === 'active'
                    ? `Sala: ${qr.roomName || 'Sala não encontrada'}`
                    : 'Sala: ainda não associado';

            const criacao = document.createElement('p');
            criacao.className = 'qr-code-date';
            criacao.textContent = `Criado em: ${formatarDataQr(qr.criadaEm)}`;

            const acoes = document.createElement('div');
            acoes.className = 'qr-code-actions';

            if (qr.status === 'active') {
                acoes.append(
                    criarBotaoQr(
                        'Exibir',
                        'btn-secondary',
                        () => exibirQrCodeExistente(qr),
                        'Exibir imagem do QR Code',
                    ),
                    criarBotaoQr(
                        'Liberar',
                        'btn-warning',
                        () => liberarQrCode(qr),
                        'Liberar QR Code da sala',
                    ),
                    criarBotaoQr(
                        'Revogar',
                        'btn-danger',
                        () => revogarQrCode(qr),
                        'Revogar QR Code permanentemente',
                    ),
                );
            } else {
                const select = document.createElement('select');
                select.className = 'qr-room-select';
                select.setAttribute(
                    'aria-label',
                    `Selecionar sala para o QR ${String(qr.id).slice(-6)}`,
                );

                const optionPadrao = document.createElement('option');
                optionPadrao.value = '';
                optionPadrao.textContent = 'Selecionar sala';
                select.appendChild(optionPadrao);

                salasTenant
                    .filter(salaAtual =>
                        !salasJaAssociadas.has(String(salaAtual.id)),
                    )
                    .forEach(salaAtual => {
                        const option = document.createElement('option');
                        option.value = String(salaAtual.id);
                        option.textContent =
                            `${salaAtual.nome} ` +
                            `(${salaAtual.status === 'open' ? 'aberta' : 'fechada'})`;
                        select.appendChild(option);
                    });

                const btnAssociar = criarBotaoQr(
                    'Associar à sala',
                    'btn-primary',
                    () => associarQrCode(qr, select.value),
                    'Associar QR Code a esta sala',
                );
                btnAssociar.disabled = select.options.length <= 1;

                acoes.append(
                    select,
                    btnAssociar,
                    criarBotaoQr(
                        'Revogar',
                        'btn-danger',
                        () => revogarQrCode(qr),
                        'Revogar QR Code permanentemente',
                    ),
                );
            }

            const editorApelido = document.createElement('div');
            editorApelido.className = 'qr-alias-editor';

            const labelApelido = document.createElement('label');
            labelApelido.textContent = 'Apelido do QR Code';
            labelApelido.htmlFor = `apelido-qr-${qr.id}`;

            const inputApelido = document.createElement('input');
            inputApelido.id = `apelido-qr-${qr.id}`;
            inputApelido.className = 'qr-alias-input';
            inputApelido.type = 'text';
            inputApelido.maxLength = 80;
            inputApelido.value = qr.apelido || '';
            inputApelido.placeholder = 'Ex.: Entrada Principal';
            inputApelido.setAttribute(
                'aria-label',
                `Apelido do QR Code ${String(qr.id).slice(-6)}`,
            );

            const btnSalvarApelido = criarBotaoQr(
                'Salvar apelido',
                'btn-primary',
                () => salvarApelidoQrCode(qr, inputApelido.value),
                'Salvar apelido do QR Code',
            );

            editorApelido.append(labelApelido, inputApelido, btnSalvarApelido);
            acoes.appendChild(editorApelido);

            item.append(cabecalho, sala, criacao, acoes);
            listaQrCodesEl.appendChild(item);
        });
    }

    async function carregarQrs() {
        if (!podeConsultarQrs || qrManagementCard.hidden) return false;

        let sucesso = false;
        await apiRequest('/api/tenant/qrcodes', { method: 'GET' }, data => {
            qrCodesTenant = Array.isArray(data.qrcodes)
                ? data.qrcodes
                : [];
            renderizarQrCodes(data);
            sucesso = true;
        });

        return sucesso;
    }

    async function criarQrDisponivel() {
        btnCriarQrDisponivel.disabled = true;

        await apiRequest('/api/tenant/qrcodes', { method: 'POST' }, async data => {
            mostrarQrCode(
                data.qrcode,
                `qrcode_disponivel_${data.qrcode.id}.png`,
                'QR Code criado e disponível para associação.',
            );
            await carregarQrs();
            statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        btnCriarQrDisponivel.disabled = false;
        await carregarQrs();
    }

    async function associarQrCode(qr, roomId) {
        if (!roomId) {
            updateStatus('Selecione uma sala para associar o QR Code.', 'error');
            return;
        }

        await apiRequest(`/api/tenant/qrcodes/${qr.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId }),
        }, async () => {
            updateStatus('QR Code associado à sala.', 'success');
            await carregarQrs();
            await exibirQrCodeExistente({ ...qr, roomId, status: 'active' });
        });
    }

    async function salvarApelidoQrCode(qr, apelido) {
        await apiRequest(`/api/tenant/qrcodes/${qr.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apelido: apelido.trim() }),
        }, async () => {
            updateStatus(
                apelido.trim()
                    ? 'Apelido do QR Code salvo com sucesso.'
                    : 'Apelido do QR Code removido.',
                'success',
            );
            await carregarQrs();
        });
    }

    async function liberarQrCode(qr) {
        const nomeSala = qr.roomName || 'a sala atual';
        if (!confirm(`Liberar este QR Code de "${nomeSala}" para reutilização?`)) {
            return;
        }

        await apiRequest(`/api/tenant/qrcodes/${qr.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: null }),
        }, async () => {
            updateStatus('QR Code liberado e disponível para outra sala.', 'success');
            await carregarQrs();
        });
    }

    async function revogarQrCode(qr) {
        if (!confirm('Revogar permanentemente este QR Code? Essa ação não pode ser desfeita.')) {
            return;
        }

        await apiRequest(`/api/tenant/qrcodes/${qr.id}`, {
            method: 'DELETE',
        }, async () => {
            updateStatus('QR Code revogado com sucesso.', 'success');
            await carregarQrs();
        });
    }

    async function exibirQrCodeExistente(qr) {
        if (qr.status !== 'active') {
            updateStatus(
                'Associe o QR Code a uma sala antes de exibir a imagem.',
                'error',
            );
            return;
        }

        await apiRequest(`/api/tenant/qrcodes/${qr.id}/visual`, {
            method: 'GET',
        }, data => {
            mostrarQrCode(
                data.qrcode,
                `qrcode_${qr.roomId || qr.id}.png`,
            );
            statusEl.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        });
    }

    async function alterarEstadoSala(sala) {
        const aberta = sala.status !== 'open';
        const acao = aberta ? 'reabrir' : 'fechar';
        if (!confirm(`Deseja ${acao} a sala "${sala.nome}"? ${aberta ? '' : 'O QR Code deixará de aceitar check-ins.'}`)) return;
        await apiRequest(`/api/tenant/rooms/${sala.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: aberta ? 'open' : 'closed' }),
        }, () => {
            updateStatus(`Sala ${aberta ? 'reaberta' : 'fechada'}.`, 'success');
            carregarSalas();
        });
    }

    async function zerarHistoricoSala(salaId, salaNome) {
        if (!confirm(`Tem certeza que deseja zerar a contagem da sala "${salaNome}"?`)) return;

        await apiRequest(`/api/tenant/attendances?roomId=${encodeURIComponent(salaId)}`, { method: 'DELETE' }, (data) => {
            updateStatus(`Presenças removidas da sala "${salaNome}": ${data.registrosRemovidos}.`, 'success');
            atualizarCheckins();
        });
    }

    async function removerSala(salaId, salaNome) {
        if (!confirm(`Arquivar a sala "${salaNome}"? O histórico será preservado e a sala deixará de aceitar check-ins.`)) return;

        await apiRequest(`/api/tenant/rooms/${encodeURIComponent(salaId)}`, { method: 'DELETE' }, () => {
            updateStatus('Sala arquivada; o histórico foi preservado.', 'success');
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
            const response = await fetch('/api/tenant/dashboard', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.mensagem || 'Falha ao carregar o painel.');
            const salasAtivas = (Array.isArray(data.salas) ? data.salas : [])
                .filter(sala => sala.aberta && sala.nome?.trim() && sala.id != null);

            if (salasAtivas.length === 0) {
                checkinsVazioEl.textContent = 'salas inexistentes';
            } else {
                checkinsVazioEl.hidden = true;
                salasAtivas.forEach(sala => {
                    const item = document.createElement('li');
                    item.className = 'checkin-room';

                    const nome = document.createElement('strong');
                    const identificacaoAula = sala.aulaNome
                        ? `Aula: ${sala.aulaNome}`
                        : '';
                    const identificacaoProfessor = sala.professorNome
                        ? `Professor: ${sala.professorNome}`
                        : '';

                    nome.textContent = [
                        sala.nome,
                        identificacaoAula,
                        identificacaoProfessor,
                    ].filter(Boolean).join(' · ');

                    const total = document.createElement('span');
                    total.className = 'checkin-count';
                    total.textContent = `${sala.quantidade} ${sala.quantidade === 1 ? 'check-in' : 'check-ins'}`;

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
    btnAddPresenca.addEventListener('click', () => {
        window.location.href = '/adm/adicionar-manual';
    });

    btnCadastrarUsuario.addEventListener('click', () => {
        cadastroUsuarioForm.reset();
        cadastroUsuarioDialog.classList.remove('capture-active');
        cadastroUsuarioDialog.removeAttribute('data-capture-state');
        cameraCadastroStage.hidden = true;
        statusCadastroUsuario.textContent = '';
        cadastroUsuarioDialog.showModal();
        nomeUsuarioInput.focus();
    });

    btnCancelarCadastro.addEventListener('click', () => {
        if (capturaUsuarioController) {
            capturaUsuarioController.abort();
            return;
        }
        cadastroUsuarioDialog.close();
    });

    cadastroUsuarioDialog.addEventListener('cancel', event => {
        if (capturaUsuarioController) {
            event.preventDefault();
            capturaUsuarioController.abort();
        }
    });

    cadastroUsuarioForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nome = nomeUsuarioInput.value.trim();
        if (!nome) {
            statusCadastroUsuario.textContent = 'Informe o nome completo.';
            nomeUsuarioInput.focus();
            return;
        }
        if (!consentimentoUsuario.checked) {
            statusCadastroUsuario.textContent = 'Confirme o consentimento antes de usar a câmera.';
            consentimentoUsuario.focus();
            return;
        }

        btnConfirmarCadastro.disabled = true;
        cadastroUsuarioDialog.classList.add('capture-active');
        cameraCadastroStage.hidden = false;
        capturaUsuarioController = new AbortController();
        try {
            const descritor = await FaceRecognition.capturarDescritorFacial(
                videoCadastroUsuario,
                status => { statusCadastroUsuario.textContent = status; },
                (state, message) => {
                    cadastroUsuarioDialog.dataset.captureState = state;
                    statusCadastroUsuario.textContent = message;
                },
                capturaUsuarioController.signal,
            );
            const response = await fetch('/api/tenant/biometrics/enroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, descritor, consentimento: true }),
            });
            const data = await response.json();
            if (!response.ok || !data.sucesso) {
                throw new Error(data.mensagem || 'Não foi possível cadastrar o usuário.');
            }

            cadastroUsuarioDialog.close();
            updateStatus(`Usuário "${nome}" cadastrado com sucesso.`, 'success');
            carregarPerfisFaciais();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Erro ao cadastrar usuário:', error);
            }
            cadastroUsuarioDialog.classList.remove('capture-active');
            cameraCadastroStage.hidden = true;
            cadastroUsuarioDialog.removeAttribute('data-capture-state');
            statusCadastroUsuario.textContent = error.name === 'AbortError'
                ? 'Captura cancelada. Você pode tentar novamente.'
                : error.message || window.FaceRecognition?.mensagemErroFacial(error) ||
                    'Não foi possível cadastrar o usuário.';
        } finally {
            capturaUsuarioController = undefined;
            btnConfirmarCadastro.disabled = false;
            btnCancelarCadastro.disabled = false;
        }
    });

    let exibindoQrPorSala = new Map();

    async function exibirQrDaSala(salaId) {
        if (exibindoQrPorSala.get(salaId)) return;
        exibindoQrPorSala.set(salaId, true);

        try {
            const ok = await carregarQrs();
            if (!ok) return;

            const associado = qrCodesTenant.find(qr =>
                qr.roomId === salaId && qr.status === 'active',
            );

            if (associado) {
                await exibirQrCodeExistente(associado);
                return;
            }

            const disponivel = qrCodesTenant.find(qr =>
                qr.status === 'available' && !qr.roomId,
            );

            if (disponivel) {
                await apiRequest(`/api/tenant/qrcodes/${disponivel.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: salaId }),
                }, async data => {
                    updateStatus(
                        'QR Code disponível reutilizado para esta sala.',
                        'success',
                    );
                    await carregarQrs();
                    await exibirQrCodeExistente(data.qrcode);
                });
                return;
            }

            await apiRequest('/api/tenant/qrcodes', {
                method: 'POST',
            }, async data => {
                const associacao = await apiRequest(
                    `/api/tenant/qrcodes/${data.qrcode.id}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roomId: salaId }),
                    },
                );

                if (!associacao) {
                    mostrarQrCode(
                        data.qrcode,
                        `qrcode_sala_${salaId}.png`,
                        'O QR foi criado, mas não pôde ser associado à sala.',
                        'error',
                    );
                    await carregarQrs();
                    return;
                }

                mostrarQrCode(
                    data.qrcode,
                    `qrcode_sala_${salaId}.png`,
                    'QR Code criado e associado à sala.',
                );
                await carregarQrs();
                statusEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            });
        } finally {
            exibindoQrPorSala.delete(salaId);
        }
    }

    btnAddSala.addEventListener('click', adicionarSala);
    btnCriarQrDisponivel.addEventListener('click', criarQrDisponivel);

    // Carregar a contagem inicial e as salas ao carregar a página
    configurarSessaoTenant().then(() => {
        atualizarCheckins();
        carregarSalas();
        window.setInterval(atualizarCheckins, 60 * 1000);
    }).catch(error => {
        console.error('[adm] Erro ao inicializar o painel:', error);
        updateStatus(`Erro ao verificar sessão: ${error.message}`, 'error');
    });
});