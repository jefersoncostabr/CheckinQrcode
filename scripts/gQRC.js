import QRCode from 'qrcode';
import path from 'path';

const url = 'https://checkinqrcode.onrender.com/add';
const outputFileName = 'presenca_customizada.png';
// O arquivo de imagem será salvo na raiz do projeto ao executar via 'node scripts/gerarQRCodeCustomizado.js'
const outputPath = path.resolve(outputFileName);

const options = {
    color: {
        dark: '#000000', // Cor dos pontos (Preto)
        light: '#FFFFFF', // Cor do fundo (Branco)
    },
    width: 300,
};

async function main() {
    try {
        await QRCode.toFile(outputPath, url, options);
        console.log(`QR Code gerado com sucesso em: ${outputPath}`);
    } catch (err) {
        console.error('Falha ao gerar o QR Code:', err);
    }
}

main();