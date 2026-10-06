import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
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

    it('Deve falhar ao tentar fazer check-in sem nome (POST /add)', async () => {
        const res = await request(app)
            .post('/add')
            .send({});
        expect(res.statusCode).not.toBe(200);
    });
});