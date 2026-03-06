        document.addEventListener('DOMContentLoaded', async () => {
            const quantidadeTotalEl = document.getElementById('quantidadeTotal');
            const listaNomesEl = document.getElementById('listaNomes');
            const btnCopiar = document.getElementById('btnCopiar');
            const salaFiltro = document.getElementById('salaFiltroRelatorio');

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
                            li.innerHTML = `<strong>${h.nome}</strong>${salaTexto} <span style="color:#666; font-size:0.9em;">(${dataFormatada})</span>`;
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

            async function carregarSalas() {
                try {
                    const response = await fetch('/api/salas');
                    if (!response.ok) {
                        throw new Error('Falha ao buscar as salas.');
                    }
                    const data = await response.json();
                    const salas = Array.isArray(data.salas) ? data.salas : [];

                    salaFiltro.innerHTML = '<option value="">Todas as salas</option>';
                    salas.forEach(sala => {
                        const opt = document.createElement('option');
                        opt.value = sala;
                        opt.textContent = sala;
                        salaFiltro.appendChild(opt);
                    });
                } catch (error) {
                    console.error('Erro ao carregar salas:', error);
                }
            }

            salaFiltro.addEventListener('change', carregarRelatorio);

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