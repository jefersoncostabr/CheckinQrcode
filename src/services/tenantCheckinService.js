import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import Attendance from '../models/attendanceModel.js'
import QrCode from '../models/qrCodeModel.js'
import Room from '../models/roomModel.js'
import Tenant from '../models/tenantModel.js'
import User from '../models/userModel.js'
import Membership from '../models/membershipModel.js'
import Person from '../models/personModel.js'
import { roleHasTenantPermission } from '../middleware/authorizeTenant.js'
import { hashPassword, verifyPassword } from './passwordService.js'
import {
    inserirPresencaNoPeriodo,
    obterPeriodoCorrente,
} from './checkinPeriodService.js'

const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export class TenantCheckinError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantCheckinError'
        this.statusCode = statusCode
    }
}

function hashToken(token) {
    if (typeof token !== 'string' || !QR_TOKEN_PATTERN.test(token)) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    return createHash('sha256').update(token).digest('hex')
}

function normalizarNome(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

function validarSenha(senha) {
    if (typeof senha !== 'string') {
        throw new TenantCheckinError('A senha é obrigatória.', 400)
    }
    if (senha.length < 8) {
        throw new TenantCheckinError('A senha deve ter pelo menos 8 caracteres.', 400)
    }
    if (Buffer.byteLength(senha, 'utf8') > 72) {
        throw new TenantCheckinError('A senha não pode exceder 72 bytes.', 400)
    }
}

function serializarSala(room) {
    return {
        id: String(room._id),
        nome: room.name,
    }
}

export async function obterContextoQr(token) {
    const tokenHash = hashToken(token)
    const qrCode = await QrCode.findOne({ tokenHash, status: 'active' })
        .select('_id tenantId roomId status')
        .lean()
    if (!qrCode?.roomId) {
        return null
    }

    const [tenant, room] = await Promise.all([
        Tenant.findOne({ _id: qrCode.tenantId, status: 'active' })
            .select('_id')
            .lean(),
        Room.findOne({
            _id: qrCode.roomId,
            tenantId: qrCode.tenantId,
            status: { $ne: 'archived' },
        })
            .select('_id name status')
            .lean(),
    ])

    if (!tenant || !room) {
        return null
    }
    return {
        tenantId: qrCode.tenantId,
        room,
    }
}

export async function resolverQrCodeDeCheckin(token) {
    const contexto = await obterContextoQr(token)
    if (!contexto) {
        return null
    }
    return {
        sala: serializarSala(contexto.room),
        aberta: contexto.room.status === 'open',
    }
}

const LIMITE_TENTATIVAS = 5
const TEMPO_BLOQUEIO_MS = 15 * 60 * 1000

async function limitarTentativasLogin(tenantId, ip) {
    const agora = new Date()
    const expiraEm = new Date(agora.getTime() + TEMPO_BLOQUEIO_MS)
    const chave = createHash('sha256').update(JSON.stringify([String(tenantId), ip])).digest('hex')
    const expirado = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, agora] }
    const collection = mongoose.connection.collection('checkinLoginAttempts')
    const registro = await collection.findOneAndUpdate(
        { _id: chave },
        [{ $set: {
            count: { $cond: [expirado, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
            expiresAt: { $cond: [expirado, expiraEm, '$expiresAt'] },
        } }],
        { upsert: true, returnDocument: 'after' },
    )
    if (registro.count > LIMITE_TENTATIVAS) {
        await collection.updateOne({ _id: chave, expiresAt: registro.expiresAt }, { $inc: { count: -1 } })
        const minutos = Math.max(1, Math.ceil((registro.expiresAt.getTime() - agora.getTime()) / 60000))
        throw new TenantCheckinError(`Muitas tentativas de login. Tente novamente em ${minutos} minutos.`, 429)
    }
    return { chave, expiresAt: registro.expiresAt }
}

async function liberarTentativaLogin({ chave, expiresAt }) {
    await mongoose.connection.collection('checkinLoginAttempts').updateOne(
        { _id: chave, expiresAt },
        { $inc: { count: -1 } },
    )
}

export async function cadastrarContaEPrimeiroCheckin({ token, nome, senha, sourceIp }) {
    if (typeof nome !== 'string') {
        throw new TenantCheckinError('Nome é obrigatório.', 400)
    }
    const nomeLimpo = nome.trim()
    if (!nomeLimpo || nomeLimpo.length > 120) {
        throw new TenantCheckinError('O nome deve ter entre 1 e 120 caracteres.', 400)
    }
    validarSenha(senha)

    const contexto = await obterContextoQr(token)
    if (!contexto) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    if (contexto.room.status !== 'open') {
        throw new TenantCheckinError('Esta sala está fechada para check-in.', 403)
    }

    const personNameKey = normalizarNome(nomeLimpo)

    const jaExiste = await Person.exists({
        tenantId: contexto.tenantId,
        nameKey: personNameKey,
    })
    if (jaExiste) {
        throw new TenantCheckinError(
            'Já existe uma pessoa cadastrada com este nome nesta organização. Procure a administração.',
            409,
        )
    }

    const passwordHash = await hashPassword(senha)

    const session = await mongoose.startSession()
    let resultado
    let periodo

    try {
        await session.withTransaction(async () => {
            const periodoCorrente = await obterPeriodoCorrente(
                contexto.tenantId,
                contexto.room._id,
            )
            if (!periodoCorrente || periodoCorrente.status !== 'open') {
                throw new TenantCheckinError('Esta sala está fechada para check-in.', 403)
            }
            periodo = periodoCorrente

            const duplicado = await Attendance.exists({
                tenantId: contexto.tenantId,
                roomId: contexto.room._id,
                periodId: periodo._id,
                personNameKey,
            }).session(session)
            if (duplicado) {
                throw new TenantCheckinError(
                    'Este nome já está na lista de presença para esta sala.',
                    409,
                )
            }

            const [user] = await User.create([{
                name: nomeLimpo,
                passwordHash,
                status: 'active',
                tipo_cliente: 'cliente',
            }], { session })

            const [membership] = await Membership.create([{
                tenantId: contexto.tenantId,
                userId: user._id,
                role: 'user',
                status: 'active',
            }], { session })

            const [person] = await Person.create([{
                tenantId: contexto.tenantId,
                userId: user._id,
                name: nomeLimpo,
                nameKey: personNameKey,
                status: 'active',
            }], { session })

            const attendance = {
                tenantId: contexto.tenantId,
                roomId: contexto.room._id,
                personId: person._id,
                periodId: periodo._id,
                personNameSnapshot: nomeLimpo,
                personNameKey,
                method: 'qr',
                sourceIp: typeof sourceIp === 'string' ? sourceIp.slice(0, 45) : undefined,
            }

            await inserirPresencaNoPeriodo({
                tenantId: contexto.tenantId,
                roomId: contexto.room._id,
                attendance,
                personId: person._id,
                userId: user._id,
                checkedInAt: new Date(),
                session,
            })

            resultado = {
                userId: String(user._id),
                personId: String(person._id),
                membershipId: String(membership._id),
                tenantId: String(contexto.tenantId),
                nome: nomeLimpo,
            }
        })
    } catch (error) {
        if (error?.code === 11000) {
            if (
                error.keyPattern?.nameKey ||
                (error.keyValue && error.keyValue.nameKey)
            ) {
                throw new TenantCheckinError(
                    'Já existe uma pessoa cadastrada com este nome nesta organização. Procure a administração.',
                    409,
                )
            }
            if (
                error.keyPattern?.tenantId &&
                error.keyPattern?.roomId &&
                error.keyPattern?.periodId &&
                error.keyPattern?.personNameKey
            ) {
                throw new TenantCheckinError(
                    'Este nome já está na lista de presença para esta sala.',
                    409,
                )
            }
            throw new TenantCheckinError('Conflito ao cadastrar a conta. Tente novamente.', 409)
        }
        throw error
    } finally {
        await session.endSession()
    }

    return {
        sala: serializarSala(contexto.room),
        pessoa: resultado,
    }
}

export async function autenticarParticipante({ token, nome, senha, sourceIp }) {
    if (typeof nome !== 'string') {
        throw new TenantCheckinError('Nome é obrigatório.', 400)
    }
    const nomeLimpo = nome.trim()
    if (!nomeLimpo || nomeLimpo.length > 120) {
        throw new TenantCheckinError('O nome deve ter entre 1 e 120 caracteres.', 400)
    }
    if (typeof senha !== 'string' || !senha) {
        throw new TenantCheckinError('Senha é obrigatória.', 400)
    }

    const contexto = await obterContextoQr(token)
    if (!contexto) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }

    const tentativa = await limitarTentativasLogin(contexto.tenantId, sourceIp)

    const person = await Person.findOne({
        tenantId: contexto.tenantId,
        nameKey: normalizarNome(nomeLimpo),
        status: 'active',
    }).lean()

    if (!person) {
        throw new TenantCheckinError('Nome ou senha incorretos.', 401)
    }

    if (!person.userId) {
        throw new TenantCheckinError('Nome ou senha incorretos.', 401)
    }

    const user = await User.findOne({ _id: person.userId, status: 'active' })
        .select('+passwordHash')
        .lean()

    if (!user) {
        throw new TenantCheckinError('Nome ou senha incorretos.', 401)
    }

    const senhaCorreta = await verifyPassword(senha, user.passwordHash)
    if (!senhaCorreta) {
        throw new TenantCheckinError('Nome ou senha incorretos.', 401)
    }

    const membership = await Membership.findOne({
        userId: person.userId,
        tenantId: contexto.tenantId,
        status: 'active',
    }).lean()

    if (!membership || !roleHasTenantPermission(membership.role, 'attendance:create')) {
        throw new TenantCheckinError('Nome ou senha incorretos.', 401)
    }
    await liberarTentativaLogin(tentativa)

    return {
        userId: String(person.userId),
        personId: String(person._id),
        nome: person.name,
        tenantId: String(contexto.tenantId),
        membershipId: String(membership._id),
        sala: serializarSala(contexto.room),
    }
}

