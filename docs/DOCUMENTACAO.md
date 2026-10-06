# Documentação do Sistema de Check-in

**URL Base:** `http://localhost:3000`

## Estrutura no MongoDB

No banco configurado em `MONGO_URI` (atualmente `DancaHub`), o sistema guarda as salas e os check-ins na mesma coleção, chamada `lotacaoSala`. Essa coleção contém um documento de configuração com os campos:

- `salas`: array de salas com ID permanente, apelido e estado aberto/fechado. Salas antigas em texto são migradas automaticamente na primeira leitura.
- `qrcodes`: IDs e estados dos QR Codes (`disponivel`, `em_uso` ou `inativo`). IDs excluídos ou inativados não são reutilizados.
- `proximoQrId`: próximo identificador a atribuir.
- `historico`: registros com nome, IP, data, apelido da sala e ID da sala. Registros antigos recebem o ID correspondente quando a sala ainda está cadastrada.

No Data Explorer, selecione `DancaHub` e depois a coleção `lotacaoSala`. Ao abrir o documento, você verá `salas` e `historico` como campos dele; eles não são coleções separadas. Excluir uma sala pelo sistema também remove do array `historico` os check-ins associados a ela.

```text
DancaHub
└── lotacaoSala (coleção)
	└── documento de configuração
		├── salas: [{ id, nome, aberta }, ...]
		├── qrcodes: [{ id, salaId, estado }, ...]
		├── proximoQrId: número
		└── historico: [{ nome, ip, data, sala, salaId }, ...]
```

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
- **Descrição:** Rota acessada pelo QR Code. QR Codes novos usam `/add?id=ID`; links antigos `/add?sala=APELIDO` continuam compatíveis. A página verifica se a sala existe e está aberta antes de liberar o check-in.
- **Retorno:** Uma página HTML.

### F. Realizar o Check-in (Adicionar uma pessoa)
- **Rota:** `/add`
- **Método:** `POST`
- **Descrição:** Rota chamada pela página de confirmação para efetivamente registrar uma presença. Requer o envio do campo `nome` no corpo da requisição. O sistema valida se o nome já existe na lista (evitando duplicatas) e salva o IP.
- **Corpo novo:** `{ "nome": "Nome", "salaId": 1 }`. URLs antigas continuam aceitando `{ "nome": "Nome", "sala": "Apelido antigo" }`.
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
- **Descrição:** Gera um QR Code em memória e o retorna como um Data URI, pronto para ser exibido na tela ou baixado. A URL de check-in é construída dinamicamente. **Esta rota é chamada pelo painel de administração.**
- **Retorno:** JSON com mensagem de sucesso, URL estável `/add?id=ID` e Data URI da imagem do QR Code.

### C. Gestão de QR Codes e salas

- O limite é de 10 QR Codes ativos entre disponíveis e associados a salas.
- `/api/qrcodes` lista QR Codes e informa a quantidade ativa; `POST /api/qrcodes` cria um QR disponível; `DELETE /api/qrcodes/:id` exclui somente QR disponível.
- `POST /api/salas` exige a seleção de `qrId` quando há QRs disponíveis; sem QR livre, cria e associa um automaticamente respeitando o limite.
- `PATCH /api/salas/:id` recebe `{ "aberta": false }` para fechar e bloquear check-ins via QR, sem bloquear lançamentos manuais autenticados.
- QRs sem sala válida exibem “Sala não cadastrada. Fale com a administração.”
- O relatório possui filtro por sala e o botão “Ver salas cadastradas”, com IDs e apelidos.

## 3. Como Gerar o QR Code

A geração do QR Code pode ser feita de duas maneiras:

### A. Pelo Painel de Administração (Recomendado)

1. Acesse o painel de administração em `http://localhost:3000/adm`.
2. Crie ou selecione um QR disponível ao cadastrar a sala.
3. Selecione a sala e clique em "Ver QR Code" para exibir o QR associado ao ID estável.

### B. Manualmente (via Rota de API)

Você também pode gerar o QR Code acessando diretamente a rota da API no seu navegador ou via `curl`:

- **URL:** `http://localhost:3000/adm/gerar-qrcode`

Isso irá retornar um JSON com os dados do QR Code. A ação do painel administrativo é a forma recomendada de uso.

## 4. Acessar pela Rede Local

Se o sistema funciona no PC, mas o celular exibe "conexão recusada", o endereço `localhost` não deve ser usado no celular: ele aponta para o próprio dispositivo. Isso não costuma ser um erro de CORS; normalmente o celular não está alcançando o servidor pela rede.

1. Conecte o PC e o celular à mesma rede Wi-Fi.
2. No PC, abra o Prompt de Comando e execute `ipconfig`.
3. No adaptador de rede em uso (por exemplo, Wi-Fi), localize o **Endereço IPv4**.
4. No navegador do PC, abra o painel usando esse IP e a porta do servidor. Por exemplo: `http://192.168.1.25:3000/adm`.
5. Ao gerar o QR usando o painel aberto em `localhost`, o servidor substitui automaticamente o loopback pelo IPv4 privado detectado. Se houver várias placas de rede ou quiser fixar o endereço, configure `PUBLIC_BASE_URL`, por exemplo `http://192.168.1.25:3000`.
6. Leia o QR Code pelo celular. Se a página não abrir, verifique se o Firewall do Windows permite conexões para Node.js ou para a porta `3000` e se a rede Wi-Fi não isola os dispositivos entre si.

QR Codes já impressos com `localhost` continuam apontando para o próprio celular e precisam ser gerados e impressos novamente com o endereço de rede acessível.

Substitua `192.168.1.25` pelo IPv4 exibido no seu PC. O endereço IPv4 pode mudar quando o PC se reconectar à rede.

## 5. Checklist de Publicação e Produção

### Configuração do ambiente

- No Render, configure `ADMIN_USER`, `ADMIN_PASS`, `MONGO_URI`, `SESSION_SECRET` e `NODE_ENV=production` nas variáveis de ambiente. Opcionalmente, defina `PUBLIC_BASE_URL` para o domínio público canônico. Use valores reais e fortes; não inclua os segredos neste documento.
- Gere um `SESSION_SECRET` aleatório, exclusivo e longo. Ele assina o cookie da sessão; não substitui a senha administrativa (`ADMIN_PASS`). Trocar esse segredo invalida as sessões existentes.
- Mantenha o arquivo `.env` apenas no ambiente local e fora do Git. Se uma senha ou URI de banco for exposta, troque a credencial no serviço correspondente e atualize as variáveis locais e do Render.

### HTTPS e acesso administrativo

- Em produção, o Express configura `trust proxy` antes do middleware de sessão. Isso permite reconhecer o HTTPS terminado pelo proxy do Render e emitir o cookie seguro da sessão.
- Acesse o painel pelo domínio HTTPS publicado e gere um novo QR Code. Confira se a URL gerada começa com `https://` antes de distribuí-lo.
- Após o deploy, teste o login administrativo, atualize a página para confirmar que a sessão continua autenticada e faça um check-in real pelo QR usando um celular.

### Persistência e sessões

- Confirme que os check-ins continuam registrados no MongoDB depois de um novo deploy ou reinício do serviço.
- O app usa atualmente o armazenamento de sessão padrão em memória do `express-session`. As sessões são perdidas quando o processo reinicia, e esse armazenamento não é recomendado para produção nem para múltiplas instâncias. Para maior confiabilidade, planeje configurar um armazenamento persistente de sessões, como MongoDB (`connect-mongo`) ou Redis.