# Plano de Migração: Suporte a Múltiplas Salas

Este documento descreve as etapas necessárias para atualizar o sistema "CheckinQrcode" para suportar eventos com múltiplas salas simultâneas.

## 1. Backend & Banco de Dados

### A. Atualização do Modelo de Dados
Atualmente, o histórico é um array simples de objetos.
*   **Novo Formato de Item:** `{ nome: "João", ip: "...", data: "...", sala: "Sala 1" }`
*   **Configuração:** Precisamos armazenar a lista de salas disponíveis (ex: `["Auditório A", "Laboratório 1"]`). Isso pode ser salvo no mesmo documento do MongoDB ou em uma coleção separada.

### B. Atualização das Rotas (`routes.js`)

1.  **`POST /add`**
    *   Receber `sala` no `req.body`.
    *   Validar se a sala existe na configuração.
    *   Salvar o registro com a tag da sala.

2.  **`GET /qtd`**
    *   Aceitar Query Param: `/qtd?sala=NomeDaSala`.
    *   Se o parâmetro for passado, filtrar o histórico e retornar a contagem daquela sala.
    *   Se não for passado, retornar o total geral ou um objeto detalhado `{ total: 100, salas: { "A": 50, "B": 50 } }`.

3.  **`DELETE /reduce` e `/clean`**
    *   Exigir o parâmetro da sala. Não devemos permitir limpar "tudo" sem querer, ou devemos ter uma flag específica para isso.

4.  **`GET /adm/gerar-qrcode`**
    *   Receber `sala` via Query Param.
    *   Gerar a URL de destino no formato: `http://host/add?sala=NomeDaSala`.

5.  **Novas Rotas de Configuração**
    *   `GET /api/salas`: Retorna lista de salas ativas.
    *   `POST /api/salas`: Cria uma nova sala.
    *   `DELETE /api/salas`: Remove uma sala.

## 2. Frontend - Interface de Check-in (`checkin.html` / `checkin.js`)

*   **Captura de Contexto:** O script deve ler `window.location.search` para extrair o parâmetro `sala`.
*   **Feedback Visual:** Exibir um título "Check-in - [Nome da Sala]" para o usuário ter certeza de onde está entrando.
*   **Envio de Dados:** Incluir a propriedade `sala` no JSON enviado para `/add`.

## 3. Frontend - Painel Administrativo (`adm.html` / `admScript.js`)

### A. Gerenciamento de Salas
*   Adicionar uma nova seção "Salas do Evento".
*   Input de texto + Botão "Adicionar Sala".
*   Lista de salas existentes com botão de excluir.

### B. Geração de QR Code
*   Adicionar um `<select id="salaSelect">` preenchido com as salas cadastradas.
*   Ao clicar em "Gerar QR Code", enviar a sala selecionada para a API.

### C. Monitoramento e Ações
*   O painel deve permitir filtrar as ações por sala.
*   **Visualização:** Mostrar cards separados por sala ou um dropdown para alternar o painel.

## 4. Frontend - Relatórios (`relatorio.html`)

*   A tabela/lista de presença deve ter uma coluna extra "Sala".
*   Opção de filtrar o relatório por sala específica.

## Ordem de Execução Sugerida

1.  Criar as rotas de API para criar/listar salas (`routes.js`).
2.  Atualizar o `adm.html` para permitir criar as salas (para termos dados para testar).
3.  Atualizar a rota `POST /add` e o `checkin.js` para suportar o fluxo completo de registro com sala.
4.  Atualizar a geração de QR Code para incluir o parâmetro na URL.
5.  Atualizar as rotas de contagem e limpeza para respeitar a sala selecionada.
6.  Ajustar o Relatório.