async function validarParticipante(contexto, { userId, tenantId, personId, membershipId }) {
    if (!userId || !tenantId || !personId || !membershipId) {
        throw new TenantCheckinError('Sessão de participante inválida. Faça login novamente.', 401)
    }
    if (String(contexto.tenantId) !== String(tenantId)) {
        throw new TenantCheckinError(
            'Esta sessão não pertence à organização do QR Code. Cadastre-se ou faça login nesta organização.',
            403,
        )
    }

    const membership = await Membership.findOne({
        _id: membershipId,
        userId,
        tenantId: contexto.tenantId,
        status: 'active',
    }).lean()

    if (!membership || !roleHasTenantPermission(membership.role, 'attendance:create')) {
        throw new TenantCheckinError('Vínculo com a organização não está ativo.', 403)
    }

    const user = await User.findOne({ _id: userId, status: 'active' }).lean()
    if (!user) {
        throw new TenantCheckinError('Conta não está ativa.', 403)
    }

    const personVinculada = await Person.findOne({
        _id: personId,
        tenantId: contexto.tenantId,
        userId,
        status: 'active',
    }).lean()

    if (!personVinculada) {
        throw new TenantCheckinError(
            'Esta conta não está vinculada a uma pessoa nesta organização.',
            403,
        )
    }

    return {
        sucesso: true,
        userId: String(user._id),
        nome: personVinculada.name,
        nameKey: personVinculada.nameKey,
        personId: String(personVinculada._id),
        tenantId: String(contexto.tenantId),
        membershipId: String(membership._id),
        sala: serializarSala(contexto.room),
    }
}

