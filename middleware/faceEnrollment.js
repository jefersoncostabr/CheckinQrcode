import { createHash, randomBytes } from 'crypto'
import faceProfile from '../faceProfileModel.js'
import { normalizarTexto } from '../salasService.js'

export const FACE_DESCRIPTOR_LENGTH = 128
const FACE_MATCH_THRESHOLD = 0.48

export function validarDescritor(descritor) {
    return Array.isArray(descritor) &&
        descritor.length === FACE_DESCRIPTOR_LENGTH &&
        descritor.every(valor => Number.isFinite(valor) && Math.abs(valor) <= 2)
}

function distanciaFacial(primeiro, segundo) {
    return Math.sqrt(primeiro.reduce((soma, valor, indice) =>
        soma + (valor - segundo[indice]) ** 2, 0))
}

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex')
}

export async function verificarCadastroFacial(req, res, next) {
    const body = req.body || {}
    const nome = String(body.nome || '').trim()
    const { descritor, consentimento } = body

    if (!nome || nome.length > 120) {
        return res.status(400).json({ sucesso: false, mensagem: 'Informe um nome com até 120 caracteres.' })
    }
    if (consentimento !== true) {
        return res.status(400).json({ sucesso: false, mensagem: 'É necessário consentir com o cadastro facial.' })
    }
    if (!validarDescritor(descritor)) {
        return res.status(400).json({ sucesso: false, mensagem: 'Não foi possível ler o rosto. Tente novamente.' })
    }

    try {
        const perfis = await faceProfile.find().select('+descritor')
        const nomeJaCadastrado = perfis.some(perfil =>
            normalizarTexto(perfil.nome) === normalizarTexto(nome)
        )
        if (nomeJaCadastrado) {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Este nome já possui cadastro facial.',
            })
        }

        const rostoJaCadastrado = perfis.some(perfil =>
            perfil.descritor?.length === FACE_DESCRIPTOR_LENGTH &&
            distanciaFacial(descritor, perfil.descritor) <= FACE_MATCH_THRESHOLD
        )
        if (rostoJaCadastrado) {
            return res.status(409).json({
                sucesso: false,
                mensagem: 'Este rosto já possui cadastro facial.',
            })
        }

        return next()
    } catch (error) {
        console.error('Erro ao verificar duplicidade do cadastro facial:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao verificar o cadastro facial.' })
    }
}

export async function cadastrarPerfilFacial(req, res) {
    const nome = String(req.body.nome).trim()
    const tokenExclusao = randomBytes(32).toString('hex')

    try {
        const perfilCriado = await faceProfile.create({
            nome,
            descritor: req.body.descritor,
            tokenExclusaoHash: hashToken(tokenExclusao),
        })
        return res.status(201).json({
            sucesso: true,
            mensagem: 'Cadastro facial realizado com sucesso.',
            perfilId: perfilCriado.id,
            tokenExclusao,
        })
    } catch (error) {
        console.error('Erro ao cadastrar perfil facial:', error)
        return res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar o rosto.' })
    }
}
