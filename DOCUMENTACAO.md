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
- **Descrição:** Rota chamada pela página de confirmação para efetivamente registrar uma presença. O sistema salva o IP do requisitante para contagem.
- **Retorno:** JSON com mensagem e a nova quantidade. Ex: `{ "sucesso": true, "mensagem": "Check-in realizado!", "novaQuantidade": 11 }`.

## 2. Rotas de Administração

**Prefixo:** `/adm`

### A. Gerar QR Code de Check-in
- **Rota:** `/gerar-qrcode`
- **Método:** `GET`
- **Descrição:** Gera um novo arquivo de imagem `presenca_gerada_api.png` na raiz do projeto com o QR Code para a rota de check-in. A URL é construída dinamicamente com base no host do servidor.
- **Retorno:** JSON com mensagem de sucesso, nome do arquivo e a URL utilizada. Ex: `{ "sucesso": true, "mensagem": "QR Code gerado...", "arquivo": "presenca_gerada_api.png", "url": "http://localhost:3000/add" }`.

## 3. Como Gerar o QR Code (Manualmente)

1. Abra o terminal na pasta do projeto.
2. Instale a biblioteca necessária (apenas na primeira vez):
   ```bash
   npm install qrcode
   ```
3. Execute o comando para gerar a imagem:
   ```bash
   node scripts/gQRC.js
   ```
4. O arquivo **`presenca_customizada.png`** será gerado na raiz do projeto.