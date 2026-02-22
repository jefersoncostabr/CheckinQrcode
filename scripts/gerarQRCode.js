import { generateQRCodeFile } from './qrCodeService.js';
import path from 'path';

const url = 'https://checkinqrcode.onrender.com/add';
const outputFileName = 'presenca.png';
const outputPath = path.resolve(outputFileName); // Garante que o caminho seja absoluto na raiz do projeto

async function main() {
    try {
        await generateQRCodeFile(url, outputPath);
        console.log(`Sucesso! O arquivo "${outputFileName}" foi criado.`);
    } catch (err) {
        console.error('Falha ao gerar o QR Code:', err);
    }
}

main();
