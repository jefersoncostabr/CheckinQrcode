# Rotas da aplicação

## Endereço base

- Local: `http://localhost:3000`
- Render: `https://checkinqrcode.onrender.com`

O nome e a porta local podem variar conforme a configuração. Para acessar pelo celular na rede local, use o IPv4 do computador. O check-in por QR usa somente tokens multi-tenant no fragmento `/add#TOKEN`.

## Páginas

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `GET` | `/` | Público | Verifica se o servidor está online. |
| `GET` | `/login` | Público | Login com e-mail e senha de uma conta tenant. |
| `GET` | `/criar-conta.html` | Público | Cria uma organização e sua primeira conta `owner`. |
| `GET` | `/adm` | Sessão tenant | Painel administrativo da organização ativa. |
| `GET` | `/adm/adicionar-manual` | Sessão tenant | Tela de lançamento manual de presença. |
| `GET` | `/adm/monitor-facial` | Sessão tenant | Monitor facial para uma sala do tenant. |
| `GET` | `/adm/relatorio` ou `/relatorio` | `reports:read` + sessão tenant | Relatório e lista de presenças da organização ativa. |
| `GET` | `/add#TOKEN` | Público | Check-in por nome ou biometria usando um QR ativo. |
| `GET` | `/teste-rosto` | Sessão tenant | Página administrativa de teste facial. |

O cadastro e o login abrem o painel `/adm` após autenticação. Se a conta pertencer a mais de uma organização, o login pede para selecionar uma.

## Cadastro e autenticação

Estas rotas usam cookie de sessão HTTP-only:

| Método | Rota | Corpo | Descrição |
|---|---|---|---|
| `POST` | `/api/tenant/auth/register` | `tenantName`, `name`, `email`, `password` | Cria tenant, conta e vínculo `owner`; inicia a sessão. |
| `POST` | `/api/tenant/auth/login` | `email`, `password` | Autentica a conta; pode retornar organizações para seleção. |
| `POST` | `/api/tenant/auth/select` | `membershipId` | Seleciona uma organização após login. |
| `POST` | `/api/tenant/auth/switch` | `tenantId`, `membershipId` | Troca a organização ativa para um vínculo da conta. |
| `GET` | `/api/tenant/auth/session` | — | Revalida e retorna a organização ativa. |
| `POST` | `/api/tenant/auth/logout` | — | Encerra a sessão. |

O escopo tenant é determinado e revalidado no servidor; um `tenantId` enviado pelo cliente não substitui a organização ativa da sessão.

## Administração tenant

Todas as rotas abaixo exigem sessão tenant e a permissão indicada. O serviço filtra os registros pela organização ativa.

