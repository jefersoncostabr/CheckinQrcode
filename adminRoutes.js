// comentário teste(remover)
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQRCodeFile, generateQRCodeBuffer } from './scripts/qrCodeService.js';

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Rota para gerar um QR Code para a URL de check-in.
 * Retorna JSON com a URL de destino e o caminho do arquivo gerado.
 * Se passar ?download=true, retorna o PNG diretamente.
 */
router.get('/gerar-qrcode', async (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const sala = req.query.sala;

    if (!sala) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório.' });
    }

    const checkinUrl = `${baseUrl}/add?sala=${encodeURIComponent(sala)}`;

    try {
        const qrCodeBuffer = await generateQRCodeBuffer(checkinUrl);

        if (req.query.download === 'true') {
            res.setHeader('Content-Disposition', 'attachment; filename=qrcode_checkin.png');
            res.setHeader('Content-Type', 'image/png');
            return res.send(qrCodeBuffer);
        }

        const qrCodeDataUri = `data:image/png;base64,${qrCodeBuffer.toString('base64')}`;

        res.json({
            sucesso: true,
            mensagem: 'QR Code gerado com sucesso!',
            url: checkinUrl,
            qrCodeDataUri: qrCodeDataUri,
        });
    } catch (error) {
        console.error('Erro ao gerar QR Code via API:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Falha ao gerar o QR Code.' });
    }
});

export default router;