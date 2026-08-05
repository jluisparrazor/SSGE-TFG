const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const authController = require('../../src/controllers/auth.controller');
const { prisma } = require('../../src/lib/prisma');

// --- SETUP EXPRESS Y RUTAS ---
const app = express();
app.use(express.json());

// Inyectamos un middleware falso para simular el req.user en getMe
app.get('/api/auth/me', (req, res, next) => {
    if (req.headers.authorization === 'Bearer token_valido') {
        req.user = { id: 1 };
    } else if (req.headers.authorization === 'Bearer inactivo') {
        req.user = { id: 2 };
    } else {
        req.user = { id: 99 };
    }
    next();
}, authController.getMe);

app.post('/api/auth/login', authController.login);
app.get('/api/admin/usuarios', authController.obtenerUsuarios);
app.post('/api/admin/usuarios', authController.crearUsuario);
app.put('/api/admin/usuarios/:id', authController.actualizarUsuario);
app.get('/api/auditoria', authController.obtenerAuditoria);

test('Controlador de Autenticación y Usuarios (API REST) - Cobertura 100%', async (t) => {
    
    // Guardamos copias de las funciones originales para restaurarlas
    const originalConsoleError = console.error;
    const originalBcryptCompare = bcrypt.compare;
    const originalBcryptHash = bcrypt.hash;
    const originalJwtSign = jwt.sign;

    let originalPrismaFindUnique, originalPrismaFindMany, originalPrismaCreate, originalPrismaUpdate, originalPrismaCount;

    t.beforeEach(() => {
        console.error = () => {}; // Silenciar logs de error en consola
        originalPrismaFindUnique = prisma.usuario.findUnique;
        originalPrismaFindMany = prisma.usuario.findMany;
        originalPrismaCreate = prisma.usuario.create;
        originalPrismaUpdate = prisma.usuario.update;
        originalPrismaCount = prisma.auditoriaEvento.count;
        
        prisma.auditoriaEvento = { findMany: async () => [], count: async () => 0 };
    });

    t.afterEach(() => {
        console.error = originalConsoleError;
        bcrypt.compare = originalBcryptCompare;
        bcrypt.hash = originalBcryptHash;
        jwt.sign = originalJwtSign;
        
        prisma.usuario.findUnique = originalPrismaFindUnique;
        prisma.usuario.findMany = originalPrismaFindMany;
        prisma.usuario.create = originalPrismaCreate;
        prisma.usuario.update = originalPrismaUpdate;
        prisma.auditoriaEvento.count = originalPrismaCount;
    });

    // --- LOGIN ---
    await t.test('POST /api/auth/login - Falla por falta de campos o tipos incorrectos', async () => {
        // Enviar números fuerza el fallback typeof === 'string' a devolver ''
        let res = await request(app).post('/api/auth/login').send({ username: 123, password: 456 });
        assert.strictEqual(res.status, 400);
        
        res = await request(app).post('/api/auth/login').send({});
        assert.strictEqual(res.status, 400);
    });

    await t.test('POST /api/auth/login - Falla si usuario no existe o está inactivo', async () => {
        prisma.usuario.findUnique = async () => null;
        let res = await request(app).post('/api/auth/login').send({ username: 'admin', password: '123' });
        assert.strictEqual(res.status, 401);

        prisma.usuario.findUnique = async () => ({ activo: false });
        res = await request(app).post('/api/auth/login').send({ username: 'admin', password: '123' });
        assert.strictEqual(res.status, 401);
    });

    await t.test('POST /api/auth/login - Falla por contraseña incorrecta', async () => {
        prisma.usuario.findUnique = async () => ({ activo: true, passwordHash: 'hash' });
        bcrypt.compare = async () => false;
        
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: '123' });
        assert.strictEqual(res.status, 401);
    });

    await t.test('POST /api/auth/login - Exito retorna token', async () => {
        prisma.usuario.findUnique = async () => ({ id: 1, username: 'admin', rol: 'ADMIN', activo: true, passwordHash: 'hash' });
        bcrypt.compare = async () => true;
        jwt.sign = () => 'token_generado';
        
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: '123' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.token, 'token_generado');
    });

    await t.test('POST /api/auth/login - Falla interna (catch)', async () => {
        prisma.usuario.findUnique = async () => { throw new Error('DB Err'); };
        const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: '123' });
        assert.strictEqual(res.status, 500);
    });

    // --- GET ME ---
    await t.test('GET /api/auth/me - Éxito devuelve usuario', async () => {
        prisma.usuario.findUnique = async () => ({ id: 1, username: 'admin', rol: 'ADMIN', activo: true });
        const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token_valido');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.usuario.id, 1);
    });

    await t.test('GET /api/auth/me - Falla si usuario inactivo o borrado', async () => {
        prisma.usuario.findUnique = async (q) => q.where.id === 2 ? { activo: false } : null;
        let res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer inactivo');
        assert.strictEqual(res.status, 401);

        res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer nulo');
        assert.strictEqual(res.status, 401);
    });

    await t.test('GET /api/auth/me - Falla interna (catch)', async () => {
        prisma.usuario.findUnique = async () => { throw new Error('DB Err'); };
        const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer token_valido');
        assert.strictEqual(res.status, 500);
    });

    // --- OBTENER USUARIOS ---
    await t.test('GET /api/admin/usuarios - Éxito', async () => {
        prisma.usuario.findMany = async () => [{ id: 1 }];
        const res = await request(app).get('/api/admin/usuarios');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/admin/usuarios - Falla interna (catch)', async () => {
        prisma.usuario.findMany = async () => { throw new Error('DB Err'); };
        const res = await request(app).get('/api/admin/usuarios');
        assert.strictEqual(res.status, 500);
    });

    // --- CREAR USUARIO ---
    await t.test('POST /api/admin/usuarios - Falla validaciones requeridas', async () => {
        let res = await request(app).post('/api/admin/usuarios').send({});
        assert.strictEqual(res.status, 400);

        res = await request(app).post('/api/admin/usuarios').send({ username: 'user', password: '123', rol: 'INVENTADO' });
        assert.strictEqual(res.status, 400);
    });

    await t.test('POST /api/admin/usuarios - Falla si ya existe (409)', async () => {
        prisma.usuario.findUnique = async () => ({ id: 1 }); // Simula que ya existe
        const res = await request(app).post('/api/admin/usuarios').send({ username: 'user', password: '123', rol: 'OPERADOR' });
        assert.strictEqual(res.status, 409);
    });

    await t.test('POST /api/admin/usuarios - Éxito al crear', async () => {
        prisma.usuario.findUnique = async () => null;
        bcrypt.hash = async () => 'hash';
        prisma.usuario.create = async (args) => ({ id: 2, ...args.data });

        const res = await request(app).post('/api/admin/usuarios').send({ username: 'nuevo', password: '123', rol: 'VISUALIZADOR', activo: false });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.activo, false);
    });

    await t.test('POST /api/admin/usuarios - Falla interna (catch)', async () => {
        prisma.usuario.findUnique = async () => { throw new Error('DB Err'); };
        const res = await request(app).post('/api/admin/usuarios').send({ username: 'a', password: 'b', rol: 'ADMIN' });
        assert.strictEqual(res.status, 500);
    });

    // --- ACTUALIZAR USUARIO ---
    await t.test('PUT /api/admin/usuarios/:id - Falla id inválido', async () => {
        const res = await request(app).put('/api/admin/usuarios/abc').send({});
        assert.strictEqual(res.status, 400);
    });

    await t.test('PUT /api/admin/usuarios/:id - Falla validaciones payload', async () => {
        let res = await request(app).put('/api/admin/usuarios/1').send({ rol: 'FALSO' });
        assert.strictEqual(res.status, 400); // Rol inválido

        res = await request(app).put('/api/admin/usuarios/1').send({ password: '' });
        assert.strictEqual(res.status, 400); // Password vacía

        res = await request(app).put('/api/admin/usuarios/1').send({ username: '   ' });
        assert.strictEqual(res.status, 400); // Sin cambios válidos
    });

    await t.test('PUT /api/admin/usuarios/:id - Éxito actualizando campos', async () => {
        bcrypt.hash = async () => 'hash_nuevo';
        prisma.usuario.update = async (args) => ({ id: 1, ...args.data });

        const res = await request(app).put('/api/admin/usuarios/1').send({ username: 'cambio', password: '456', rol: 'ADMIN', activo: true });
        assert.strictEqual(res.status, 200);
    });

    await t.test('PUT /api/admin/usuarios/:id - Catch con códigos de Prisma', async () => {
        prisma.usuario.update = async () => { 
            const e = new Error(); e.code = 'P2025'; throw e; 
        };
        let res = await request(app).put('/api/admin/usuarios/1').send({ activo: false });
        assert.strictEqual(res.status, 404);

        prisma.usuario.update = async () => { 
            const e = new Error(); e.code = 'P2002'; throw e; 
        };
        res = await request(app).put('/api/admin/usuarios/1').send({ activo: false });
        assert.strictEqual(res.status, 409);

        prisma.usuario.update = async () => { throw new Error(); };
        res = await request(app).put('/api/admin/usuarios/1').send({ activo: false });
        assert.strictEqual(res.status, 500);
    });

    // --- AUDITORIA ---
    await t.test('GET /api/auditoria - Éxito con paginación custom y sin totales', async () => {
        prisma.auditoriaEvento.findMany = async () => [{ id: 1 }];
        // Límite exagerado se corta en 200, negativo se pasa a 50
        const res = await request(app).get('/api/auditoria?limite=500&pagina=2');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.limite, 200); 
        assert.strictEqual(res.body.pagina, 2);
    });

    await t.test('GET /api/auditoria - Éxito incluyendo totales', async () => {
        prisma.auditoriaEvento.findMany = async () => [{ id: 1 }, { id: 2 }];
        prisma.auditoriaEvento.count = async () => 100;
        
        const res = await request(app).get('/api/auditoria?incluirTotal=true');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.total, 100);
        assert.strictEqual(res.body.totalPaginas, 2); // 100 / 50 = 2
    });

    await t.test('GET /api/auditoria - Falla interna (catch)', async () => {
        prisma.auditoriaEvento.findMany = async () => { throw new Error('DB Err'); };
        const res = await request(app).get('/api/auditoria');
        assert.strictEqual(res.status, 500);
    });
});