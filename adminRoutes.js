import express from 'express';
import path from 'path';
import { generateQRCodeFile } from './scripts/qrCodeService.js';

const router = express.Router();

/**
 * Rota para gerar um QR Code para a URL de check-in.
 * O arquivo é salvo na raiz do projeto.
 */
router.get('/gerar-qrcode', async (req, res) => {
    // Constrói a URL base dinamicamente (http://localhost:3000)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const checkinUrl = `${baseUrl}/add`;
    const outputFileName = 'presenca_gerada_api.png';
    const outputPath = path.resolve(outputFileName); // Salva na raiz do projeto

    try {
        await generateQRCodeFile(checkinUrl, outputPath);
        res.json({
            sucesso: true,
            mensagem: `QR Code gerado com sucesso!`,
            arquivo: outputFileName,
            url: checkinUrl
        });
    } catch (error) {
        console.error("Erro ao gerar QR Code via API:", error);
        res.status(500).json({ sucesso: false, mensagem: "Falha ao gerar o arquivo QR Code." });
    }
});

export default router;