import express from 'express'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import path from 'path'
import { fileURLToPath } from 'url'
import routes from './routes/routes.js'
import adminRoutes from './routes/adminRoutes.js'
import tenantRoomRoutes from './routes/tenantRoomRoutes.js'
import tenantQrCodeRoutes from './routes/tenantQrCodeRoutes.js'
import tenantCheckinRoutes from './routes/tenantCheckinRoutes.js'
import tenantAttendanceRoutes from './routes/tenantAttendanceRoutes.js'
import tenantAuthRoutes from './routes/tenantAuthRoutes.js'
import tenantBiometricRoutes from './routes/tenantBiometricRoutes.js'
import tenantClassRoutes from './routes/tenantClassRoutes.js'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1)
}

// Consumir corpo de formulários (login) e JSON
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

const sessionSecret = process.env.SESSION_SECRET || 'mudar-para-uma-senha-aleatoria'
if (!process.env.SESSION_SECRET) {
    console.warn('A variável de ambiente SESSION_SECRET não está definida. Use um valor forte em produção.')
}

function criarStoreMongo(collectionName, ttl) {
    if (!process.env.MONGO_URI) {
        return undefined
    }
    return MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName,
        ttl,
        autoRemove: 'native',
    })
}

// --- Sessão do participante (check-in via QR): 30 dias, cookie próprio ---
const participanteSession = session({
    secret: sessionSecret,
    name: 'checkin.sid',
    store: criarStoreMongo('sessions_checkin', 30 * 24 * 60 * 60),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/checkin/tenant',
        maxAge: 30 * 24 * 60 * 60 * 1000,
    },
})

// --- Sessão administrativa (7 dias) ---
const adminSession = session({
    secret: sessionSecret,
    name: 'connect.sid',
    store: criarStoreMongo('sessions', 7 * 24 * 60 * 60),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    },
})

// Monta as rotas de check-in ANTES da sessão administrativa, com a sessão do participante
app.use('/api/checkin/tenant', participanteSession, tenantCheckinRoutes)

// Sessão administrativa para as demais rotas
app.use(adminSession)

// Protege endpoints/arquivos administrativos que estão expostos via `public`
app.use((req, res, next) => {
    const isAdminPath =
        req.path === '/adm' ||
        req.path.startsWith('/adm/') ||
        req.path === '/adm.html' ||
        req.path === '/admAdd.html' ||
        req.path === '/admScript.js' ||
        req.path === '/admEstilo.css' ||
        req.path === '/admFaceMonitor.html' ||
        req.path === '/admFaceMonitor.js' ||
        req.path === '/relatorio' ||
        req.path === '/relatorio.html' ||
        req.path === '/relatorioScript.js' ||
        req.path === '/relatorioEstilo.css' ||
        req.path === '/face-test.html' ||
        req.path === '/face-test.js'

    if (isAdminPath && !req.session?.tenantAuth?.userId) {
        return res.redirect('/login')
    }

    if (req.path === '/adm.html') {
        return res.redirect('/adm')
    }

    next()
})

// Serve arquivos estáticos da pasta 'public'
app.use(express.static(path.resolve(__dirname, '..', 'public')))

app.use('/adm', adminRoutes)
app.use('/api/tenant', tenantRoomRoutes)
app.use('/api/tenant', tenantQrCodeRoutes)
app.use('/api/tenant', tenantAttendanceRoutes)
app.use('/api/tenant', tenantBiometricRoutes)
app.use('/api/tenant/auth', tenantAuthRoutes)
app.use('/api/tenant', tenantClassRoutes)
app.use(routes)

export default app
