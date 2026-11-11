import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import Attendance from '../models/attendanceModel.js'
import BiometricProfile from '../models/biometricProfileModel.js'
import Person from '../models/personModel.js'
import { obterContextoQr, TenantCheckinError } from './tenantCheckinService.js'

const FACE_DESCRIPTOR_LENGTH = 128
const FACE_MATCH_THRESHOLD = 0.48
const CONSENT_POLICY_VERSION = '1'

export class TenantBiometricError extends Error {
    constructor(message, statusCode) {
        super(message)
        this.name = 'TenantBiometricError'
        this.statusCode = statusCode
    }
}

function normalizarNome(name) {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
}

function validarDescritor(descriptor) {
    return Array.isArray(descriptor) &&
        descriptor.length === FACE_DESCRIPTOR_LENGTH &&
        descriptor.every(value => Number.isFinite(value) && Math.abs(value) <= 2)
}

function distanciaFacial(first, second) {
    return Math.sqrt(first.reduce((sum, value, index) =>
        sum + (value - second[index]) ** 2, 0))
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex')
}

async function obterContexto(token) {
    try {
        return await obterContextoQr(token)
    } catch (error) {
        if (error instanceof TenantCheckinError) {
            throw new TenantBiometricError(error.message, error.statusCode)
        }
        throw error
    }
}

function validarConsentimento(consentimento) {
    if (consentimento !== true) {
        throw new TenantBiometricError(
            'É necessário consentir com o uso do perfil biométrico.',
            400,
        )
    }
}

function validarNome(name) {
    if (typeof name !== 'string') {
        throw new TenantBiometricError('Informe um nome válido.', 400)
    }
    const normalized = name.trim()
    if (!normalized || normalized.length > 120) {
        throw new TenantBiometricError('Informe um nome com até 120 caracteres.', 400)
    }
    return normalized
}

async function obterPessoaDoTenant(tenantId, name) {
    const nameKey = normalizarNome(name)
    const person = await Person.findOneAndUpdate(
        { tenantId, nameKey },
        {
            $setOnInsert: {
                tenantId,
                name,
                nameKey,
                status: 'active',
            },
        },
        { new: true, upsert: true, runValidators: true },
    ).lean()
    if (!person || person.status !== 'active') {
        throw new TenantBiometricError('Cadastro de participante inativo.', 409)
    }
    return person
}

export async function cadastrarBiometriaDoTenant({
    token,
    name: nameInput,
    descriptor,
    consentimento,
}) {
    validarConsentimento(consentimento)
    const name = validarNome(nameInput)
    if (!validarDescritor(descriptor)) {
        throw new TenantBiometricError('Descritor facial inválido.', 400)
    }

    const context = await obterContexto(token)
    if (!context) {
        throw new TenantBiometricError('QR Code inválido ou indisponível.', 404)
    }
    if (context.room.status !== 'open') {
        throw new TenantBiometricError('Esta sala está fechada para check-in.', 403)
    }

    const person = await obterPessoaDoTenant(context.tenantId, name)
    const existing = await BiometricProfile.findOne({
        tenantId: context.tenantId,
        personId: person._id,
    }).select('_id').lean()
    if (existing) {
        throw new TenantBiometricError('Este participante já possui perfil biométrico.', 409)
    }

    const profiles = await BiometricProfile.find({
        tenantId: context.tenantId,
        'consent.status': 'granted',
    }).select('+descriptor').lean()
    const duplicateFace = profiles.some(profile =>
        validarDescritor(profile.descriptor) &&
        distanciaFacial(descriptor, profile.descriptor) <= FACE_MATCH_THRESHOLD
    )
    if (duplicateFace) {
        throw new TenantBiometricError('Este rosto já possui cadastro nesta organização.', 409)
    }

    const deleteToken = randomBytes(32).toString('base64url')
    let profile
    try {
        profile = await BiometricProfile.create({
            tenantId: context.tenantId,
            personId: person._id,
            descriptor,
            deleteTokenHash: hashToken(deleteToken),
            descriptorVersion: 'face-api.js-0.22.2',
            consent: {
                status: 'granted',
                recordedAt: new Date(),
                policyVersion: CONSENT_POLICY_VERSION,
            },
        })
    } catch (error) {
        if (error?.code === 11000) {
            throw new TenantBiometricError('Este participante já possui perfil biométrico.', 409)
        }
        throw error
    }

    return {
        profileId: String(profile._id),
        deleteToken,
    }
}

