import express from 'express'
import routes from './routes.js'
import adminRoutes from './adminRoutes.js'

const app = express()

app.use('/adm', adminRoutes)
app.use(routes)

export default app