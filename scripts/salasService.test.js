import {
    criarQrDisponivel,
    encontrarSalaPorId,
    encontrarSalaPorNome,
} from '../salasService.js'

describe('serviço de salas e QR Codes', () => {
    it('atribui IDs sequenciais sem reutilizar o maior ID removido', () => {
        const doc = {
            qrcodes: [{ id: 1, estado: 'disponivel' }, { id: 4, estado: 'disponivel' }],
            salas: [],
            proximoQrId: 5,
            markModified() {},
        }

        expect(criarQrDisponivel(doc).id).toBe(5)
        expect(doc.proximoQrId).toBe(6)
    })

    it('respeita o limite de dez QRs ativos', () => {
        const doc = {
            qrcodes: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, estado: 'disponivel' })),
            salas: [],
            proximoQrId: 11,
            markModified() {},
        }

        expect(criarQrDisponivel(doc)).toBeNull()
        expect(doc.qrcodes).toHaveLength(10)
    })

    it('distingue ID numérico de nome legado numérico', () => {
        const doc = {
            salas: [
                { id: 1, nome: 'Auditório' },
                { id: 2, nome: '1' },
            ],
        }

        expect(encontrarSalaPorId(doc, '1').nome).toBe('Auditório')
        expect(encontrarSalaPorNome(doc, '1').id).toBe(2)
    })
})
