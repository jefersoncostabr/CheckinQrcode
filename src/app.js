import express from 'express'
import session from 'express-session'
import path from 'path'
import { fileURLToPath } from 'url'
import routes from './routes/routes.js'
import adminRoutes from './routes/adminRoutes.js'
import tenantRoomRoutes from './routes/tenantRoomRoutes.js'
import tenantQrCodeRoutes from './routes/tenantQrCodeRoutes.js'
import tenantCheckinRoutes from './routes/tenantCheckinRoutes.js'
import tenantAttendanceRoutes from './routes/tenantAttendanceRoutes.js'
import tenantAuthRoutes from './routes/tenantAuthRoutes.js'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        }
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
app.use(express.static(path.resolve(__dirname, '..', 'public')))

app.use('/adm', adminRoutes)
app.use('/api/tenant', tenantRoomRoutes)
app.use('/api/tenant', tenantQrCodeRoutes)
app.use('/api/checkin/tenant', tenantCheckinRoutes)
app.use('/api/tenant', tenantAttendanceRoutes)
app.use('/api/tenant/auth', tenantAuthRoutes)
app.use(routes)

export default app