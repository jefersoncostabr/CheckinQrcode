# Resumo de Rotas da Aplicação

Este documento resume todas as rotas disponíveis, separadas entre páginas públicas (que retornam interfaces HTML) e endpoints de API (que retornam dados JSON).

## Páginas Públicas (Interfaces HTML)

| Rota         | Descrição                                                 |
| :----------- | :-------------------------------------------------------- |
| `/add`       | Exibe a página para o usuário confirmar o check-in.       |
| `/relatorio` | Exibe o relatório de presença com a lista de nomes.       |
| `/adm`       | Exibe o painel de administração para gerenciar a aplicação. |
| `/resetls`   | Executa um script para limpar a memória do navegador.     |

## Endpoints da API (JSON)

### Controle de Presença
| Método   | Rota      | Descrição                               |
| :------- | :-------- | :-------------------------------------- |
| `GET`    | `/`       | Verifica se o servidor está online.     |
| `GET`    | `/qtd`    | Retorna a quantidade atual de check-ins.|
| `POST`   | `/add`    | Registra um novo check-in com um nome.  |
| `DELETE` | `/reduce` | Remove o último check-in realizado.     |
| `DELETE` | `/clean`  | Limpa todo o histórico de check-ins.    |

### Relatórios
| Método   | Rota             | Descrição                                      |
| :------- | :--------------- | :--------------------------------------------- |
| `GET`    | `/api/relatorio` | Fornece os dados do relatório em formato JSON. |

### Administração
| Método   | Rota                | Descrição                                        |
| :------- | :------------------ | :----------------------------------------------- |
| `GET`    | `/adm/gerar-qrcode` | Gera um QR Code e retorna como Data URI (JSON).  |