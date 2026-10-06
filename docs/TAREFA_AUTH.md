# Plano de Implementação: Autenticação Básica com Sessão

Este documento descreve as etapas para proteger a rota `/adm` utilizando `express-session` e um middleware de autenticação simples.



## 3. Configuração do Express Session (app.js)

No arquivo principal de configuração do Express (geralmente `app.js`), importar e configurar o middleware de sessão antes das rotas:

```javascript
import session from 'express-session';

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Usar true se estiver em HTTPS
}));
```

## 4. Criação do Middleware de Autenticação

Criar uma função middleware (pode ser em `routes.js` ou um arquivo separado `middleware/auth.js`) para verificar se a sessão existe:

```javascript
const requireAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};
```

## 5. Implementação das Rotas de Login e Logout (routes.js)

1.  **GET /login**: Servir um arquivo HTML simples com formulário (usuário e senha).
2.  **POST /login**: Verificar se `req.body.user` e `req.body.pass` batem com as variáveis do `.env`.
    *   Se sim: definir `req.session.user = true` e redirecionar para `/adm`.
    *   Se não: retornar erro ou redirecionar para `/login` com mensagem.
3.  **GET /logout**: Destruir a sessão (`req.session.destroy()`) e redirecionar para `/login`.

## 6. Proteção da Rota /adm

Aplicar o middleware `requireAuth` na rota `/adm` e nas rotas de API administrativas:

```javascript
// Em routes.js
router.get('/adm', requireAuth, (req, res) => { ... });
router.use('/adm/*', requireAuth); // Protege sub-rotas se houver
```

## 7. Frontend (Login)

Criar o arquivo `public/login.html` contendo um formulário que faz POST para `/login`.