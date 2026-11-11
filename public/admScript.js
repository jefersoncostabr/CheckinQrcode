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
    const listaPerfisFaciaisEl = document.getElementById('listaPerfisFaciais');
    let qrCodesTenant = [];
    let podeGerenciar = false;

    // Botões
    const btnAtualizarQtd = document.getElementById('btnAtualizarQtd');
    const btnReduzir = document.getElementById('btnReduzir');
    const btnAddPresenca = document.getElementById('btnAddPresenca');
    const btnCadastrarUsuario = document.getElementById('btnCadastrarUsuario');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnGerarQRCode = document.getElementById('btnGerarQRCode');
    const btnAddSala = document.getElementById('btnAddSala');
    const btnCriarQr = document.getElementById('btnCriarQr');
    const btnTenantLogout = document.getElementById('btnTenantLogout');
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

    function mostrarQrCode(data, filename) {
        statusEl.replaceChildren();
        statusEl.className = 'status-message success';

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
        warning.textContent = 'Guarde esta imagem. O token não pode ser recuperado depois; gerar outro invalida este QR.';
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
        podeGerenciar = manage;
        document.getElementById('attendanceDashboardCard').hidden =
            !['owner', 'admin', 'operator', 'viewer'].includes(tenant.role);
        document.getElementById('attendanceActionsCard').hidden =
            !['owner', 'admin', 'operator'].includes(tenant.role);
        document.getElementById('qrManagementCard').hidden =
            !['owner', 'admin', 'operator'].includes(tenant.role);
        document.getElementById('roomManagementCard').hidden = !manage;
        document.getElementById('biometricManagementCard').hidden = !manage;
        btnAddSala.disabled = !manage;
        btnCriarQr.disabled = !manage;
        btnGerarQRCode.disabled = !manage;
        btnCadastrarUsuario.disabled = !manage;
        btnReduzir.disabled = !manage;
        btnLimpar.disabled = !manage;
        document.querySelector('a[href="/relatorio"]').hidden =
            !['owner', 'admin', 'viewer'].includes(tenant.role);
        document.querySelector('a[href="/teste-rosto"]').hidden = !manage;
    }

    // --- GERENCIAMENTO DE SALAS ---

    async function carregarSalas() {
        await apiRequest('/api/tenant/rooms', { method: 'GET' }, (data) => {
            const salas = Array.isArray(data.salas) ? data.salas : [];

            // Preenche o filtro e o select para QR Code
            salaFiltro.innerHTML = '<option value="">Todas as Salas</option>';
            salaSelect.innerHTML = '<option value="">Selecione uma sala</option>';
            listaSalasEl.innerHTML = '';

            salas.forEach(sala => {
                const salaAberta = sala.status === 'open';
                const opt = document.createElement('option');
                opt.value = sala.id;
                opt.textContent = `${sala.nome}${salaAberta ? '' : ' (fechada)'}`;
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
                spanNome.textContent = `${sala.nome} (${salaAberta ? 'aberta' : 'fechada'})`;
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
            body: JSON.stringify({
                name: sala,
                ...(salaQrSelect.value ? { qrCodeId: salaQrSelect.value } : {}),
            }),
        }, async data => {
            input.value = '';
            updateStatus(salaQrSelect.value
                ? 'Sala criada e QR Code associado.'
                : 'Sala criada na organização.', 'success');
            salaQrSelect.value = '';
            await carregarSalas();
        });
    }

    async function carregarQrs() {
        if (document.getElementById('qrManagementCard').hidden) return;
        await apiRequest('/api/tenant/qrcodes', { method: 'GET' }, (data) => {
            const qrcodes = Array.isArray(data.qrcodes) ? data.qrcodes : [];
            qrCodesTenant = qrcodes;
            const limite = Number.isInteger(data.limite) ? data.limite : 10;
            const quantidadeAtiva = Number.isInteger(data.quantidadeAtiva)
                ? data.quantidadeAtiva
                : qrcodes.filter(qr => qr.status !== 'revoked').length;
            const disponiveis = qrcodes.filter(qr => qr.status === 'available');
            qrLimiteEl.textContent = `${quantidadeAtiva}/${limite} QR codes ativos`;
            btnCriarQr.disabled = !podeGerenciar || quantidadeAtiva >= limite;
            listaQrsEl.innerHTML = '';
            salaQrSelect.innerHTML = '<option value="">Sem QR Code associado</option>';

            disponiveis.forEach(qr => {
                const li = document.createElement('li');
                li.append(`QR ${qr.id} - disponível`);
                const option = document.createElement('option');
                option.value = qr.id;
                option.textContent = `QR ${qr.id}`;
                salaQrSelect.appendChild(option);

                const button = document.createElement('button');
                button.textContent = 'Revogar QR';
                button.className = 'action-button btn-danger';
                button.style.marginLeft = '12px';
                button.addEventListener('click', () => excluirQr(qr));
                li.appendChild(button);
                listaQrsEl.appendChild(li);
            });
            qrcodes.filter(qr => qr.status !== 'available' && qr.status !== 'revoked').forEach(qr => {
                const li = document.createElement('li');
                li.textContent = `QR ${qr.id} - associado a ${qr.roomName || 'sala'}`;
                listaQrsEl.appendChild(li);
            });
        });
    }

    async function criarQr() {
        await apiRequest('/api/tenant/qrcodes', { method: 'POST' }, async data => {
            mostrarQrCode(data.qrcode, `qrcode_${data.qrcode.id}.png`);
            await carregarQrs();
        });
    }

    async function excluirQr(qr) {
        if (qr.status !== 'available' || !confirm(`Revogar o QR Code ${qr.id}? Ele não poderá ser usado novamente.`)) return;
        await apiRequest(`/api/tenant/qrcodes/${qr.id}`, { method: 'DELETE' }, () => {
            updateStatus(`QR Code ${qr.id} revogado.`, 'success');
            carregarQrs();
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
                    nome.textContent = sala.nome;

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
    btnCriarQr.addEventListener('click', criarQr);
    btnTenantLogout.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/tenant/auth/logout', { method: 'POST' });
            if (!response.ok) throw new Error('Não foi possível encerrar a sessão.')
            window.location.replace('/login?loggedout=1')
        } catch (error) {
            updateStatus(error.message, 'error')
        }
    })

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

    btnReduzir.addEventListener('click', async () => {
        const sala = salaFiltro.value;
        if (!sala) {
            updateStatus('Selecione a sala para reduzir o último check-in.', 'error');
            return;
        }

        if (!confirm('Tem certeza que deseja remover o último check-in desta sala? Esta ação não pode ser desfeita.')) {
            return;
        }

        await apiRequest(`/api/tenant/attendances/latest?roomId=${encodeURIComponent(sala)}`, { method: 'DELETE' }, (data) => {
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

        await apiRequest(`/api/tenant/attendances?roomId=${encodeURIComponent(sala)}`, { method: 'DELETE' }, (data) => {
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

        const associado = qrCodesTenant.find(qr =>
            qr.roomId === sala && qr.status === 'active',
        )
        if (associado) {
            if (!confirm('Gerar uma nova imagem rotacionando o token? Cópias anteriores deste QR deixarão de funcionar.')) return
            await apiRequest(`/api/tenant/qrcodes/${associado.id}/rotate`, {
                method: 'POST',
            }, data => mostrarQrCode(data.qrcode, `qrcode_sala_${sala}.png`))
            return
        }

        await apiRequest('/api/tenant/qrcodes', { method: 'POST' }, async data => {
            const association = await apiRequest(`/api/tenant/qrcodes/${data.qrcode.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: sala }),
            })
            if (!association) {
                updateStatus('O QR foi criado, mas não pôde ser associado. A imagem abaixo ainda pode ser usada depois de associar este QR na sala.', 'error')
            } else {
                updateStatus('QR criado e associado à sala.', 'success')
            }
            mostrarQrCode(data.qrcode, `qrcode_sala_${sala}.png`)
            await carregarQrs()
        })
    });

    async function carregarPerfisFaciais() {
        if (!listaPerfisFaciaisEl || document.getElementById('biometricManagementCard').hidden) return
        await apiRequest('/api/tenant/biometrics/profiles', { method: 'GET' }, data => {
            listaPerfisFaciaisEl.replaceChildren()
            const pessoas = Array.isArray(data.pessoas) ? data.pessoas : []
            if (!pessoas.length) {
                const item = document.createElement('li')
                item.textContent = 'Nenhum perfil cadastrado.'
                listaPerfisFaciaisEl.appendChild(item)
                return
            }
            pessoas.forEach(pessoa => {
                if (!pessoa.temRosto) return
                const item = document.createElement('li')
                item.textContent = pessoa.nome
                const button = document.createElement('button')
                button.className = 'action-button btn-danger'
                button.textContent = 'Excluir biometria'
                button.addEventListener('click', async () => {
                    if (!confirm(`Excluir o perfil biométrico de "${pessoa.nome}"?`)) return
                    await apiRequest(`/api/tenant/biometrics/profiles/${pessoa.perfilId}`, {
                        method: 'DELETE',
                    }, async () => {
                        updateStatus('Perfil biométrico excluído.', 'success')
                        await carregarPerfisFaciais()
                    })
                })
                item.append(' ', button)
                listaPerfisFaciaisEl.appendChild(item)
            })
        })
    }

    btnAddSala.addEventListener('click', adicionarSala);

    // Carregar a contagem inicial e as salas ao carregar a página
    configurarSessaoTenant().then(() => {
        carregarSalas();
        carregarPerfisFaciais();
        window.setInterval(atualizarCheckins, 60 * 1000);
    }).catch(error => {
        updateStatus(`Erro ao verificar sessão: ${error.message}`, 'error')
    })
});