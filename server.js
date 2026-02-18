import 'dotenv/config' // Carrega variáveis do arquivo .env
import app from './app.js'
import mongoose from 'mongoose'

const PORT = process.env.PORT || 3000

// mongoose.connect('mongodb+srv://<db_username>:<db_password>@cluster0.io0iuxb.mongodb.net/?appName=Cluster0')
try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Conectado ao MongoDB com sucesso!')
} catch (err) {
    console.error('Erro ao conectar ao MongoDB:', err)
}

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`)
})
