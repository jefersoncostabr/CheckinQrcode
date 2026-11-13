import { createHash } from 'node:crypto'
import { jest } from '@jest/globals'

const listQuery = {
    sort: jest.fn(),
    lean: jest.fn(),
}
const roomListQuery = { lean: jest.fn() }
const roomQuery = { lean: jest.fn() }
const updateQuery = { lean: jest.fn() }
const findOneQuery = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn(),
}
const QrCode = {
    find: jest.fn(),
    countDocuments: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
}
const Room = {
    find: jest.fn(),
    findOne: jest.fn(),
}

listQuery.sort.mockReturnValue(listQuery)
listQuery.lean.mockResolvedValue([])
roomListQuery.lean.mockResolvedValue([])
roomQuery.lean.mockResolvedValue(null)
updateQuery.lean.mockResolvedValue(null)
findOneQuery.lean.mockResolvedValue(null)
QrCode.find.mockReturnValue(listQuery)
Room.find.mockReturnValue(roomListQuery)
Room.findOne.mockReturnValue(roomQuery)
QrCode.findOneAndUpdate.mockReturnValue(updateQuery)
QrCode.findOne.mockReturnValue(findOneQuery)

jest.unstable_mockModule('../src/models/qrCodeModel.js', () => ({ default: QrCode }))
jest.unstable_mockModule('../src/models/roomModel.js', () => ({ default: Room }))
jest.unstable_mockModule('../src/services/qrCodeService.js', () => ({
    generateQRCodeBuffer: jest.fn().mockResolvedValue(Buffer.from('png')),
}))

const {
    associarQrCodeASalaDoTenant,
    criarQrCodeDoTenant,
    listarQrCodesDoTenant,
    recuperarVisualQrCode,
    rotacionarQrCodeDoTenant,
    revogarQrCodeDoTenant,
    TenantQrCodeError,
    TENANT_QR_CODE_LIMIT,
} = await import('../src/services/tenantQrCodeService.js')

const tenantId = '65f1a0000000000000000001'
const qrCodeId = '65f1a0000000000000000002'
const roomId = '65f1a0000000000000000003'
const baseUrl = 'https://example.test'

