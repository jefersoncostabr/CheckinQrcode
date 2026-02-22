import express from 'express'
import routes from './routes.js'
import adminRoutes from './adminRoutes.js'

const app = express()

// Serve arquivos estáticos da pasta 'public'
app.use(express.json())
app.use(express.static('public'))

app.use('/adm', adminRoutes)
app.use(routes)

export default app