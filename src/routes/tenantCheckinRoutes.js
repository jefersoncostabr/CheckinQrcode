import express from 'express'
import { CheckinPeriodError } from '../services/checkinPeriodService.js'
import {
    cadastrarContaEPrimeiroCheckin,
    autenticarParticipante,
    consultarSessaoParticipante,
    registrarCheckinAutenticado,
    resolverQrCodeDeCheckin,
    TenantCheckinError,
} from '../services/tenantCheckinService.js'
import {
    cadastrarBiometriaDoTenant,
    excluirBiometriaDoTenant,
    registrarCheckinFacialDoTenant,
    TenantBiometricError,
} from '../services/tenantBiometricService.js'

const router = express.Router()
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000

router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
})

function responderErro(error, res, next) {
    if (error instanceof TenantCheckinError || error instanceof TenantBiometricError || error instanceof CheckinPeriodError) {
        return res.status(error.statusCode).json({
            sucesso: false,
            mensagem: error.message,
        })
    }
    return next(error)
}

function sessaoParticipante(req) {
    return req.session?.participanteCheckin
}

function exigirSessaoParticipante(req, res, next) {
    const s = sessaoParticipante(req)
    if (!s || !s.userId || !s.tenantId || !s.personId || !s.membershipId) {
        return res.status(401).json({
            sucesso: false,
            mensagem: 'Sessão de participante não encontrada. Faça login ou crie uma conta.',
        })
    }
    if (!Number.isFinite(s.expiraEm) || s.expiraEm <= Date.now()) {
        return req.session.destroy(error => {
            if (error) return next(error)
            res.clearCookie('checkin.sid', { path: '/api/checkin/tenant' })
            return res.status(401).json({
                sucesso: false,
                mensagem: 'Sessão expirada. Faça login novamente.',
            })
        })
    }
    req.session.cookie.maxAge = s.expiraEm - Date.now()
    return next()
}

function iniciarSessaoParticipante(req, pessoa) {
    return new Promise((resolve, reject) => {
        if (!req.session?.regenerate || !req.session?.save) {
            reject(new Error('A sessão HTTP não está disponível.'))
            return
        }
        req.session.regenerate(error => {
            if (error) return reject(error)
            req.session.participanteCheckin = {
                userId: pessoa.userId,
                personId: pessoa.personId,
                tenantId: pessoa.tenantId,
                membershipId: pessoa.membershipId,
                expiraEm: Date.now() + DURACAO_SESSAO_MS,
            }
            req.session.cookie.maxAge = DURACAO_SESSAO_MS
            req.session.save(saveError => saveError ? reject(saveError) : resolve())
        })
    })
}

router.post('/resolve', async (req, res, next) => {
    try {
        const resultado = await resolverQrCodeDeCheckin(req.body?.token)
        if (!resultado) {
            return res.status(404).json({
                sucesso: false,
                mensagem: 'QR Code inválido ou sala não disponível.',
            })
        }
        if (!resultado.aberta) {
            return res.status(403).json({
                sucesso: false,
                mensagem: 'Esta sala está fechada para check-in.',
            })
        }
        return res.json({ sucesso: true, sala: resultado.sala })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/criar-conta', async (req, res, next) => {
    try {
        const { token, nome, senha } = req.body || {}
        const resultado = await cadastrarContaEPrimeiroCheckin({
            token,
            nome,
            senha,
            sourceIp: req.ip,
        })

        try {
            await iniciarSessaoParticipante(req, resultado.pessoa)
        } catch (error) {
            console.error('Conta e presença registradas, mas a sessão não pôde ser iniciada:', error)
            return res.status(503).json({
                sucesso: false,
                presencaRegistrada: true,
                mensagem: 'Conta criada e presença registrada, mas não foi possível iniciar a sessão. Entre novamente.',
            })
        }
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Conta criada e presença registrada.',
            pessoa: {
                id: resultado.pessoa.userId,
                nome: resultado.pessoa.nome,
            },
            sala: resultado.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/login', async (req, res, next) => {
    try {
        const { token, nome, senha } = req.body || {}
        const resultado = await autenticarParticipante({
            token,
            nome,
            senha,
            sourceIp: req.ip,
        })

        await iniciarSessaoParticipante(req, resultado)
        return res.json({
            sucesso: true,
            mensagem: 'Autenticado.',
            pessoa: {
                id: resultado.userId,
                nome: resultado.nome,
            },
            sala: resultado.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/sessao', exigirSessaoParticipante, async (req, res, next) => {
    try {
        const { token } = req.body || {}
        const s = sessaoParticipante(req)
        const resultado = await consultarSessaoParticipante({
            token,
            userId: s.userId,
            tenantId: s.tenantId,
            personId: s.personId,
            membershipId: s.membershipId,
        })

        return res.json({
            sucesso: true,
            pessoa: {
                id: resultado.userId,
                nome: resultado.nome,
            },
            sala: resultado.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/attendance', exigirSessaoParticipante, async (req, res, next) => {
    try {
        const s = sessaoParticipante(req)
        const { token } = req.body || {}
        const resultado = await registrarCheckinAutenticado({
            token,
            userId: s.userId,
            personId: s.personId,
            tenantId: s.tenantId,
            membershipId: s.membershipId,
            sourceIp: req.ip,
        })

        return res.status(201).json({
            sucesso: true,
            mensagem: 'Presença confirmada.',
            sala: resultado.sala,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/logout', (req, res, next) => {
    if (!req.session) {
        return res.status(204).end()
    }

    req.session.destroy(error => {
        if (error) return next(error)
        res.clearCookie('checkin.sid', { path: '/api/checkin/tenant' })
        return res.status(204).end()
    })
})

router.post('/biometrics/enroll', async (req, res, next) => {
    try {
        const resultado = await cadastrarBiometriaDoTenant({
            token: req.body?.token,
            name: req.body?.nome,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Perfil biométrico cadastrado.',
            perfilId: resultado.profileId,
            tokenExclusao: resultado.deleteToken,
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.post('/biometrics/checkin', async (req, res, next) => {
    try {
        await registrarCheckinFacialDoTenant({
            token: req.body?.token,
            descriptor: req.body?.descritor,
            consentimento: req.body?.consentimento,
            sourceIp: req.ip,
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Presença confirmada.',
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

router.delete('/biometrics/profiles/:id', async (req, res, next) => {
    try {
        await excluirBiometriaDoTenant({
            profileId: req.params.id,
            deleteToken: req.get('x-biometric-delete-token'),
        })
        return res.json({
            sucesso: true,
            mensagem: 'Perfil biométrico excluído e consentimento retirado.',
        })
    } catch (error) {
        return responderErro(error, res, next)
    }
})

export default router
