# Documentação do Sistema de Check-in

**URL Base:** `http://localhost:3000`

## 1. Rotas da API

### A. Verificar se o servidor está online
- **Rota:** `/`
- **Método:** `GET`
- **Descrição:** Verifica o status da API.
- **Retorno:** "O servidor funcionando."

### B. Ver a quantidade atual de pessoas
- **Rota:** `/qtd`
- **Método:** `GET`
- **Descrição:** Retorna a contagem atual de pessoas na sala.
- **Retorno:** JSON com a quantidade. Ex: `{ "sucesso": true, "quantidade": 10 }`.

### C. Diminuir a contagem (Alguém saiu)
- **Rota:** `/reduce`
- **Método:** `DELETE`
- **Descrição:** Diminui a contagem em -1 (removendo o último registro de presença).
- **Retorno:** JSON com mensagem e a nova quantidade. Ex: `{ "sucesso": true, "mensagem": "Check-out...", "novaQuantidade": 9 }`.

### D. Zerar a contagem (Limpeza)
- **Rota:** `/clean`
- **Método:** `DELETE`
- **Descrição:** Reseta a contagem para 0 (limpando o histórico de presença).
- **Retorno:** JSON com mensagem e a nova quantidade. Ex: `{ "sucesso": true, "mensagem": "Histórico limpo!", "novaQuantidade": 0 }`.

### E. Exibir página de confirmação de Check-in
- **Rota:** `/add`
- **Método:** `GET`
- **Descrição:** Rota acessada pelo QR Code. Exibe uma página HTML com um botão para que o usuário confirme o check-in. Isso evita registros automáticos por robôs ou previews de links.
- **Retorno:** Uma página HTML.

### F. Realizar o Check-in (Adicionar uma pessoa)
- **Rota:** `/add`
- **Método:** `POST`
- **Descrição:** Rota chamada pela página de confirmação para efetivamente registrar uma presença. Requer o envio do campo `nome` no corpo da requisição. O sistema valida se o nome já existe na lista (evitando duplicatas) e salva o IP.
- **Retorno:** JSON com mensagem e a nova quantidade. Ex: `{ "sucesso": true, "mensagem": "Check-in realizado!", "novaQuantidade": 11 }`.

### G. Exibir Relatório de Presença
- **Rota:** `/relatorio`
- **Método:** `GET`
- **Descrição:** Exibe uma página HTML com o relatório de presença. A página mostra a quantidade total de pessoas e uma lista com o nome e a data/hora do check-in de cada uma. Inclui um botão para copiar apenas os nomes para a área de transferência.
- **Retorno:** Uma página HTML.

### H. Resetar Memória do Dispositivo (LocalStorage)
- **Rota:** `/resetls`
- **Método:** `GET`
- **Descrição:** Limpa o armazenamento local do navegador (localStorage) e redireciona o usuário de volta para a tela de check-in. Útil para desbloquear dispositivos que impedem novos cadastros indevidamente (ex: "Você já confirmou presença").
- **Retorno:** Script HTML que executa a limpeza e redirecionamento.

## 2. Rotas de Administração

**Prefixo:** `/adm`

### A. Acessar Painel de Administração
- **Rota:** `/adm`
- **Método:** `GET`
- **Descrição:** Exibe a página HTML do painel de administração, que permite executar diversas funções de controle e gestão do sistema.
- **Retorno:** Uma página HTML.

### B. Gerar QR Code de Check-in
- **Rota:** `/adm/gerar-qrcode`
- **Método:** `GET`
- **Descrição:** Gera um novo arquivo de imagem (`presenca_gerada_api.png`) na raiz do projeto com o QR Code para a rota de check-in. A URL é construída dinamicamente com base no host do servidor. **Esta rota é chamada pelo painel de administração.**
- **Retorno:** JSON com mensagem de sucesso, nome do arquivo e a URL utilizada. Ex: `{ "sucesso": true, "mensagem": "QR Code gerado com sucesso!", "arquivo": "presenca_gerada_api.png", "url": "http://localhost:3000/add" }`.

## 3. Como Gerar o QR Code

A geração do QR Code pode ser feita de duas maneiras:

### A. Pelo Painel de Administração (Recomendado)

1. Acesse o painel de administração em `http://localhost:3000/adm`.
2. Clique no botão "Gerar Novo QR Code".
3. O sistema criará o arquivo `presenca_gerada_api.png` na pasta raiz do projeto e exibirá uma mensagem de confirmação.

### B. Manualmente (via Rota de API)

Você também pode gerar o QR Code acessando diretamente a rota da API no seu navegador ou via `curl`:

- **URL:** `http://localhost:3000/adm/gerar-qrcode`

Isso irá executar a mesma ação do botão no painel de administração.