| Método | Rota | Corpo/query | Permissão e função |
|---|---|---|---|
| `GET` | `/api/tenant/rooms` | — | `rooms:read`; lista salas não arquivadas. |
| `POST` | `/api/tenant/rooms` | `name`; opcional `qrCodeId` | `rooms:manage`; cria sala. Se incluir QR disponível, cria e associa ambos em uma transação. |
| `PATCH` | `/api/tenant/rooms/:id` | `status: "open" \| "closed"` | `rooms:manage`; altera estado. |
| `DELETE` | `/api/tenant/rooms/:id` | — | `rooms:manage`; arquiva sem apagar o histórico. |
| `GET` | `/api/tenant/qrcodes` | — | `qrcodes:read`; lista QR sem revelar tokens ou hashes e retorna limite/quantidade ativa. |
| `POST` | `/api/tenant/qrcodes` | — | `qrcodes:manage`; cria um QR disponível e retorna token/imagem (limite de 10 por tenant). O token recuperável é guardado sem criptografia no banco, permitindo reexibição posterior por administrador autorizado. Configure `PUBLIC_BASE_URL` quando o endereço público não puder ser detectado. |
| `GET` | `/api/tenant/qrcodes/:id/visual` | — | `qrcodes:manage`; reexibe a imagem de um QR Code ativo associado a uma sala, sem gerar outro token nem invalidar cópias existentes. Retorna `Cache-Control: no-store`. QR Codes sem dados recuperáveis retornam `409`. |
| `PATCH` | `/api/tenant/qrcodes/:id` | `roomId` ou `null` | `qrcodes:manage`; associa a uma sala da mesma organização ou libera a associação. |
| `POST` | `/api/tenant/qrcodes/:id/rotate` | — | `qrcodes:manage`; gera token/imagem novos e invalida cópias anteriores. |
| `DELETE` | `/api/tenant/qrcodes/:id` | — | `qrcodes:manage`; revoga o QR. |
| `GET` | `/api/tenant/dashboard` | — | `attendance:read`; contagem por sala. |
| `GET` | `/qtd?roomId=ID` | `roomId` opcional | Alias compatível para consultar a contagem; requer `attendance:read` e escopa pelo tenant ativo. |
| `GET` | `/api/tenant/attendances?page=1&roomId=ID` | `page`, `roomId` opcionais | `attendance:read`; lista até 100 presenças por página. |
| `POST` | `/api/tenant/attendances/manual` | `roomId`, `nome` | `attendance:create`; registra presença manual. |
| `DELETE` | `/api/tenant/attendances/latest?roomId=ID` | `roomId` | `attendance:manage`; remove a presença mais recente da sala. |
| `DELETE` | `/api/tenant/attendances?roomId=ID` | `roomId` | `attendance:manage`; remove presenças da sala. |
| `DELETE` | `/api/tenant/attendances/:id` | — | `attendance:manage`; remove uma presença. |
| `GET` | `/api/tenant/reports/attendance` | — | `reports:read`; total agrupado por sala. |
| `GET` | `/api/tenant/biometrics/profiles` | — | `biometrics:manage`; lista perfis sem descritores. |
| `POST` | `/api/tenant/biometrics/enroll` | `nome`, `descritor`, `consentimento: true` | `biometrics:manage`; cadastra biometria com consentimento. |
| `POST` | `/api/tenant/biometrics/verify` | `descritor`, `nome` opcional | `biometrics:manage`; verifica somente perfis da organização ativa. |
| `POST` | `/api/tenant/biometrics/checkin` | `roomId`, `descritor`, `consentimento: true` | `attendance:create`; registra presença facial na sala. |
| `DELETE` | `/api/tenant/biometrics/profiles/:id` | — | `biometrics:manage`; exclui perfil da organização ativa. |

## Check-in público via QR

O QR aponta para `/add#TOKEN`. A página envia o token no corpo da API; o servidor resolve a organização, a sala e seus estados. Não envie `tenantId` nem `roomId` para selecionar a organização.

| Método | Rota | Corpo/header | Descrição |
|---|---|---|---|
| `POST` | `/api/checkin/tenant/resolve` | `token` | Valida o QR e retorna a sala. |
| `POST` | `/api/checkin/tenant/attendance` | `token`, `nome` | Registra presença pelo nome. |
| `POST` | `/api/checkin/tenant/biometrics/enroll` | `token`, `nome`, `descritor`, `consentimento: true` | Cadastra perfil no tenant do QR e devolve uma credencial de exclusão. |
| `POST` | `/api/checkin/tenant/biometrics/checkin` | `token`, `descritor`, `consentimento: true` | Compara apenas perfis consentidos daquele tenant e registra presença. |
| `DELETE` | `/api/checkin/tenant/biometrics/profiles/:id` | `x-biometric-delete-token` | Exclui o perfil com a credencial individual emitida no cadastro. |

## Rotas antigas desativadas

O login de credenciais administrativas em `POST /login` retorna `410 Gone`; use o login tenant na tela `/login`. Os endpoints antigos de check-in global (`POST /add`, `/api/checkin/sala`, `/api/face/*`, `/reduce`, `/clean`, `/api/salas`, `/api/qrcodes` e `/api/relatorio`) também retornam `410 Gone` ou, no caso de `/qtd`, exigem sessão tenant e consultam somente o tenant ativo. As páginas administrativas antigas foram redirecionadas/conectadas ao painel tenant.

O endpoint `GET /api/rotas` requer sessão tenant e lista as rotas registradas, incluindo o nível de acesso.

## Configuração de recuperação de QR Codes

Os QR Codes associados a uma sala armazenam o token e a URL base sem criptografia no banco, permitindo reexibição posterior por administrador autorizado. Não é necessário configurar `QR_TOKEN_ENCRYPTION_KEY`.

Atenção: acesso ao banco de dados pode expor os tokens recuperáveis dos QR Codes. Não registre tokens nem URLs base em logs. A URL base original precisa continuar acessível para que o QR Code funcione após a reexibição.
