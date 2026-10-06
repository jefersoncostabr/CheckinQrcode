import { getQrBaseUrl } from './qrCodeService.js'

const mockRequest = (host, protocol = 'http') => ({
    get: () => host,
    protocol,
})

describe('resolução do endereço do QR Code', () => {
    it('usa PUBLIC_BASE_URL quando configurada', () => {
        expect(getQrBaseUrl(mockRequest('localhost:3000'), {}, 'https://checkin.example.com/path'))
            .toBe('https://checkin.example.com')
    })

    it('substitui localhost pelo IPv4 privado da rede', () => {
        const interfaces = {
            'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.25' }],
        }

        expect(getQrBaseUrl(mockRequest('localhost:3000'), interfaces, ''))
            .toBe('http://192.168.1.25:3000')
    })

    it('preserva o host quando o painel já foi aberto por endereço acessível', () => {
        expect(getQrBaseUrl(mockRequest('192.168.1.25:3000'), {}, ''))
            .toBe('http://192.168.1.25:3000')
    })

    it('não gera endereço localhost se não houver IPv4 privado detectável', () => {
        expect(getQrBaseUrl(mockRequest('127.0.0.1:3000'), {}, '')).toBeNull()
    })

    it('reconhece loopback IPv6 e rejeita base que não seja HTTP(S)', () => {
        expect(getQrBaseUrl(mockRequest('[::1]:3000'), {}, '')).toBeNull()
        expect(getQrBaseUrl(mockRequest('localhost:3000'), {}, 'javascript:alert(1)')).toBeNull()
    })
})
