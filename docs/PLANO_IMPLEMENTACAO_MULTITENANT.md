# Plano de implementação do sistema multi-tenant

## Objetivo

Evoluir o sistema atual para que várias organizações usem a mesma aplicação sem compartilhar salas, QR Codes, presenças ou perfis biométricos.

O primeiro usuário que criar uma organização também cria o tenant e recebe o papel `owner` nele. Dados de conta, dados biométricos e permissões ficam separados:

- **User:** nome, e-mail normalizado e hash da senha.
- **Tenant:** organização criada pelo primeiro usuário.
- **Membership:** vínculo entre usuário e tenant e papel do usuário naquele tenant.
- **BiometricProfile:** descritor biométrico e registro de consentimento, associado a uma pessoa/conta e a um tenant.

O papel deve ficar em `Membership`, não diretamente em `User`, para permitir que uma conta pertença a mais de uma organização com papéis diferentes.

## Princípios que devem valer em todas as etapas

1. Toda leitura ou alteração de dados de organização deve ser limitada por `tenantId`.
2. Nunca confiar somente em um `tenantId` recebido do navegador.
3. Toda referência entre documentos deve ser validada para garantir que os registros pertençam ao mesmo tenant.
4. Senhas nunca são armazenadas em texto puro. Usar bcrypt com fator de custo 10, conforme requisito.
5. Biometria é opcional, separada da autenticação por senha e protegida como dado sensível.
6. Manter a aplicação antiga operacional até validar a migração e o rollback.


## Etapa 1 — Definir os modelos e índices

### Trabalho

Criar os modelos Mongoose planejados:

- `Tenant`: nome, `slug` único e estado.
- `User`: nome, e-mail normalizado único globalmente, `passwordHash` e estado.
- `Membership`: `tenantId`, `userId`, papel e estado.
- `Person`: cadastro opcional do participante, incluindo nome e e-mail quando necessário.
- `BiometricProfile`: `tenantId`, referência à pessoa, descritor, versão do descritor e consentimento.
- `Room`: sala vinculada a `tenantId`.
- `QrCode`: QR vinculado a `tenantId` e, quando associado, a uma sala.
- `Attendance`: presença vinculada a `tenantId` e sala, com snapshot do nome registrado.

Criar índices, incluindo:

- `Tenant.slug` único.
- `User.emailNormalized` único.
- `Membership(tenantId, userId)` único.
- `BiometricProfile(tenantId, personId)` único, se a regra for um perfil por pessoa.
- Índices de leitura para consultas de salas e relatórios sempre prefixados por `tenantId`.

### Critério de conclusão

- Modelos validam campos obrigatórios e estados permitidos.
- Índices são criados e verificados em banco de desenvolvimento.
- Nenhum endpoint ou fluxo atual foi alterado ainda.

## Etapa 2 — Criar a conta e o tenant inicial juntos

### Trabalho

Criar o fluxo de cadastro inicial de organização:

1. Receber nome da organização, nome do usuário, e-mail e senha.
2. Validar e normalizar os dados no servidor.
3. Calcular o hash com bcrypt usando fator de custo 10.
4. Criar Tenant, User e Membership com papel `owner`.
5. Concluir as três gravações como uma única operação lógica.
6. Se qualquer gravação falhar, não deixar tenant ou usuário parcialmente criado.
7. Após a criação, iniciar uma sessão autenticada e associada ao usuário e ao tenant.

Preferir transação MongoDB quando disponível. Se o ambiente não suportar transações, implementar uma estratégia explícita de rollback e cobri-la com testes.

O formulário público não deve receber ou definir o papel. O servidor sempre atribui `owner` apenas ao primeiro usuário criado junto com o tenant.

### Critério de conclusão

- Um cadastro cria exatamente um Tenant, um User e um Membership `owner`.
- Falhas parciais não deixam registros órfãos.
- E-mail duplicado retorna erro compreensível sem revelar informação indevida.
- Senha em texto puro não é persistida nem registrada.

## Etapa 3 — Implementar autenticação com bcrypt e sessões

### Trabalho

- Alterar o login para buscar a conta pelo e-mail normalizado.
- Comparar a senha enviada com `passwordHash` usando bcrypt.
- Usar o fator de custo 10 na geração dos hashes.
- Não recalcular o hash da senha fornecida para fazer comparação.
- Regenerar a sessão após login bem-sucedido.
- Guardar na sessão o identificador do usuário e o tenant ativo validado, não a senha ou hash.
- Configurar cookies de sessão para produção (`httpOnly`, `secure` e `sameSite`) e armazenamento de sessão persistente apropriado ao ambiente.
- Manter uma migração controlada da conta administrativa antiga; remover `ADMIN_USER` e `ADMIN_PASS` somente após validar a conta migrada.

### Critério de conclusão

- Login válido e inválido são testados.
- Senhas antigas não são aceitas depois da conclusão da migração.
- Sessão nova é emitida após autenticação e invalidada no logout.
- Nenhum hash ou segredo aparece em respostas ou logs.

## Etapa 4 — Adicionar autorização por papel

### Trabalho

Definir papéis iniciais:

- `owner`: gerencia organização e membros.
- `admin`: gerencia salas, QR Codes, presenças e relatórios.
- `operator`: executa operações de presença permitidas.
- `viewer`: consulta dados sem alterá-los.

Criar middleware de autorização por ação. Aplicar permissões por rota/ação, evitando verificações duplicadas e condicionais espalhadas.

Para usuários adicionais, usar convite ou criação administrativa dentro de um tenant existente. O papel é definido pelo servidor após autorização; nunca aceitar um papel privilegiado escolhido pelo próprio usuário.

