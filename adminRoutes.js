// comentário teste(remover)
import express from 'express';
import { generateQRCodeBuffer } from './scripts/qrCodeService.js';

const router = express.Router();

/**
 * Rota para gerar um QR Code para a URL de check-in.
 * O arquivo é salvo na raiz do projeto.
 */
router.get('/gerar-qrcode', async (req, res) => {
    // Constrói a URL base dinamicamente (http://localhost:3000)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const checkinUrl = `${baseUrl}/add`;

    try {
        const buffer = await generateQRCodeBuffer(checkinUrl);
        
        // Se passar ?download=true na URL, baixa o arquivo. Caso contrário, exibe na tela (inline).
        const disposition = req.query.download === 'true' ? 'attachment' : 'inline';
        
        res.setHeader('Content-Disposition', `${disposition}; filename="qrcode_checkin.png"`);
        res.type('png');
        res.send(buffer);
    } catch (error) {
        console.error("Erro ao gerar QR Code via API:", error);
        res.status(500).send("Falha ao gerar o QR Code.");
    }
});

export default router;