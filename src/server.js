import 'dotenv/config' // Carrega variáveis do arquivo .env
import app from './app.js'
import mongoose from 'mongoose'
import QrCode from './models/qrCodeModel.js'
import Person from './models/personModel.js'
import User from './models/userModel.js'
import Room from './models/roomModel.js'
import Attendance from './models/attendanceModel.js'
import CheckinPeriod from './models/checkinPeriodModel.js'
import Tenant from './models/tenantModel.js'
import Membership from './models/membershipModel.js'
import BiometricProfile from './models/biometricProfileModel.js'

const PORT = process.env.PORT || 3000

// mongoose.connect('mongodb+srv://<db_username>:<db_password>@cluster0.io0iuxb.mongodb.net/?appName=Cluster0')
try {
    await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false })
    console.log('Conectado ao MongoDB com sucesso!')

    const roomsSemPeriodo = await Room.exists({
        currentPeriodId: { $not: { $type: 'objectId' } },
    })
    const presencasSemPeriodo = await Attendance.exists({
        periodId: { $not: { $type: 'objectId' } },
    })
    const existeAttendances = await mongoose.connection.db
        .listCollections({ name: 'attendances' }, { nameOnly: true }).hasNext()
    const indices = existeAttendances ? await Attendance.collection.indexes() : []
    const indiceAntigo = indices.some(index =>
        index.unique === true &&
        JSON.stringify(index.key) === JSON.stringify({ tenantId: 1, roomId: 1, personNameKey: 1 }),
    )
    if (roomsSemPeriodo || presencasSemPeriodo || indiceAntigo) {
        throw new Error('Migração de períodos necessária. Execute scripts\\migrateCheckinPeriods.js antes de iniciar.')
    }

    await QrCode.createIndexes()
    await User.createIndexes()
    await Person.createIndexes()
    await Room.createIndexes()
    await Attendance.createIndexes()
    await CheckinPeriod.createIndexes()
    await Tenant.createIndexes()
    await Membership.createIndexes()
    await BiometricProfile.createIndexes()
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
