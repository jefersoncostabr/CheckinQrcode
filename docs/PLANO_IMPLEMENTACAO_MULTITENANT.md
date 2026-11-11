# Plano de implementação do sistema multi-tenant

## Objetivo

Evoluir o sistema atual para que várias organizações usem a mesma aplicação sem compartilhar salas, QR Codes, presenças ou perfis biométricos.

O primeiro usuário que criar uma organização também cria o tenant e recebe o papel `owner` nele. Dados de conta, dados biométricos e permissões ficam separados:

- **User:** nome, e-mail normalizado e hash da senha.
- **Tenant:** organização criada pelo primeiro usuário.
- **Membership:** vínculo entre usuário e tenant e papel do usuário naquele tenant.
- **BiometricProfile:** descritor biométrico e registro de consentimento, associado a uma pessoa/conta e a um tenant.

O papel deve ficar em `Membership`, não diretamente em `User`, para permitir que uma conta pertença a mais de uma organização com papéis diferentes.

## Estado da implementação

- ~~Fundação: modelos `Tenant`, `User`, `Membership` e `BiometricProfile`, serviço transacional para criar tenant + primeiro owner e utilitário bcrypt com custo 10.~~
- ~~Etapa 1: schemas das entidades principais e índices compostos declarados nos modelos.~~
- Etapa 1: índices declarados nos modelos e cobertos por testes de schema.
- Etapa 3: serviço, endpoints e telas de cadastro/login tenant; seleção e troca de tenant revalidam o Membership antes de atualizar a sessão.
- Etapa 4: matriz central de permissões e middleware verificam Membership, usuário e tenant ativos em cada autorização.
- Etapa 5: Membership ativo é resolvido novamente no servidor, e `loadActiveTenant` popula `req.tenant` com dados validados pela sessão e banco.
- Etapa 6: rotas de salas, QR Codes, presenças e biometria usam o tenant validado, permissões e documentos separados.
- ~~A escolha do tenant ainda não tem fluxo de tela/rota.~~ Login e seleção/troca do tenant estão disponíveis na tela de autenticação e na API.
- Cadastro tenant está ligado à tela e à rota e inicia `tenantAuth`; a tela permite selecionar uma organização e a API também permite trocar a ativa.
- O painel existente em `/adm` foi conectado às APIs tenant-scoped para salas, QR Codes, presenças, relatórios e biometria. Os fluxos de autenticação e check-in globais antigos foram desativados.

## Princípios que devem valer em todas as etapas

1. Toda leitura ou alteração de dados de organização deve ser limitada por `tenantId`.
2. Nunca confiar somente em um `tenantId` recebido do navegador.
3. Toda referência entre documentos deve ser validada para garantir que os registros pertençam ao mesmo tenant.
4. Senhas nunca são armazenadas em texto puro. Usar bcrypt com fator de custo 10, conforme requisito.
5. Biometria é opcional, separada da autenticação por senha e protegida como dado sensível.
6. Não migrar os dados antigos; reinicializar o banco antes de começar a operação com dados multi-tenant.


## Etapa 1 — Definir os modelos e índices

### Trabalho

Schemas Mongoose criados:

- ~~`Tenant`: nome, `slug` único e estado.~~
- ~~`User`: nome, e-mail normalizado (campo `email`) único globalmente, `passwordHash` e estado.~~
- ~~`Membership`: `tenantId`, `userId`, papel e estado.~~
- ~~`Person`: cadastro opcional do participante, incluindo nome e e-mail quando necessário.~~
- ~~`BiometricProfile`: `tenantId`, referência à pessoa, descritor, versão do descritor e consentimento.~~
- ~~`Room`: sala vinculada a `tenantId`.~~
- ~~`QrCode`: QR vinculado a `tenantId` e, quando associado, a uma sala.~~
- ~~`Attendance`: presença vinculada a `tenantId` e sala, com snapshot do nome registrado.~~

Índices declarados nos modelos:

- ~~`Tenant.slug` único.~~
- ~~`User.email` único, normalizado para lowercase.~~
- ~~`Membership(tenantId, userId)` único.~~
- ~~`Person(tenantId, email)` único quando o e-mail está presente.~~
- ~~`BiometricProfile(tenantId, personId)` único.~~
- ~~Índices de leitura para consultas de salas, QR Codes e relatórios prefixados por `tenantId`.~~

### Critério de conclusão

- ~~Modelos validam campos obrigatórios e estados permitidos.~~
- Índices são declarados e cobertos por testes de schema.
- ~~Nenhum endpoint ou fluxo atual foi alterado nesta etapa.~~