export async function consultarSessaoParticipante({ token, ...identidade }) {
    const contexto = await obterContextoQr(token)
    if (!contexto) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    return validarParticipante(contexto, identidade)
}

export async function registrarCheckinAutenticado({ token, sourceIp, ...identidade }) {
    const contexto = await obterContextoQr(token)
    if (!contexto) {
        throw new TenantCheckinError('QR Code inválido ou expirado.', 404)
    }
    if (contexto.room.status !== 'open') {
        throw new TenantCheckinError('Esta sala está fechada para check-in.', 403)
    }

    const participante = await validarParticipante(contexto, identidade)
    const personNameKey = participante.nameKey

    const periodoCorrente = await obterPeriodoCorrente(
        contexto.tenantId,
        contexto.room._id,
    )
    if (!periodoCorrente || periodoCorrente.status !== 'open') {
        throw new TenantCheckinError('Esta sala está fechada para check-in.', 403)
    }

    const duplicado = await Attendance.exists({
        tenantId: contexto.tenantId,
        roomId: contexto.room._id,
        periodId: periodoCorrente._id,
        personNameKey,
    })
    if (duplicado) {
        throw new TenantCheckinError(
            'Este nome já está na lista de presença para esta sala.',
            409,
        )
    }

    const attendance = {
        tenantId: contexto.tenantId,
        roomId: contexto.room._id,
        personId: participante.personId,
        periodId: periodoCorrente._id,
        personNameSnapshot: participante.nome,
        personNameKey,
        method: 'qr',
        sourceIp: typeof sourceIp === 'string' ? sourceIp.slice(0, 45) : undefined,
    }

    try {
        await inserirPresencaNoPeriodo({
            tenantId: contexto.tenantId,
            roomId: contexto.room._id,
            attendance,
            personId: participante.personId,
            userId: participante.userId,
            checkedInAt: new Date(),
        })
    } catch (error) {
        if (
            error?.code === 11000 &&
            error.keyPattern?.tenantId &&
            error.keyPattern?.roomId &&
            error.keyPattern?.periodId &&
            error.keyPattern?.personNameKey
        ) {
            throw new TenantCheckinError(
                'Este nome já está na lista de presença para esta sala.',
                409,
            )
        }
        throw error
    }

    return { sala: serializarSala(contexto.room) }
}
