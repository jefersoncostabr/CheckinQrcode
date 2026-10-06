import QRCode from 'qrcode';
import os from 'node:os';

export function getQrBaseUrl(req, interfaces = os.networkInterfaces(), publicBaseUrl = process.env.PUBLIC_BASE_URL) {
    if (publicBaseUrl) {
        try {
            const configuredUrl = new URL(publicBaseUrl);
            return ['http:', 'https:'].includes(configuredUrl.protocol) ? configuredUrl.origin : null;
        } catch {
            return null;
        }
    }

    const requestUrl = new URL(`${req.protocol}://${req.get('host')}`);
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(requestUrl.hostname)) {
        return requestUrl.origin;
    }

    const interfacesLocais = Object.entries(interfaces).flatMap(([name, addresses]) =>
        (addresses || []).map(address => ({ name, ...address }))
    ).filter(({ family, internal, address }) =>
        (family === 'IPv4' || family === 4) &&
        !internal &&
        /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)
    );

    const redeFisica = interfacesLocais.find(({ name }) =>
        !/(virtual|vmware|virtualbox|docker|wsl|hyper-v)/i.test(name)
    );
    const ipLocal = redeFisica || interfacesLocais[0];
    if (!ipLocal) return null;

    requestUrl.hostname = ipLocal.address;
    return requestUrl.origin;
}

/**
 * Gera um arquivo de imagem QR Code a partir de uma URL.
 * @param {string} url A URL para codificar no QR Code.
 * @param {string} filePath O caminho onde o arquivo .png será salvo.
 * @returns {Promise<void>} Uma promessa que resolve quando o arquivo é criado.
 */
export async function generateQRCodeFile(url, filePath) {
    const options = {
        color: {
            dark: '#000000', // Cor dos pontos (Preto)
            light: '#FFFFFF', // Cor do fundo (Branco)
        },
        width: 300, // Largura da imagem em pixels
    };
    
    return QRCode.toFile(filePath, url, options);
}

/**
 * Gera um Buffer de imagem QR Code a partir de uma URL.
 * @param {string} url A URL para codificar no QR Code.
 * @returns {Promise<Buffer>} Uma promessa que resolve com o buffer da imagem.
 */
export async function generateQRCodeBuffer(url) {
    const options = {
        color: {
            dark: '#000000', // Cor dos pontos (Preto)
            light: '#FFFFFF', // Cor do fundo (Branco)
        },
        width: 300, // Largura da imagem em pixels
    };
    
    return QRCode.toBuffer(url, options);
}