## Etapa 2 — Criar a conta e o tenant inicial juntos

### Trabalho

O serviço `createTenantOwner` e a rota `POST /api/tenant/auth/register` estão implementados:

1. ~~Receber nome da organização, nome do usuário, e-mail e senha.~~
2. ~~Validar os dados e normalizar o e-mail no servidor.~~
3. ~~Calcular o hash com bcrypt usando fator de custo 10.~~
4. ~~Criar Tenant, User e Membership com papel `owner`.~~
5. ~~Concluir as três gravações em transação MongoDB.~~
6. ~~Deixar a transação abortar se qualquer gravação falhar.~~
7. ~~Após a criação, iniciar uma sessão autenticada e associada ao usuário e ao tenant.~~

O banco usado para executar o serviço precisa suportar transações MongoDB (replica set ou cluster).

O formulário público não deve receber ou definir o papel. O servidor sempre atribui `owner` apenas ao primeiro usuário criado junto com o tenant.

### Critério de conclusão

- ~~O serviço cria exatamente um Tenant, um User e um Membership `owner`.~~
- ~~Falhas dentro da transação abortam a operação.~~
- ~~E-mail duplicado é mapeado para conflito.~~
- ~~Senha em texto puro não é persistida.~~
- ~~Cadastro via rota, resposta HTTP e sessão.~~

## Etapa 3 — Implementar autenticação com bcrypt e sessões

### Trabalho

- ~~Criar serviço de autenticação que busca a conta pelo e-mail normalizado.~~
- ~~Comparar a senha enviada com `passwordHash` usando bcrypt.~~
- ~~Usar fator de custo 10 na geração de hashes.~~
- ~~Não recalcular o hash da senha fornecida para comparar.~~
- ~~Criar helper que regenera a sessão e guarda somente usuário, tenant, membership e papel em `tenantAuth`.~~
- ~~Rotas HTTP de login/logout tenant; seleção e troca de tenant com revalidação do Membership.~~
- A sessão `tenantAuth` protege o painel e as operações tenant-scoped.
- ~~Configurar cookies de sessão (`httpOnly`, `secure` e `sameSite`).~~ Armazenamento de sessão persistente apropriado ao ambiente continua pendente.
- Não migrar a conta administrativa antiga. A primeira conta deve ser criada pelo fluxo multi-tenant; `ADMIN_USER` e `ADMIN_PASS` não são mais usados pelo login.

### Critério de conclusão

- ~~Autenticação válida/inválida e memberships ativos/suspensos são testados no serviço.~~
- ~~Login HTTP com conta tenant, seleção de tenant, confirmação da sessão e logout.~~
- A conta administrativa antiga não é reutilizada; a nova conta owner é criada no tenant inicial.
- ~~Helper de sessão regenera a sessão e não define a propriedade legacy `session.user`.~~
- Nenhum hash ou segredo aparece em respostas ou logs.

## Etapa 4 — Adicionar autorização por papel

### Trabalho

Papéis definidos:

- ~~`owner`: todas as permissões do tenant.~~
- ~~`admin`: gerencia salas, QR Codes, presenças, relatórios e biometria, sem gerenciar organização ou memberships.~~
- ~~`operator`: consulta salas e QRs e cria presenças.~~
- ~~`viewer`: consulta salas, presenças e relatórios, sem alterar dados.~~

Criar middleware de autorização por ação. O middleware está em `src/middleware/authorizeTenant.js`; ele consulta o Membership atual, valida o status do usuário e do tenant, não confia no papel guardado na sessão e disponibiliza o tenant validado em `req.tenant`.

Permissões disponíveis: `tenant:manage`, `members:manage`, `rooms:read`, `rooms:manage`, `qrcodes:read`, `qrcodes:manage`, `attendance:create`, `attendance:read`, `attendance:manage`, `reports:read` e `biometrics:manage`.

O middleware de permissão está aplicado às rotas operacionais do painel. O escopo `tenantId` é obtido a partir do Membership revalidado no servidor e é aplicado nas consultas dos respectivos serviços.

Para usuários adicionais, usar convite ou criação administrativa dentro de um tenant existente. O papel é definido pelo servidor após autorização; nunca aceitar um papel privilegiado escolhido pelo próprio usuário.

### Critério de conclusão

