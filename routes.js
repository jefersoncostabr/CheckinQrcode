import express from 'express'
import lotacaoSala from './lotacaoSalaModel.js'
import path from 'path'
import { fileURLToPath } from 'url'

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

router.get('/', (req, res) => {
    res.send('O servidor funcionando.')
})

router.get('/qtd', async (req, res) => {
    try {
        const resultado = await lotacaoSala.findOne()
        const quantidade = resultado?.historico?.length || 0
        res.json({ sucesso: true, quantidade })
    } catch (error) {
        console.error("Erro ao buscar quantidade:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao buscar a contagem." })
    }
})

// Rota de interface: Exibe o botão para confirmar (Evita robôs/previews)
router.get('/add', async (req, res) => {
    // Agora, em vez de enviar o HTML como string, enviamos o arquivo físico.
    // O path.join constrói o caminho correto para o arquivo na pasta 'public'.
    res.sendFile(path.join(__dirname, 'public', 'checkin.html'));
})

// Nova rota POST que realmente salva os dados (chamada pelo botão)
router.post('/add', async (req, res) => {
    let ip = req.headers['x-forwarded-for'] 
        ? req.headers['x-forwarded-for'].split(',')[0].trim() 
        : req.socket.remoteAddress
    
    // Normaliza o IP para IPv4 se for localhost ou mapeado
    if (ip === '::1') ip = '127.0.0.1';
    if (ip && ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

    const { nome } = req.body;

    if (!nome) {
        return res.status(400).json({ sucesso: false, mensagem: "Nome é obrigatório." });
    }

    try {
        // Busca o documento atual para verificar duplicidade de IP
        const docAtual = await lotacaoSala.findOne({});
        
        // Verifica se o NOME já existe no histórico (Permite mesmo Wi-Fi/IP, bloqueia apenas nomes repetidos)
        // Normalização: Remove acentos e espaços extras para comparação (Ex: "João" == "Joao")
        const normalizar = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        
        const nomeLimpo = normalizar(nome);

        const nomeJaExiste = docAtual?.historico?.some(item => {
            return typeof item === 'object' && item.nome && normalizar(item.nome) === nomeLimpo;
        });

        if (nomeJaExiste) {
            return res.status(403).json({ sucesso: false, mensagem: "Este nome já está na lista de presença!" });
        }

        const resultado = await lotacaoSala.findOneAndUpdate(
            {},
            { $push: { historico: { nome: nome, ip: ip, data: new Date() } } },
            { new: true, upsert: true }
        )
        res.json({ sucesso: true, mensagem: "Check-in realizado!", novaQuantidade: resultado.historico.length })
    } catch (error) {
        console.error("Erro ao adicionar presença:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao processar o check-in." })
    }
})

router.delete('/reduce', async (req, res) => {
    try {
        const resultado = await lotacaoSala.findOneAndUpdate(
            { "historico.0": { $exists: true } }, // Só reduz se a lista não estiver vazia
            { $pop: { historico: 1 } }, // Remove o último item da lista
            { new: true }
        )
        // Se resultado for null (lista já estava vazia), a quantidade é 0.
        const novaQuantidade = resultado?.historico?.length || 0
        res.json({ sucesso: true, mensagem: "Check-out do ultimo registro realizado com sucesso!", novaQuantidade })
    } catch (error) {
        console.error("Erro ao reduzir presença:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao processar a redução." })
    }
})

router.delete('/clean', async (req, res) => {
    try {
        await lotacaoSala.findOneAndUpdate({}, { $set: { historico: [] } }, { new: true, upsert: true })
        res.json({ sucesso: true, mensagem: "Histórico limpo!", novaQuantidade: 0 })
    } catch (error) {
        console.error("Erro ao limpar histórico:", error)
        res.status(500).json({ sucesso: false, mensagem: "Erro ao limpar o histórico." })
    }
})

router.get('/relatorio', async (req, res) => {
    try {
        const resultado = await lotacaoSala.findOne()
        const historico = resultado?.historico || []
        const quantidade = historico.length

        const listaItens = historico.map(h => 
            `<li><strong>${h.nome}</strong> <span style="color:#666; font-size:0.9em;">(${new Date(h.data).toLocaleString('pt-BR')})</span></li>`
        ).join('')

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Relatório de Presença</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; max-width: 800px; margin: 0 auto; padding: 20px; }
                h1 { color: #2c3e50; text-align: center; }
                .resumo { background: #e8f4f8; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px; font-size: 1.2em; }
                ul { list-style-type: none; padding: 0; }
                li { background: #fff; border-bottom: 1px solid #eee; padding: 10px; display: flex; justify-content: space-between; align-items: center; }
                li:nth-child(even) { background-color: #f9f9f9; }
                .header-lista { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                .btn-copiar { background-color: #28a745; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-size: 0.9em; transition: background-color 0.2s; }
                .btn-copiar:hover { background-color: #218838; }
            </style>
        </head>
        <body>
            <h1>Relatório de Presença</h1>
            <div class="resumo">
                <strong>Quantidade Total:</strong> ${quantidade} pessoas
            </div>
            <div class="header-lista">
                <h3>Lista de Nomes:</h3>
                ${quantidade > 0 ? '<button id="btnCopiar" class="btn-copiar">Copiar Nomes</button>' : ''}
            </div>
            <ul id="listaNomes">
                ${listaItens || '<li style="text-align:center; color: #888;">Nenhum registro encontrado.</li>'}
            </ul>
            <div style="text-align: center;">
                <p> by Jeferson Costa<p/>
            </div>

            <script>
                const btnCopiar = document.getElementById('btnCopiar');
                if (btnCopiar) {
                    btnCopiar.addEventListener('click', () => {
                        const nomes = Array.from(document.querySelectorAll('#listaNomes li strong')).map(el => el.innerText);
                        const textoParaCopiar = nomes.join('\\n');
                        
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
                }
            </script>
        </body>
        </html>
        `
        res.send(html)
    } catch (error) {
        console.error("Erro ao gerar relatório:", error)
        res.status(500).send("Erro ao gerar o relatório.")
    }
})

export default router