### Critério de conclusão

- Cada operação administrativa tem uma permissão definida.
- Usuário sem membership ativo não acessa o tenant.
- `viewer` não consegue alterar ou excluir dados.
- Usuário não consegue elevar o próprio papel.

## Etapa 5 — Resolver e aplicar o tenant ativo

### Trabalho

- Definir como usuários que pertencem a vários tenants selecionam ou recebem seu tenant ativo.
- Validar que o usuário autenticado possui Membership ativo para esse tenant.
- Criar middleware que disponibilize o tenant validado para serviços e handlers.
- Nas APIs públicas, resolver o tenant pelo token do QR Code, nunca por um `tenantId` arbitrário informado pelo cliente.
- Validar o tenant das referências associadas, por exemplo, pessoa, sala e QR Code.

### Critério de conclusão

- Sessão sem tenant válido não acessa endpoints de dados.
- Trocar o identificador do tenant na requisição não permite acessar outra organização.
- Check-in por QR resolve tenant e sala usando somente um QR ativo e válido.

## Etapa 6 — Isolar os serviços e rotas por tenant

### Trabalho

Migrar os serviços e endpoints para incluir tenant em toda consulta e escrita:

- Salas e estado de abertura.
- QR Codes e associação à sala.
- Presenças e relatórios.
- Perfis e reconhecimento biométrico.
- Cadastro e gestão de usuários e memberships.

Extrair dados dos arrays atuais de `lotacaoSala` para documentos separados. Preservar os contratos de API necessários ao frontend durante a migração; quando um contrato precisar mudar, atualizar frontend, documentação e coleção Postman juntos.

### Critério de conclusão

- Nenhuma consulta administrativa busca dados sem filtrar pelo tenant.
- Nenhum update/delete usa somente o ID do documento sem escopo do tenant.
- Referências cruzadas entre tenants são rejeitadas.
- Testes automatizados confirmam isolamento entre dois tenants para todos os módulos.

## Etapa 7 — Migrar dados antigos para o tenant padrão

### Trabalho

1. Criar um tenant padrão para os dados atuais.
2. Criar o usuário que representa a administração atual e seu Membership `owner`.
3. Migrar salas de `lotacaoSala.salas[]` para `rooms`.
4. Migrar QR Codes de `lotacaoSala.qrcodes[]` para `qrCodes`.
5. Migrar presenças de `lotacaoSala.historico[]` para `attendances`.
6. Associar perfis de `faceProfiles` a pessoas e ao tenant padrão.
7. Preservar datas, estados, IDs de referência necessários e histórico.
8. Tornar o script repetível: uma segunda execução não deve duplicar dados.
9. Comparar contagens e amostras entre origem e destino.
10. Manter coleções antigas intactas até aprovação da validação e do período de rollback.

Para perfis biométricos sem consentimento comprovável ou sem vínculo confiável com uma pessoa, interromper a migração daquele registro e definir uma política explícita; não atribuir dados biométricos por aproximação de nomes.

### Critério de conclusão

- Contagens e referências reconciliadas.
- Reexecução do script não cria duplicidades.
- Check-in e relatório funcionam com os dados migrados.
- Plano de rollback testado antes de remover qualquer dado antigo.

## Etapa 8 — Tratar biometria como dado sensível

### Trabalho

- Separar a biometria do modelo de autenticação.
- Exigir consentimento explícito antes de criar um perfil biométrico.
- Validar tenant e pessoa relacionados no cadastro, verificação, check-in e exclusão.
- Limitar leitura do descritor e impedir sua inclusão em listagens, logs e respostas.
- Planejar criptografia em repouso e gerenciamento/rotação de chaves.
- Implementar retirada de consentimento e exclusão do perfil.
- Definir retenção e exportação aplicáveis.

### Critério de conclusão

- Perfil de um tenant não participa de comparação facial em outro tenant.
- Sem consentimento, o cadastro não persiste.
- Exclusão e retirada de consentimento têm efeito verificável.
- Logs e respostas não contêm o descritor.

## Etapa 9 — Validar, liberar e remover compatibilidade antiga

### Trabalho

- Rodar testes unitários, integração, migração e regressão.
- Testar manualmente cadastro inicial, login, troca de tenant, permissões, QR, presença, relatório e biometria.
- Implantar primeiro em ambiente de homologação com cópia restaurável dos dados.
- Liberar gradualmente e monitorar erros de autorização e migração.
- Remover caminhos de login e dados antigos somente depois do período de validação acordado.
- Atualizar `docs/ROTAS.md`, `docs/DOCUMENTACAO.md` e exemplos Postman.

### Critério de conclusão

- Testes de isolamento entre tenants passam para cada módulo.
- Não há endpoint administrativo acessível sem autenticação e autorização.
- Dados antigos e novos reconciliados.
- Rollback documentado e testado.
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
| Script de migração executado duas vezes | Nenhuma duplicidade é criada |

## Sequência recomendada de entrega

```text
0. Preparar e registrar baseline
1. Criar modelos e índices
2. Implementar cadastro atômico de tenant + primeiro owner
3. Implementar login bcrypt e sessões
4. Aplicar roles e memberships
5. Resolver tenant ativo
6. Isolar serviços e rotas
7. Migrar os dados antigos
8. Reforçar proteção biométrica
9. Validar em homologação e liberar
```

As etapas 1 a 5 devem ser revisadas antes de iniciar a migração de dados. A etapa de isolamento não deve ser considerada concluída até que testes negativos provem que um tenant não consegue ler ou modificar registros de outro.