- ~~Matriz de permissões por papel definida e testada.~~
- ~~Middleware nega usuário, tenant ou Membership inativo e papel sem permissão.~~
- ~~Alteração de papel no banco tem efeito imediato: o middleware não confia no papel antigo da sessão.~~
- ~~Proteger rotas com a permissão correta e o escopo `tenantId`.~~
- Usuário `viewer` deve continuar sendo coberto pelos testes de autorização das rotas.

## Etapa 5 — Resolver e aplicar o tenant ativo

### Trabalho

- ~~Definir seleção de tenant a partir de um Membership retornado no login, exibir a escolha e revalidá-lo pelo usuário autenticado.~~
- ~~Validar que o usuário autenticado possui Membership ativo para o tenant escolhido e que a própria conta e o tenant também estão ativos.~~
- ~~Criar middleware `loadActiveTenant` que disponibiliza o tenant validado em `req.tenant`, sem ler `tenantId` do query/body.~~
- ~~Nas APIs públicas, resolver o tenant pelo token do QR Code, nunca por um `tenantId` arbitrário informado pelo cliente.~~
- ~~Validar o tenant das referências associadas, como pessoa, sala e QR Code.~~

### Critério de conclusão

- ~~Sessão sem tenant válido é negada pelo middleware de resolução; não há ainda endpoints de dados conectados a esse middleware.~~
- ~~IDs de tenant enviados no query/body não alteram o tenant resolvido da sessão.~~
- ~~Check-in por QR resolve tenant e sala usando somente um QR ativo e válido.~~ O token nunca substitui a validação do estado do tenant e da sala.

## Etapa 6 — Isolar os serviços e rotas por tenant

### Trabalho

Módulos migrados: salas em `src/services/tenantRoomService.js` e `src/routes/tenantRoomRoutes.js`; QR Codes em `src/services/tenantQrCodeService.js` e `src/routes/tenantQrCodeRoutes.js`; resolução pública do token e registro de presença QR em `src/services/tenantCheckinService.js` e `src/routes/tenantCheckinRoutes.js`; consulta/remoção de presenças e relatório agregado em `src/services/tenantAttendanceService.js` e `src/routes/tenantAttendanceRoutes.js`; biometria em `src/services/tenantBiometricService.js`, `src/routes/tenantBiometricRoutes.js` e nas rotas públicas de check-in por QR.

- ~~Salas: listar, criar, alterar estado e arquivar com filtros por `tenantId`.~~
- Salas usam índice único tenant-scoped para nome ativo; arquivar remove a chave ativa sem apagar a sala/histórico.
- ~~QR Codes: listar, criar com token secreto exibido uma única vez, associar/liberar sala do mesmo tenant e revogar.~~
- ~~Check-in público pelo token: resolve QR ativo, valida tenant e sala no servidor, e registra a presença em `attendances`.~~
- ~~Presenças: consulta paginada, filtro por sala do tenant e remoção tenant-scoped. Relatório agregado por sala.~~
- ~~Biometria: cadastro com consentimento explícito, comparação limitada ao tenant do QR, check-in e exclusão com credencial de retirada.~~
- Gestão de contas e memberships da organização não faz parte das telas existentes migradas nesta etapa.

As rotas administrativas exigem permissões específicas e obtêm o tenant via middleware, sem aceitar `tenantId` do corpo. A associação de QR valida que sala e QR pertencem ao tenant ativo; a criação de sala com QR associa ambos em uma transação. A revogação mantém o documento e limpa sua associação. O check-in público por QR e o painel `/adm` usam os fluxos tenant-scoped. Os dados existentes no banco não foram apagados nem migrados.

### Critério de conclusão

- ~~As operações do novo serviço de salas filtram por `tenantId`; alterações também combinam ID da sala e tenant.~~
- ~~As rotas novas requerem a permissão correta e ignoram `tenantId` vindo do cliente.~~
- ~~QR Codes e salas relacionados são consultados no escopo do mesmo tenant; o hash secreto nunca é serializado.~~
- ~~Check-in público usa token do QR, valida estado do tenant/sala e não confia em IDs enviados pelo navegador.~~
- ~~Presenças e relatórios filtram por tenant; a remoção combina ID da presença e tenant.~~
- Gestão de contas e memberships ainda não está disponível no painel.
- A cobertura automatizada precisa ser executada para as últimas alterações; os testes de integração que dependem de MongoDB exigem o banco configurado.

## Etapa 7 — Reinicializar o banco sem migrar dados antigos

### Trabalho

Não haverá migração dos dados antigos. O script `scripts/resetDatabase.js` remove os documentos de todas as coleções de dados do banco indicado por `MONGO_URI`, incluindo as coleções legadas e as novas coleções multi-tenant. Ele preserva as coleções e seus índices, e não deve ser executado automaticamente pela aplicação.

