        document.addEventListener('DOMContentLoaded', async () => {
            const quantidadeTotalEl = document.getElementById('quantidadeTotal');
            const listaNomesEl = document.getElementById('listaNomes');
            const btnCopiar = document.getElementById('btnCopiar');

            try {
                const response = await fetch('/api/relatorio');
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
                        li.innerHTML = `<strong>${h.nome}</strong> <span style="color:#666; font-size:0.9em;">(${dataFormatada})</span>`;
                        listaNomesEl.appendChild(li);
                    });
                    btnCopiar.style.display = 'block';
                } else {
                    listaNomesEl.innerHTML = '<li style="text-align:center; color: #888;">Nenhum registro encontrado.</li>';
                }
            } catch (error) {
                console.error('Erro ao carregar relatório:', error);
                listaNomesEl.innerHTML = '<li style="text-align:center; color: #d9534f;">Erro ao carregar os dados. Tente recarregar a página.</li>';
            }

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
        });