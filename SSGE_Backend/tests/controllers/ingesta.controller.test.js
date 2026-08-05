const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

// ----------------------------------------------------------------------
// 1. SETUP DE ENTORNO ANTES DE IMPORTAR EL CONTROLADOR
// ----------------------------------------------------------------------
// Creamos el directorio temporal e inyectamos la variable de entorno
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scraper-test-'));
process.env.SCRAPER_DIR = tempDir;

// Simulamos el script de producción
fs.writeFileSync(path.join(tempDir, 'produccion.js'), '// Script vacío');

// Simulamos el SDK del SAIH
const sdkContent = `
    module.exports = {
        obtenerDatosEstacion: async (codigo, desde, hasta) => {
            if (codigo === 'VACIO') return [];
            if (codigo === 'ERROR') throw new Error('Fallo simulado en SDK');
            return [
                { 'Fecha y Hora': '01/01/2026 10:00', 'NIVEL EMBALSE (m.s.n.m)': '100' },
                { 'Fecha y Hora': '01/01/2026 11:00', 'NIVEL EMBALSE (m.s.n.m)': '101' },
                { 'Fecha y Hora': '', 'NIVEL EMBALSE (m.s.n.m)': '' } // Fila inválida
            ];
        }
    };
`;
fs.writeFileSync(path.join(tempDir, 'saih_sdk.js'), sdkContent);

// Interceptar child_process.spawn para evitar que lance procesos de verdad
let spawnMockCallbacks = {};
const originalSpawn = cp.spawn;
cp.spawn = (cmd, args, opts) => {
    return {
        on: (event, cb) => { spawnMockCallbacks[event] = cb; },
        unref: () => {}
    };
};

// ----------------------------------------------------------------------
// 2. IMPORTACIONES DEL CONTROLADOR DESPUÉS DEL SETUP
// ----------------------------------------------------------------------
const ingestaController = require('../../src/controllers/ingesta.controller');
const { prisma } = require('../../src/lib/prisma');
const MedicionController = require('../../src/controllers/medicion.controller');

// --- SETUP EXPRESS Y RUTAS ---
const app = express();
app.use(express.json());

app.get('/api/ingesta/embalses-config', ingestaController.obtenerEmbalsesConfig);
app.post('/api/ingesta/historico', ingestaController.cargarRangoHistorico);
app.post('/api/ingesta/tareas', ingestaController.ejecutarTarea);