Para executar em desenvolvimento, informe exatamente o nome do banco que aparece na `MONGO_URI`:

```text
npm run db:reset -- --confirm-reset <nome-do-banco>
```

O script recusa `NODE_ENV=production`, exige nome de banco explícito e bloqueia hosts remotos por padrão. Para um banco remoto, a confirmação adicional é explícita:

```text
npm run db:reset -- --confirm-reset <nome-do-banco> --allow-remote
```

Antes de executar, confirme host e nome do banco e faça backup se houver qualquer possibilidade de precisar dos dados. A exclusão é irreversível e inclui cadastros, presenças, salas, QR Codes, contas, memberships e dados biométricos. O script não cria tenant nem usuário owner; esses registros deverão ser criados pelo fluxo de cadastro após sua integração.

### Critério de conclusão

- ~~Decisão registrada de não migrar os dados antigos.~~
- Script de limpeza exige confirmação do banco alvo e bloqueia produção por `NODE_ENV`.
- A limpeza não é executada como parte dos testes ou da inicialização normal do servidor.
- O check-in por QR tenant-scoped usa token no fragmento da URL e envia o token no corpo da API; os endpoints globais antigos foram desativados.
- A biometria tenant-scoped exige consentimento a cada uso.

## Etapa 8 — Tratar biometria como dado sensível

### Trabalho

- ~~Separar a biometria do modelo de autenticação.~~
- ~~Exigir consentimento explícito antes de criar um perfil biométrico e a cada check-in facial.~~
- ~~Validar tenant e pessoa relacionados no cadastro e check-in; a exclusão exige credencial de alta entropia vinculada ao perfil.~~
- ~~Limitar leitura do descritor e impedir sua inclusão em listagens, logs e respostas.~~
### Critério de conclusão

- ~~Perfil de um tenant não participa de comparação facial em outro tenant.~~
- ~~Sem consentimento, o cadastro não persiste.~~
- ~~Exclusão remove o perfil e interrompe comparação e retirada de consentimento.~~
- ~~Descritores não são retornados pelas APIs.~~ Não há logging de descritor no fluxo novo.

## Etapa 9 — Validar e liberar

### Trabalho

- Rodar testes unitários e de integração com o MongoDB configurado.
- Liberar gradualmente e monitorar erros de autorização e persistência.
- Manter `docs/ROTAS.md` e a documentação relacionada alinhadas às rotas disponíveis.

### Critério de conclusão

- Testes de isolamento entre tenants passam para cada módulo.
- Não há endpoint administrativo acessível sem autenticação e autorização.
- Banco sem documentos antigos e tenant inicial criado pelo novo fluxo.
- Backup dos dados antigos feito antes do reset, caso seja necessário preservar uma cópia externa.
- Documentação reflete o comportamento publicado.

## Matriz mínima de testes

| Cenário | Resultado esperado |
|---|---|
| Primeiro cadastro válido | Cria tenant, conta e Membership `owner` |
| Criação falha ao salvar o vínculo | Não deixa tenant/conta incompletos |
| E-mail já cadastrado | Rejeita sem criar tenant duplicado |
| Senha válida/incorreta | Login aceita/rejeita por comparação bcrypt |
| Usuário sem Membership | Acesso ao tenant negado |
| Usuário `viewer` altera uma sala | Operação negada |
| Tenant A consulta ID de sala do tenant B | Nenhum dado de B é retornado ou alterado |
| QR de A tenta resolver sala de B | Check-in rejeitado |
| Perfil biométrico de A é comparado no tenant B | Perfil não é consultado |
| Script de reset executado novamente | Nenhum documento antigo permanece; a segunda execução não falha por banco vazio |

## Sequência recomendada de entrega

```text
0. Preparar e registrar baseline
1. Criar modelos e índices
2. Implementar cadastro atômico de tenant + primeiro owner
3. Implementar login bcrypt e sessões
4. Aplicar roles e memberships
5. Resolver tenant ativo
6. Isolar serviços e rotas
7. Limpar os dados antigos com confirmação explícita; não migrar
8. Reforçar proteção biométrica
9. Executar testes automatizados e preparar a liberação
```

As etapas 1 a 5 devem ser revisadas antes de iniciar o uso do banco limpo. A limpeza destrói os dados atuais e não é executada pela aplicação ou pela suíte de testes. A etapa de isolamento não deve ser considerada concluída até que testes negativos provem que um tenant não consegue ler ou modificar registros de outro.
