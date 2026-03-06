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
    const filePath = path.join(__dirname, '..', 'presenca_gerada_api.png');

    try {
        await generateQRCodeFile(checkinUrl, filePath);

        if (req.query.download === 'true') {
            return res.download(filePath, 'qrcode_checkin.png');
        }

        res.json({
            sucesso: true,
            mensagem: 'QR Code gerado com sucesso!',
            arquivo: 'presenca_gerada_api.png',
            url: checkinUrl,
        });
    } catch (error) {
        console.error('Erro ao gerar QR Code via API:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Falha ao gerar o QR Code.' });
    }
});

export default router;