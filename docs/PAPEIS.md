# Papéis e permissões

Cada vínculo de uma conta com uma organização possui um papel. Os papéis são verificados no servidor e determinam quais operações a conta pode executar naquele tenant.

## Permissões disponíveis

1- `tenant:manage`: gerenciar a organização.
2- `members:manage`: gerenciar os membros da organização.
3- `rooms:read` / `rooms:manage`: consultar / gerenciar salas.
4- `qrcodes:read` / `qrcodes:manage`: consultar / gerenciar QR Codes.
5- `attendance:create` / `attendance:read` / `attendance:manage`: criar / consultar / gerenciar presenças.
6- `reports:read`: consultar relatórios.
7- `biometrics:manage`: gerenciar operações e perfis biométricos.
8- `biometrics:monitor`: iniciar o monitor facial de uma sala sem gerenciar perfis biométricos.
9- `advanced:read`: acessar a página avançada.
10- `checkinPeriods:read`: consultar os períodos de check-in existentes da organização ativa.
11- `classes:manage`: cadastrar, iniciar e encerrar aulas e gerar QR temporário de abertura de sala.


| Papel | Permissões |
| --- | --- |
| `owner` | Todas as permissões: gerenciar a organização e membros; consultar e gerenciar salas e QR Codes; criar, consultar e gerenciar presenças; consultar relatórios; gerenciar biometria; acessar a página avançada; consultar períodos de check-in. |
| `admin` | Consultar e gerenciar salas e QR Codes; criar, consultar e gerenciar presenças; consultar relatórios; gerenciar biometria; acessar a página avançada; consultar períodos de check-in. Não pode gerenciar a organização nem os membros. |
| `admin` | Consultar e gerenciar salas e QR Codes; criar, consultar e gerenciar presenças; consultar relatórios; gerenciar biometria; acessar a página avançada; consultar períodos de check-in; cadastrar, iniciar e encerrar aulas e gerar QR temporário de abertura de sala. Não pode gerenciar a organização nem os membros. |
| `operator` | Consultar salas e QR Codes; criar e consultar presenças; cadastrar, iniciar e encerrar aulas; gerar QR temporário de abertura de sala; iniciar o monitor facial de uma sala. Não pode gerenciar salas, QR Codes nem perfis biométricos. |
| `viewer` | Consultar salas, presenças e relatórios. |
| `user` | Criar presenças. Não pode consultar salas ou presenças, nem gerenciar dados. |


## Participante do check-in via QR

O participante que se cadastra pelo check-in por nome recebe o papel `user` na organização
em que se cadastrou. Esse papel concede exclusivamente `attendance:create`, permitindo
registrar presença na sala identificada pelo QR Code.

O participante usa uma **sessão separada** da sessão administrativa (cookie `checkin.sid`),
com duração fixa de 30 dias, válida apenas para o caminho `/api/checkin/tenant`. A sessão
não substitui, renova nem encerra uma sessão administrativa aberta no mesmo navegador.

O papel e a sessão são revalidadas no servidor a cada operação autenticada; o papel
informado pelo navegador não substitui essa verificação.

No painel, os links Teste Facial, Relatório e Avançado são exibidos desde o
carregamento inicial somente para os papéis com as respectivas permissões.
A página avançada é acessível somente por owner e admin.

## Tipo de cliente

O campo `tipo_cliente` pertence ao usuário e aceita `cliente` ou
`equipe`. É global à conta e não concede permissões.

O cadastro de organização cria um owner do tipo equipe. O cadastro
público pelo QR cria um usuário do tipo cliente. A migração inicial
preenche usuários antigos sem tipo como equipe.

Ainda não existe fluxo de cadastro ou alteração de papel para viewer,
operator ou admin. Quando for criado, o cadastro de viewer deverá
permitir definir o tipo; vínculos operator, admin e owner deverão
ajustar o usuário para equipe na mesma transação. Uma redução de
papel não deve rebaixar automaticamente o tipo.

Antes de publicar esta alteração em um banco existente, faça backup,
interrompa as escritas nas coleções users e memberships, confirme o
banco apontado por MONGO_URI e execute:

    node scripts\migrateTipoCliente.js --confirm-database NOME_DO_BANCO

Execute o comando antes de iniciar a nova versão da aplicação.
Não coloque credenciais no comando nem em arquivos versionados.
