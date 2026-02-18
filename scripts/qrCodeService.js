import QRCode from 'qrcode';

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