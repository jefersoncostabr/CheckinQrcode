# Resumo de Rotas da Aplicação

## URL Base

Os caminhos das rotas são os mesmos em desenvolvimento e no Render; muda apenas a URL base:

- **Desenvolvimento local:** `http://localhost:3000`
- **Render:** `https://checkinqrcode.onrender.com`

Por exemplo, a rota de login local é `http://localhost:3000/login`; no Render é `https://checkinqrcode.onrender.com/login`. Não use `localhost` para acessar o serviço publicado. Para testar em um celular na rede local, use o IPv4 do PC no lugar de `localhost`.

As rotas marcadas como administrativas exigem uma sessão iniciada por `POST /login`. Sem sessão, o servidor redireciona para `/login`. No Postman, mantenha o cookie recebido no login.

## Páginas e Autenticação

| Método | Rota | Acesso | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Público | Verifica se o servidor está online; responde `O servidor funcionando.` |
| `GET` | `/login` | Público | Exibe a página de login. |
| `POST` | `/login` | Público | Valida `user` e `pass` enviados como formulário. Credenciais corretas criam a sessão e redirecionam para `/adm`; incorretas redirecionam para `/login?error=1`. |
| `GET` | `/logout` | Público | Encerra a sessão atual e redireciona para `/login?loggedout=1`. |
| `GET` | `/add?id=...` | Público | Exibe a confirmação do check-in para o ID estável do QR. |
| `GET` | `/add?sala=...` | Público | Compatibilidade temporária com QR Codes antigos que guardam o apelido da sala. |
| `GET` | `/adm` | Administrativa | Exibe o painel de administração. |
| `GET` | `/adm/adicionar-manual` | Administrativa | Exibe a página para registrar presença manualmente. |
| `GET` | `/relatorio` | Administrativa | Exibe a página do relatório de presença. |
| `GET` | `/resetls` | Administrativa | Limpa o `localStorage` no navegador e redireciona para `/add`. É uma página/script para navegador, não uma limpeza do banco de dados. |

## API Pública

| Método | Rota | Parâmetros/Corpo | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/qtd` | Query opcional: `sala` | Retorna a contagem total e as contagens por sala. Com `sala`, retorna a contagem daquela sala. |
| `GET` | `/api/checkin/sala?id=...` | Query `id` ou `sala` legado | Valida se o QR corresponde a uma sala cadastrada e aberta. |
| `POST` | `/add` | JSON: `nome`, `salaId`; legado: `nome`, `sala` | Registra um check-in. A sala deve existir e estar aberta para check-in via QR; o nome não pode já estar registrado nela. |

## API Administrativa

Todas as rotas desta seção exigem sessão administrativa.

| Método | Rota | Parâmetros/Corpo | Descrição |
| :--- | :--- | :--- | :--- |
| `DELETE` | `/reduce?sala=...` | Query obrigatória: `sala` | Remove o check-in mais recente daquela sala. |
| `DELETE` | `/clean?sala=...` | Query obrigatória: `sala` | Remove do histórico os check-ins daquela sala, sem excluir o cadastro da sala. |
| `DELETE` | `/clean?all=true` | `all=true` (ou `tudo=true`) | Remove todos os check-ins do histórico, mantendo os cadastros das salas. |
| `GET` | `/api/relatorio` | Query opcional: `sala` | Retorna os registros do relatório em JSON; pode filtrar por sala. |
| `GET` | `/api/salas` | Nenhum | Retorna os nomes das salas cadastradas. |
| `POST` | `/api/salas` | JSON: `sala`, `qrId` quando há QR disponível | Cadastra uma sala; exige selecionar QR livre ou cria automaticamente se não houver nenhum disponível e o limite permitir. |
| `PATCH` | `/api/salas/:id` | JSON: `{"aberta":false}` | Fecha ou reabre a sala. Sala fechada não aceita check-in por QR, mas permite lançamento manual administrativo. |
| `DELETE` | `/api/salas?sala=ID` | Query com ID ou apelido | Exclui sala e históricos associados; o QR fica inativo e nunca é reutilizado. |
| `GET` | `/api/qrcodes` | Nenhum | Lista QRs e retorna limite e quantidade ativa (máximo 10). |
| `POST` | `/api/qrcodes` | Nenhum | Cria QR disponível; retorna `409` ao atingir o limite. |
| `DELETE` | `/api/qrcodes/:id` | ID do QR | Exclui somente QRs disponíveis; QRs associados são protegidos. |
| `POST` | `/adm/adicionar-manual` | JSON: `nome`, `salaId` | Registra presença manual autenticada, inclusive em sala fechada. |
| `GET` | `/adm/gerar-qrcode?sala=ID` | Query obrigatória: `sala` | Gera QR Code com URL estável `/add?id=ID` e imagem em Data URI. |
| `GET` | `/adm/gerar-qrcode?sala=ID&download=true` | Query obrigatória: `sala`; `download=true` | Retorna a imagem PNG do QR Code para download. |

## Exemplos no Postman

1. Faça login com `POST <URL_BASE>/login`, usando `x-www-form-urlencoded` com os campos `user` e `pass`. O Postman deve manter o cookie da sessão.
2. Para apagar todos os check-ins, use `DELETE <URL_BASE>/clean?all=true`.
3. Para consultar a contagem, use `GET <URL_BASE>/qtd`.

Substitua `<URL_BASE>` por `http://localhost:3000` no desenvolvimento ou por `https://checkinqrcode.onrender.com` no Render.