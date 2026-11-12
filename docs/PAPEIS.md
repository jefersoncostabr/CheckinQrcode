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


O papel `user` recebe exclusivamente `attendance:create`. Portanto, ele não tem acesso de leitura ao histórico ou à lista de salas. Essa restrição também se aplica à interface: uma operação que precise listar salas para escolher uma delas exige a permissão `rooms:read`.

As permissões efetivas são carregadas do vínculo ativo no banco; o papel informado pelo navegador ou pela sessão não substitui essa verificação.