export async function registrarCheckinFacialDoTenant({ token, descriptor, consentimento, sourceIp }) {
    validarConsentimento(consentimento)
    if (!validarDescritor(descriptor)) {
        throw new TenantBiometricError('Descritor facial inválido.', 400)
    }

    const context = await obterContexto(token)
    if (!context) {
        throw new TenantBiometricError('QR Code inválido ou indisponível.', 404)
    }
    if (context.room.status !== 'open') {
        throw new TenantBiometricError('Esta sala está fechada para check-in.', 403)
    }

    const profiles = await BiometricProfile.find({
        tenantId: context.tenantId,
        'consent.status': 'granted',
    }).select('+descriptor').lean()
    let matchedProfile = null
    let bestDistance = FACE_MATCH_THRESHOLD
    for (const profile of profiles) {
        if (!validarDescritor(profile.descriptor)) continue
        const distance = distanciaFacial(descriptor, profile.descriptor)
        if (distance <= bestDistance) {
            matchedProfile = profile
            bestDistance = distance
        }
    }
    if (!matchedProfile) {
        throw new TenantBiometricError('Não foi encontrado um perfil facial correspondente.', 404)
    }

    const person = await Person.findOne({
        _id: matchedProfile.personId,
        tenantId: context.tenantId,
        status: 'active',
    }).select('_id name nameKey').lean()
    if (!person) {
        throw new TenantBiometricError('Perfil facial indisponível.', 404)
    }

    try {
        await Attendance.create({
            tenantId: context.tenantId,
            roomId: context.room._id,
            personId: person._id,
            personNameSnapshot: person.name,
            personNameKey: person.nameKey,
            method: 'face',
            sourceIp: typeof sourceIp === 'string' ? sourceIp.slice(0, 45) : undefined,
        })
    } catch (error) {
        if (
            error?.code === 11000 &&
            error.keyPattern?.tenantId &&
            error.keyPattern?.roomId &&
            error.keyPattern?.personNameKey
        ) {
            throw new TenantBiometricError(
                'Este participante já está na lista de presença para esta sala.',
                409,
            )
        }
        throw error
    }

    return { sucesso: true }
}

export async function excluirBiometriaDoTenant({ profileId, deleteToken }) {
    if (typeof deleteToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(deleteToken)) {
        throw new TenantBiometricError('Credencial de exclusão inválida.', 403)
    }
    if (!/^[a-f\d]{24}$/i.test(String(profileId))) {
        throw new TenantBiometricError('Perfil biométrico inválido.', 400)
    }

    const profile = await BiometricProfile.findOne({
        _id: profileId,
    }).select('+deleteTokenHash').lean()
    if (!profile?.deleteTokenHash) {
        throw new TenantBiometricError('Perfil biométrico não encontrado.', 404)
    }

    const expectedHash = Buffer.from(profile.deleteTokenHash, 'hex')
    const submittedHash = Buffer.from(hashToken(deleteToken), 'hex')
    if (
        expectedHash.length !== submittedHash.length ||
        !timingSafeEqual(expectedHash, submittedHash)
    ) {
        throw new TenantBiometricError('Credencial de exclusão inválida.', 403)
    }

    await BiometricProfile.deleteOne({
        _id: profile._id,
        deleteTokenHash: profile.deleteTokenHash,
    })
    return { deleted: true }
}
