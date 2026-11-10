import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import 'dotenv/config';

// Para rodar o teste, use o comando: npm test

describe('Testes das Rotas de Check-in', () => {
    // Conecta ao banco antes de rodar os testes
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
    });

    // Fecha a conexão após todos os testes
    afterAll(async () => {
        await mongoose.connection.close();
    });

    it('Deve verificar se o servidor está online (GET /)', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toEqual(200);
        expect(res.text).toBe('O servidor funcionando.');
    });

    it('Deve retornar a quantidade inicial de check-ins (GET /qtd)', async () => {
        const res = await request(app).get('/qtd');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('quantidade');
    });

    it('Deve proteger a rota /adm (Redirecionar se não autenticado)', async () => {
        const res = await request(app).get('/adm');
        expect(res.statusCode).toEqual(302); // Redirecionamento para /login
    });

    it('Deve proteger o cadastro administrativo de usuários', async () => {
        const res = await request(app)
            .post('/adm/cadastrar-usuario')
            .send({});
        expect(res.statusCode).toBe(302);
    });

    it('Deve proteger a lista de pessoas e perfis faciais', async () => {
        const res = await request(app).get('/api/face/pessoas');
        expect(res.statusCode).toBe(302);
    });

    it('Deve carregar a lista de QR Codes para a administração', async () => {
        const agent = request.agent(app);
        const login = await agent.post('/login').type('form').send({
            user: process.env.ADMIN_USER,
            pass: process.env.ADMIN_PASS,
        });
        expect(login.statusCode).toEqual(302);

        const res = await agent.get('/api/qrcodes');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('limite', 10);
        expect(res.body).toHaveProperty('qrcodes');
    });

    it('Deve listar nomes do histórico com indicador de cadastro facial', async () => {
        const agent = request.agent(app);
        const login = await agent.post('/login').type('form').send({
            user: process.env.ADMIN_USER,
            pass: process.env.ADMIN_PASS,
        });
        expect(login.statusCode).toBe(302);

        const res = await agent.get('/api/face/pessoas');
        expect(res.statusCode).toBe(200);
        expect(res.body.sucesso).toBe(true);
        expect(Array.isArray(res.body.pessoas)).toBe(true);
        for (const pessoa of res.body.pessoas) {
            expect(pessoa).toEqual({
                nome: expect.any(String),
                temRosto: expect.any(Boolean),
            });
        }
    });

    it('Deve falhar ao tentar fazer check-in sem nome (POST /add)', async () => {
        const res = await request(app)
            .post('/add')
            .send({});
        expect(res.statusCode).not.toBe(200);
    });

    it('Deve exigir consentimento para cadastrar um rosto', async () => {
        const res = await request(app)
            .post('/api/face/enroll')
            .send({ nome: 'Pessoa Teste', descritor: Array(128).fill(0) });
        expect(res.statusCode).toBe(400);
        expect(res.body.sucesso).toBe(false);
    });

    it('Deve rejeitar descritores faciais inválidos', async () => {
        const res = await request(app)
            .post('/api/face/checkin')
            .send({ descritor: [0] });
        expect(res.statusCode).toBe(400);
    });

    it('Deve servir a página de teste facial', async () => {
        const res = await request(app).get('/teste-rosto');
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Testar cadastro facial');
    });

    it('Deve rejeitar descritores inválidos na verificação facial', async () => {
        const res = await request(app)
            .post('/api/face/verify')
            .send({ descritor: [0] });
        expect(res.statusCode).toBe(400);
    });

    it('Deve validar o nome opcional da verificação facial', async () => {
        const res = await request(app)
            .post('/api/face/verify')
            .send({ descritor: Array(128).fill(0), nome: ' ' });
        expect(res.statusCode).toBe(400);
    });

    it('Deve exigir credencial para excluir um cadastro facial', async () => {
        const res = await request(app).delete('/api/face/profile/invalid-id');
        expect(res.statusCode).toBe(403);
    });
});