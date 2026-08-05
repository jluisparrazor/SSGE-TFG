const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');

const auditoriaController = require('../../src/controllers/auditoria.controller');
const { prisma } = require('../../src/lib/prisma');

// --- SETUP EXPRESS Y RUTAS ---
const app = express();
app.use(express.json());

// Enlazamos las rutas simuladas
app.get('/api/auditoria/global', auditoriaController.obtenerHistorialGlobal);
app.get('/api/auditoria/usuario/:id', auditoriaController.obtenerHistorialUsuario);

test('Controlador de Auditoría (API REST) - Cobertura 100%', async (t) => {
    
    const originalConsoleError = console.error;
    let originalPrismaFindMany;

    t.beforeEach(() => {
        console.error = () => {}; // Silenciar logs de error en consola
        
        // Aseguramos que el objeto exista en el mock de Prisma antes de sobrescribirlo
        if (!prisma.auditoriaEvento) prisma.auditoriaEvento = {};
        originalPrismaFindMany = prisma.auditoriaEvento.findMany;
    });

    t.afterEach(() => {
        console.error = originalConsoleError;
        prisma.auditoriaEvento.findMany = originalPrismaFindMany;
    });

    // --- 1. GET /api/auditoria/global ---

    await t.test('GET /api/auditoria/global - Sin filtros, devuelve 200 con límite por defecto', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.strictEqual(query.take, 200); // Límite por defecto
            return [{ id: 1, mensaje: 'Acción global' }];
        };
        const res = await request(app).get('/api/auditoria/global');
        
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 1);
    });

    await t.test('GET /api/auditoria/global - Filtro de fechaInicio y fechaFin', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.ok(query.where.fechaHora.gte);
            assert.ok(query.where.fechaHora.lte);
            
            // Comprobamos que la fecha fin se ha ajustado a las 23:59:59.999
            const fechaFinGenerada = new Date(query.where.fechaHora.lte);
            assert.strictEqual(fechaFinGenerada.getHours(), 23);
            assert.strictEqual(fechaFinGenerada.getMinutes(), 59);
            
            return [];
        };
        const res = await request(app).get('/api/auditoria/global?fechaInicio=2026-08-01&fechaFin=2026-08-10');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/auditoria/global - Solo filtro de fechaInicio', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.ok(query.where.fechaHora.gte);
            assert.strictEqual(query.where.fechaHora.lte, undefined);
            return [];
        };
        const res = await request(app).get('/api/auditoria/global?fechaInicio=2026-08-01');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/auditoria/global - Solo filtro de fechaFin', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.strictEqual(query.where.fechaHora.gte, undefined);
            assert.ok(query.where.fechaHora.lte);
            return [];
        };
        const res = await request(app).get('/api/auditoria/global?fechaFin=2026-08-10');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/auditoria/global - Filtros de nivel (ERROR e INFO)', async () => {
        // Prueba nivel ERROR
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.deepStrictEqual(query.where.estadoHttp, { gte: 400 });
            return [];
        };
        let res = await request(app).get('/api/auditoria/global?nivel=ERROR');
        assert.strictEqual(res.status, 200);

        // Prueba nivel INFO
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.deepStrictEqual(query.where.estadoHttp, { lt: 400 });
            return [];
        };
        res = await request(app).get('/api/auditoria/global?nivel=INFO');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/auditoria/global - Filtro de usuario insensible a mayúsculas', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.deepStrictEqual(query.where.actorUsername, { contains: 'Admin', mode: 'insensitive' });
            return [];
        };
        const res = await request(app).get('/api/auditoria/global?usuario=Admin');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/auditoria/global - Falla (catch) simulando error en DB', async () => {
        prisma.auditoriaEvento.findMany = async () => { throw new Error('DB rota'); };
        const res = await request(app).get('/api/auditoria/global');
        
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Error al consultar el historial/);
    });

    // --- 2. GET /api/auditoria/usuario/:id ---

    await t.test('GET /api/auditoria/usuario/:id - Devuelve historial del usuario (límite 50)', async () => {
        prisma.auditoriaEvento.findMany = async (query) => {
            assert.strictEqual(query.where.actorId, 1);
            assert.strictEqual(query.take, 50); // Límite forzado para el modal
            return [{ id: 10, actorId: 1, mensaje: 'Login' }];
        };
        const res = await request(app).get('/api/auditoria/usuario/1');
        
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body[0].actorId, 1);
    });

    await t.test('GET /api/auditoria/usuario/:id - Falla (catch) simulando error en DB', async () => {
        prisma.auditoriaEvento.findMany = async () => { throw new Error('DB rota'); };
        const res = await request(app).get('/api/auditoria/usuario/99');
        
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Error al consultar la auditoría del usuario/);
    });
});