describe('serviço de QR Codes isolados por tenant', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        listQuery.sort.mockReturnValue(listQuery)
        listQuery.lean.mockResolvedValue([])
        roomListQuery.lean.mockResolvedValue([])
        roomQuery.lean.mockResolvedValue(null)
        updateQuery.lean.mockResolvedValue(null)
        findOneQuery.lean.mockResolvedValue(null)
        QrCode.find.mockReturnValue(listQuery)
        Room.find.mockReturnValue(roomListQuery)
        Room.findOne.mockReturnValue(roomQuery)
        QrCode.findOneAndUpdate.mockReturnValue(updateQuery)
        QrCode.findOne.mockReturnValue(findOneQuery)
    })

    it('lista QR Codes do tenant e resolve nomes de sala no mesmo tenant', async () => {
        listQuery.lean.mockResolvedValue([{
            _id: qrCodeId,
            roomId,
            status: 'active',
            tokenHash: 'secret-hash',
        }])
        roomListQuery.lean.mockResolvedValue([{ _id: roomId, name: 'Sala Azul' }])

        await expect(listarQrCodesDoTenant(tenantId)).resolves.toEqual([
            expect.objectContaining({
                id: qrCodeId,
                roomId,
                roomName: 'Sala Azul',
                status: 'active',
            }),
        ])
        expect(QrCode.find).toHaveBeenCalledWith({ tenantId })
        expect(Room.find).toHaveBeenCalledWith({
            tenantId,
            _id: { $in: [roomId] },
        })
        expect(JSON.stringify(await listarQrCodesDoTenant(tenantId))).not.toContain('secret-hash')
    })

    it('cria token, persiste hash e dados recuperáveis sem expor o token puro na listagem', async () => {
        QrCode.create.mockImplementation(async document => ({
            _id: qrCodeId,
            ...document,
        }))

        const result = await criarQrCodeDoTenant(tenantId, baseUrl)

        expect(result.token).toHaveLength(43)
        expect(result.status).toBe('available')
        expect(QrCode.create).toHaveBeenCalledWith({
            tenantId,
            tokenHash: createHash('sha256').update(result.token).digest('hex'),
            tokenRecuperavel: result.token,
            qrBaseUrl: baseUrl,
            status: 'available',
        })
        expect(result).not.toHaveProperty('tokenHash')
        expect(QrCode.countDocuments).toHaveBeenCalledWith({
            tenantId,
            status: { $ne: 'revoked' },
        })
    })

    it('aplica o limite de QR Codes por tenant', async () => {
        QrCode.countDocuments.mockResolvedValue(TENANT_QR_CODE_LIMIT)

        await expect(criarQrCodeDoTenant(tenantId, baseUrl))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(QrCode.create).not.toHaveBeenCalled()
    })

    it('associa somente sala não arquivada do mesmo tenant', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            status: 'active',
        })

        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .resolves.toMatchObject({ id: qrCodeId, roomId, roomName: 'Sala Azul', status: 'active' })
        expect(Room.findOne).toHaveBeenCalledWith({
            _id: roomId,
            tenantId,
            status: { $ne: 'archived' },
        })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: { $ne: 'revoked' } },
            { $set: { roomId, status: 'active' } },
            { new: true, runValidators: true },
        )
    })

    it('rejeita duplicidade de QR ativo para a mesma sala via erro 11000', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockRejectedValue({
            code: 11000,
            keyPattern: { tenantId: 1, roomId: 1 },
        })

        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalled()
    })

    it('não converte outros erros de banco indevidamente para 409', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockRejectedValue(new Error('falha inesperada'))

        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .rejects.toMatchObject({ message: 'falha inesperada' })
    })

    it('qrCodes disponíveis ou revogados não impedem a associação', async () => {
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            status: 'active',
        })

        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .resolves.toMatchObject({ id: qrCodeId, roomId, roomName: 'Sala Azul', status: 'active' })
    })

    it('organizações diferentes não interferem na associação', async () => {
        const outroTenant = '65f1a0000000000000000009'
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul', status: 'open' })
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            status: 'active',
        })

        await expect(associarQrCodeASalaDoTenant(outroTenant, qrCodeId, roomId))
            .resolves.toMatchObject({ id: qrCodeId, roomId, roomName: 'Sala Azul', status: 'active' })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId: outroTenant, status: { $ne: 'revoked' } },
            { $set: { roomId, status: 'active' } },
            { new: true, runValidators: true },
        )
    })

    it('não associa salas de outro tenant e permite liberar uma associação', async () => {
        await expect(associarQrCodeASalaDoTenant(tenantId, qrCodeId, roomId))
            .resolves.toBeNull()
        expect(QrCode.findOneAndUpdate).not.toHaveBeenCalled()

        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            status: 'available',
        })
        await associarQrCodeASalaDoTenant(tenantId, qrCodeId, null)
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: { $ne: 'revoked' } },
            { $set: { status: 'available' }, $unset: { roomId: 1 } },
            { new: true, runValidators: true },
        )
    })

    it('revoga sem apagar o registro e remove a referência da sala', async () => {
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            status: 'revoked',
        })

        await expect(revogarQrCodeDoTenant(tenantId, qrCodeId))
            .resolves.toMatchObject({ id: qrCodeId, status: 'revoked' })
        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId },
            { $set: { status: 'revoked' }, $unset: { roomId: 1 } },
            { new: true, runValidators: true },
        )
    })

    it('recupera visual de QR ativo usando o mesmo token e URL base original', async () => {
        findOneQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            tokenRecuperavel: 'token-recuperavel',
            qrBaseUrl: baseUrl,
            status: 'active',
        })
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul' })

        const result = await recuperarVisualQrCode(tenantId, qrCodeId)

        expect(QrCode.findOne).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: 'active' },
        )
        expect(result.qrCodeDataUri).toBe('data:image/png;base64,cG5n')
        expect(result.url).toBe(`${baseUrl}/add#token-recuperavel`)
    })

    it('reexibir não altera o token nem faz rotação', async () => {
        findOneQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            tokenRecuperavel: 'token-recuperavel',
            qrBaseUrl: baseUrl,
            status: 'active',
        })
        roomQuery.lean.mockResolvedValue({ _id: roomId, name: 'Sala Azul' })

        const primeiro = await recuperarVisualQrCode(tenantId, qrCodeId)
        const segundo = await recuperarVisualQrCode(tenantId, qrCodeId)

        expect(primeiro.url).toBe(segundo.url)
        expect(QrCode.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('retorna 409 para QR sem dados recuperáveis, sem alterar o documento', async () => {
        findOneQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            tokenRecuperavel: undefined,
            qrBaseUrl: undefined,
            status: 'active',
        })

        await expect(recuperarVisualQrCode(tenantId, qrCodeId))
            .rejects.toMatchObject({ statusCode: 409 })
        expect(QrCode.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('retorna 404 para QR inexistente ou de outro tenant', async () => {
        findOneQuery.lean.mockResolvedValue(null)

        await expect(recuperarVisualQrCode(tenantId, qrCodeId))
            .rejects.toMatchObject({ statusCode: 404 })
    })

    it('a listagem não expõe tokenRecuperavel, qrBaseUrl nem tokenHash', async () => {
        listQuery.lean.mockResolvedValue([{
            _id: qrCodeId,
            roomId,
            tokenRecuperavel: 'token-secreto',
            qrBaseUrl: baseUrl,
            tokenHash: 'hash-secreto',
            status: 'active',
        }])
        roomListQuery.lean.mockResolvedValue([])

        const resultado = await listarQrCodesDoTenant(tenantId)

        expect(JSON.stringify(resultado)).not.toContain('token-secreto')
        expect(JSON.stringify(resultado)).not.toContain('hash-secreto')
        expect(resultado[0]).not.toHaveProperty('tokenRecuperavel')
        expect(resultado[0]).not.toHaveProperty('qrBaseUrl')
        expect(resultado[0]).not.toHaveProperty('tokenHash')
    })

    it('rotaciona QR atualizando hash e token recuperável conjuntamente', async () => {
        updateQuery.lean.mockResolvedValue({
            _id: qrCodeId,
            roomId,
            status: 'active',
        })

        const result = await rotacionarQrCodeDoTenant(tenantId, qrCodeId, baseUrl)

        expect(QrCode.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: qrCodeId, tenantId, status: 'active', roomId: { $exists: true } },
            { $set: { tokenHash: expect.any(String), tokenRecuperavel: result.token, qrBaseUrl: baseUrl } },
            { new: true, runValidators: true },
        )
        expect(result.token).toBeDefined()
    })

    it('rejeita IDs inválidos antes de consultar o banco', async () => {
        await expect(listarQrCodesDoTenant('tenant-inválido'))
            .rejects.toBeInstanceOf(TenantQrCodeError)
        expect(QrCode.find).not.toHaveBeenCalled()
    })
})