test('Controlador de Ingesta y Tareas (API REST) - Cobertura 100%', async (t) => {
    
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    let originalPrismaFindMany, originalPrismaFindUnique, originalProcesarPayload;
    let originalExistsSync = fs.existsSync;
    let mockExistsSync = null;

    t.after(() => {
        // Limpieza absoluta del directorio temporal al finalizar todos los tests
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}
        cp.spawn = originalSpawn; // Restaurar módulo de sistema
    });

    t.beforeEach(() => {
        console.error = () => {}; 
        console.warn = () => {}; 
        
        originalPrismaFindMany = prisma.embalse.findMany;
        originalPrismaFindUnique = prisma.embalse.findUnique;
        originalProcesarPayload = MedicionController.procesarYGuardarPayload;

        fs.existsSync = (p) => mockExistsSync ? mockExistsSync(p) : originalExistsSync(p);
        spawnMockCallbacks = {};
    });

    t.afterEach(() => {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
        
        prisma.embalse.findMany = originalPrismaFindMany;
        prisma.embalse.findUnique = originalPrismaFindUnique;
        MedicionController.procesarYGuardarPayload = originalProcesarPayload;
        
        mockExistsSync = null;
    });

    // --- 1. GET /api/ingesta/embalses-config ---
    await t.test('GET /api/ingesta/embalses-config - Éxito', async () => {
        prisma.embalse.findMany = async () => [{ id: 1, nombre: 'Canales' }];
        const res = await request(app).get('/api/ingesta/embalses-config');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body[0].nombre, 'Canales');
    });

    await t.test('GET /api/ingesta/embalses-config - Falla (catch)', async () => {
        prisma.embalse.findMany = async () => { throw new Error('DB'); };
        const res = await request(app).get('/api/ingesta/embalses-config');
        assert.strictEqual(res.status, 500);
    });

    // --- 2. POST /api/ingesta/tareas ---
    // --- 2. POST /api/ingesta/tareas ---
    await t.test('POST /api/ingesta/tareas - Falla si falta la tarea', async () => {
        const res = await request(app).post('/api/ingesta/tareas').send({});
        assert.strictEqual(res.status, 400);
    });

    await t.test('POST /api/ingesta/tareas - Falla tarea no válida', async () => {
        const res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'invento' });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /no valida/);
    });

    await t.test('POST /api/ingesta/tareas - Falla script no encontrado', async () => {
        const res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'poblar_historico_mes_sin_sobrescribir' });
        assert.strictEqual(res.status, 404);
        assert.match(res.body.error, /No se encontro el script/);
    });

    await t.test('POST /api/ingesta/tareas - Flujo completo de concurrencia (Lanzar, Bloquear y Liberar)', async () => {
        // 1. Lanzamos la tarea por primera vez (Éxito)
        let res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'produccion' });
        assert.strictEqual(res.status, 202);

        // 2. Intentamos lanzarla de nuevo mientras está corriendo (Debe dar 409)
        res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'produccion' });
        assert.strictEqual(res.status, 409);
        assert.match(res.body.error, /ya se esta ejecutando/);

        // 3. Simulamos que el proceso falla (emite evento 'error'). Esto debería liberarla del Set.
        if (spawnMockCallbacks.error) spawnMockCallbacks.error();

        // 4. Volvemos a lanzarla (Éxito al haberse liberado)
        res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'produccion' });
        assert.strictEqual(res.status, 202);

        // 5. Simulamos que el proceso termina bien (emite evento 'exit'). Esto debería liberarla del Set.
        if (spawnMockCallbacks.exit) spawnMockCallbacks.exit();

        // 6. Volvemos a lanzarla por última vez para confirmar que 'exit' también libera
        res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'produccion' });
        assert.strictEqual(res.status, 202);
        
        // Limpiamos al final para no afectar a futuros tests
        if (spawnMockCallbacks.exit) spawnMockCallbacks.exit();
    });

    await t.test('POST /api/ingesta/tareas - Falla general Scraper no configurado', async () => {
        mockExistsSync = (p) => {
            if (p === tempDir || (typeof p === 'string' && p.includes('SSGE_Scraper'))) return false;
            return originalExistsSync(p);
        };
        const res = await request(app).post('/api/ingesta/tareas').send({ tarea: 'produccion' });
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /No se encontro el directorio/);
    });

    // --- 3. POST /api/ingesta/historico ---
    await t.test('POST /api/ingesta/historico - Falla por falta de parámetros', async () => {
        const res = await request(app).post('/api/ingesta/historico').send({ embalseId: 1 });
        assert.strictEqual(res.status, 400);
    });

    await t.test('POST /api/ingesta/historico - Falla si embalse no existe', async () => {
        prisma.embalse.findUnique = async () => null;
        const res = await request(app).post('/api/ingesta/historico').send({ 
            embalseId: 99, estacionCodigo: 'TEST', desde: '2026-01-01', hasta: '2026-01-10' 
        });
        assert.strictEqual(res.status, 404);
    });

    await t.test('POST /api/ingesta/historico - Responde 200 con mensaje si no hay datos', async () => {
        prisma.embalse.findUnique = async () => ({ id: 1, nombre: 'Canales' });
        
        const res = await request(app).post('/api/ingesta/historico').send({ 
            embalseId: 1, estacionCodigo: 'VACIO', desde: '2026-01-01', hasta: '2026-01-10' 
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.registrosNuevos, 0);
        assert.match(res.body.mensaje, /no devolvió datos/);
    });

    await t.test('POST /api/ingesta/historico - Éxito procesando datos con fallos aislados (catch interno)', async () => {
        prisma.embalse.findUnique = async () => ({ id: 1, nombre: 'Canales' });
        
        let contadorLlamadas = 0;
        MedicionController.procesarYGuardarPayload = async () => {
            contadorLlamadas++;
            if (contadorLlamadas === 2) throw new Error('Fallo aislado simulado');
            return true;
        };

        const res = await request(app).post('/api/ingesta/historico').send({ 
            embalseId: 1, estacionCodigo: 'TEST', desde: '2026-01-01', hasta: '2026-01-10' 
        });
        
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.registrosNuevos, 1);
    });

    await t.test('POST /api/ingesta/historico - Falla general (catch externo)', async () => {
        prisma.embalse.findUnique = async () => ({ id: 1, nombre: 'Canales' });
        const res = await request(app).post('/api/ingesta/historico').send({ 
            embalseId: 1, estacionCodigo: 'ERROR', desde: '2026-01-01', hasta: '2026-01-10' 
        });
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Error al comunicarse/);
    });
});