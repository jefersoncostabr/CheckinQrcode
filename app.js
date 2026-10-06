import express from 'express'
import session from 'express-session'
import routes from './routes.js'
import adminRoutes from './adminRoutes.js'

const app = express()

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
}

// Consumir corpo de formulários (login) e JSON
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Sessões (usadas para autenticação básica)
const sessionSecret = process.env.SESSION_SECRET || 'mudar-para-uma-senha-aleatoria'
if (!process.env.SESSION_SECRET) {
    console.warn('A variável de ambiente SESSION_SECRET não está definida. Use um valor forte em produção.')
}
app.use(
    session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: process.env.NODE_ENV === 'production' }
    })
)

// Protege endpoints/arquivos administrativos que estão expostos via `public`
app.use((req, res, next) => {
    const isAdminPath =
        req.path === '/adm' ||
        req.path.startsWith('/adm/') ||
        req.path === '/adm.html' ||
        req.path === '/admAdd.html' ||
        req.path === '/admScript.js' ||
        req.path === '/admEstilo.css'

    if (isAdminPath && !req.session?.user) {
        return res.redirect('/login')
    }

    next()
})

// Serve arquivos estáticos da pasta 'public'
app.use(express.static('public'))

app.use('/adm', adminRoutes)
app.use(routes)

export default app