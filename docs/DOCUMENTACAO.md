# Documentação do Check-in QR Code

## Banco de dados

O servidor conecta ao endereço definido em `MONGO_URI`; o nome do banco não é fixado no código. No `.env` local atual, o caminho da URI seleciona `Checkin_de_sala`. A configuração de produção deve ser conferida separadamente no provedor de hospedagem.

As funcionalidades do painel `/adm` e do check-in usam coleções separadas e isoladas por organização:

```text
Checkin_de_sala
├── tenants             organizações
├── users               contas e hashes de senha
├── memberships         vínculos das contas com organizações e seus papéis
├── rooms               salas por organização
├── qrCodes             QR Codes por organização (somente hash do token)
├── people              participantes por organização
├── attendances         presenças por organização e sala
└── biometricProfiles   descritores e consentimentos por organização
```

As coleções antigas `lotacaoSala` e `faceProfiles` não são usadas pelos fluxos atuais do painel e do check-in. Elas não foram apagadas nem migradas. O reset do banco não foi executado; não execute `npm run db:reset` sem autorização e confirmação do banco alvo.

## Contas e acesso ao painel

1. Abra `/criar-conta.html` e crie a organização e a primeira conta. Essa conta recebe o papel `owner`.
2. Entre por `/login` usando e-mail e senha.
3. Após o login, o sistema abre `/adm`. Se a conta tiver vínculos com mais de uma organização, escolha qual será a ativa.
4. As APIs verificam novamente o vínculo e o papel no servidor; o tenant enviado pelo navegador não define o escopo.

O endpoint `POST /login` não autentica mais credenciais administrativas globais e responde `410 Gone`. Use o login tenant.

## Painel `/adm`

O painel mantém suas funções, mas opera nos endpoints tenant-scoped:

- Salas: criar, fechar/reabrir e arquivar.
- QR Codes: criar (até 10 por organização), associar a salas, revogar e gerar novo token/imagem quando necessário.
- Presenças: visualizar contagens, registrar manualmente, remover a última ou limpar as presenças de uma sala.
- Relatórios: consultar registros e filtrar por sala.
- Biometria: cadastrar e excluir perfis; testar reconhecimento e usar monitor facial.

As permissões variam conforme o papel da conta. Consulte a matriz completa em [PAPEIS.md](./PAPEIS.md). O papel `user`, por exemplo, pode criar presenças, mas não consultar salas ou presenças.

## Check-in com QR Code

O QR aponta para uma URL no formato:

```text
https://<dominio-publico>/add#<TOKEN>
```

O token é emitido quando o QR é criado e não pode ser recuperado depois; a imagem deve ser baixada e guardada. Rotacionar o QR emite outro token e invalida as cópias anteriores. O servidor guarda o hash do token, resolve por ele a organização e a sala e aceita check-in somente se o QR, a organização e a sala estiverem ativos. O token é enviado à API no corpo da requisição; a página não seleciona um tenant por `tenantId`.

O check-in por nome continua disponível como alternativa ao facial. A biometria requer consentimento explícito no cadastro e em cada operação facial. A câmera é processada no navegador; o servidor recebe o descritor facial, que é um dado biométrico sensível. O nome informado no cadastro biométrico não valida a identidade civil da pessoa.

## Leitor e monitor facial

- A câmera requer HTTPS ou `localhost` no próprio dispositivo. Ao abrir pelo celular, o endereço deve ser HTTPS ou um domínio local configurado para HTTPS.
- A página pública de check-in e o monitor facial pedem consentimento antes da operação biométrica.
- No monitor do painel, selecione uma sala aberta ou leia o QR dela e inicie manualmente. A câmera encerra ao parar o monitoramento ou fechar a página.
- Não use reconhecimento facial como prova de identidade ou mecanismo de segurança.

## Endereços e QR na rede local

- Local: `http://localhost:3000`
- Render: `https://checkinqrcode.onrender.com`

No celular, `localhost` aponta para o próprio telefone. Para testes locais, conecte o computador e o celular à mesma rede Wi-Fi e use o IPv4 do computador. Configure `PUBLIC_BASE_URL` quando o endereço público ou local não puder ser detectado automaticamente. A variável de produção deve conter o domínio HTTPS canônico.

## Configuração para produção

- Configure `MONGO_URI` para o banco correto (incluindo `Checkin_de_sala` no caminho da URI) e use valores seguros fora do repositório.
- Configure um `SESSION_SECRET` forte e `NODE_ENV=production`.
- Configure `PUBLIC_BASE_URL` com o endereço HTTPS público para criar QR Codes válidos fora da máquina local.
- As sessões são armazenadas na coleção "sessions" do MongoDB por meio do `connect-mongo`, usando a variável `MONGO_URI`.
- As sessões persistem após reinícios do processo do servidor.
- O cookie e as sessões expiram após 7 dias.

Para a lista completa de rotas e permissões, consulte [ROTAS.md](./ROTAS.md).
