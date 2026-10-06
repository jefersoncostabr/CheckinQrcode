        document.addEventListener('DOMContentLoaded', async () => {
            const quantidadeTotalEl = document.getElementById('quantidadeTotal');
            const listaNomesEl = document.getElementById('listaNomes');
            const btnCopiar = document.getElementById('btnCopiar');
            const salaFiltro = document.getElementById('salaFiltroRelatorio');
            const salasDialog = document.getElementById('salasDialog');
            const listaSalasCadastradas = document.getElementById('listaSalasCadastradas');
            const btnSalasCadastradas = document.getElementById('btnSalasCadastradas');
            const btnFecharSalas = document.getElementById('btnFecharSalas');

            async function carregarRelatorio() {
                const sala = salaFiltro.value;
                const url = sala ? `/api/relatorio?sala=${encodeURIComponent(sala)}` : '/api/relatorio';

                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error('Falha ao buscar os dados do relatório.');
                    }
                    const historico = await response.json();

                    quantidadeTotalEl.textContent = historico.length;
                    listaNomesEl.innerHTML = '';

                    if (historico.length > 0) {
                        historico.forEach(h => {
                            const li = document.createElement('li');
                            const dataFormatada = new Date(h.data).toLocaleString('pt-BR');
                            const salaTexto = h.sala ? ` - ${h.sala}` : '';
                            const nomeEl = document.createElement('strong');
                            nomeEl.textContent = h.nome;
                            const detalheEl = document.createElement('span');
                            detalheEl.textContent = `${salaTexto} (${dataFormatada})`;
                            li.append(nomeEl, detalheEl);
                            listaNomesEl.appendChild(li);
                        });
                        btnCopiar.style.display = 'block';
                    } else {
                        listaNomesEl.innerHTML = '<li style="text-align:center; color: #888;">Nenhum registro encontrado.</li>';
                        btnCopiar.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Erro ao carregar relatório:', error);
                    listaNomesEl.innerHTML = '<li style="text-align:center; color: #d9534f;">Erro ao carregar os dados. Tente recarregar a página.</li>';
                }
            }

            async function buscarSalas() {
                const response = await fetch('/api/salas', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('Falha ao buscar as salas.');
                }
                const data = await response.json();
                return Array.isArray(data.salas) ? data.salas : [];
            }

            async function carregarSalas() {
                try {
                    const salas = await buscarSalas();

                    salaFiltro.innerHTML = '<option value="">Todas as salas</option>';
                    salas.forEach(sala => {
                        const opt = document.createElement('option');
                        opt.value = sala.id;
                        opt.textContent = `${sala.id} - ${sala.nome}`;
                        salaFiltro.appendChild(opt);
                    });
                } catch (error) {
                    console.error('Erro ao carregar salas:', error);
                }
            }

            async function mostrarSalasCadastradas() {
                salasDialog.showModal();
                listaSalasCadastradas.replaceChildren();
                const carregando = document.createElement('li');
                carregando.textContent = 'Carregando salas...';
                listaSalasCadastradas.appendChild(carregando);

                try {
                    const salas = await buscarSalas();
                    listaSalasCadastradas.replaceChildren();
                    if (!salas.length) {
                        const vazia = document.createElement('li');
                        vazia.textContent = 'Nenhuma sala cadastrada.';
                        listaSalasCadastradas.appendChild(vazia);
                        return;
                    }

                    salas.forEach(sala => {
                        const item = document.createElement('li');
                        item.textContent = `${sala.id} - ${sala.nome}${sala.aberta ? '' : ' (fechada)'}`;
                        listaSalasCadastradas.appendChild(item);
                    });
                } catch (error) {
                    console.error('Erro ao buscar salas cadastradas:', error);
                    const falha = document.createElement('li');
                    falha.textContent = 'Não foi possível atualizar a lista de salas.';
                    listaSalasCadastradas.replaceChildren(falha);
                }
            }

            salaFiltro.addEventListener('change', carregarRelatorio);
            btnSalasCadastradas.addEventListener('click', mostrarSalasCadastradas);
            btnFecharSalas.addEventListener('click', () => salasDialog.close());

            btnCopiar.addEventListener('click', () => {
                const nomes = Array.from(document.querySelectorAll('#listaNomes li strong')).map(el => el.innerText);
                const textoParaCopiar = nomes.join('\n');

                navigator.clipboard.writeText(textoParaCopiar).then(() => {
                    const originalText = btnCopiar.innerText;
                    btnCopiar.innerText = 'Copiado!';
                    btnCopiar.style.backgroundColor = '#007bff';
                    setTimeout(() => {
                        btnCopiar.innerText = originalText;
                        btnCopiar.style.backgroundColor = '#28a745';
                    }, 2000);
                }).catch(err => {
                    console.error('Erro ao copiar nomes para a área de transferência: ', err);
                    alert('Não foi possível copiar os nomes.');
                });
            });

            await carregarSalas();
            await carregarRelatorio();
        });