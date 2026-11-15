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


| Papel | Permissões |
| --- | --- |
| `owner` | Todas as permissões: gerenciar a organização e membros; consultar e gerenciar salas e QR Codes; criar, consultar e gerenciar presenças; consultar relatórios; gerenciar biometria. |
| `admin` | Consultar e gerenciar salas e QR Codes; criar, consultar e gerenciar presenças; consultar relatórios; gerenciar biometria. Não pode gerenciar a organização nem os membros. |
| `operator` | Consultar salas e QR Codes; criar e consultar presenças. |
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

No painel, os links Teste Facial e Relatório são exibidos desde o carregamento inicial
somente para os papéis com as respectivas permissões.
