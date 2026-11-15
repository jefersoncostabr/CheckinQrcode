import 'dotenv/config' // Carrega variáveis do arquivo .env
import app from './app.js'
import mongoose from 'mongoose'
import QrCode from './models/qrCodeModel.js'
import Person from './models/personModel.js'
import User from './models/userModel.js'

const PORT = process.env.PORT || 3000

// mongoose.connect('mongodb+srv://<db_username>:<db_password>@cluster0.io0iuxb.mongodb.net/?appName=Cluster0')
try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Conectado ao MongoDB com sucesso!')

    await QrCode.createIndexes()
    await User.createIndexes()
    await Person.createIndexes()
    await mongoose.connection.collection('checkinLoginAttempts')
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`)
        console.log(`Gerenciendo as salas em http://localhost:${PORT}/adm`)
    })
} catch (err) {
    console.error('Erro ao conectar ao MongoDB ou preparar os índices:', err)
    await mongoose.disconnect()
    process.exitCode = 1
}
