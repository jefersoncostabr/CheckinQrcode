import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQRCodeBuffer, getQrBaseUrl } from './scripts/qrCodeService.js';
import { requireAuth } from './middleware/auth.js';
import { encontrarSala, getConfigDoc } from './salasService.js';

// Helper para obter o __dirname em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Protege todas as rotas desta rota de administração
router.use(requireAuth);

/**
 * Rota para gerar um QR Code para a URL de check-in.
 * Retorna JSON com a URL de destino e o caminho do arquivo gerado.
 * Se passar ?download=true, retorna o PNG diretamente.
 */
router.get('/gerar-qrcode', async (req, res) => {
    const salaId = req.query.sala;

    if (!salaId) {
        return res.status(400).json({ sucesso: false, mensagem: 'Parâmetro sala é obrigatório.' });
    }

    try {
        const baseUrl = getQrBaseUrl(req);
        if (!baseUrl) {
            return res.status(503).json({
                sucesso: false,
                mensagem: 'Não foi possível identificar o endereço da rede. Acesse o painel pelo IPv4 do computador ou configure PUBLIC_BASE_URL.',
            });
        }
        const doc = await getConfigDoc();
        const sala = encontrarSala(doc, salaId);
        if (!sala) return res.status(404).json({ sucesso: false, mensagem: 'Sala não cadastrada.' });
        const checkinUrl = `${baseUrl}/add?id=${encodeURIComponent(sala.id)}`;

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
            sala: sala.nome,
            salaId: sala.id,
        });
    } catch (error) {
        console.error('Erro ao gerar QR Code via API:', error);
        res.status(500).json({ sucesso: false, mensagem: 'Falha ao gerar o QR Code.' });
    }
});

export default router;