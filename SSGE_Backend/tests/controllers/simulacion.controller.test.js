const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');

const simulacionController = require('../../src/controllers/simulacion.controller');
const { prisma } = require('../../src/lib/prisma');
const MotorSimulacion = require('../../src/services/MotorSimulacion');

// --- SETUP EXPRESS Y RUTAS ---
const app = express();
app.use(express.json());

app.post('/api/simulaciones', simulacionController.ejecutarSimulacion);
app.get('/api/simulaciones', simulacionController.obtenerSimulaciones);
app.get('/api/simulaciones/:id', simulacionController.obtenerSimulacionPorId);
app.get('/api/simulaciones/:id/exportar', simulacionController.exportarSimulacion);
app.delete('/api/simulaciones/:id', simulacionController.eliminarSimulacion);
app.get('/api/historial-simulacion', simulacionController.obtenerHistorial);

test('Controlador de Simulación (API REST) - Cobertura 100%', async (t) => {
    
    const originalConsoleError = console.error;
    let originalPrismaFindFirst, originalPrismaFindMany, originalPrismaFindUnique, originalPrismaDelete, originalPrismaTransaction;
    let originalManual, originalHistorico;

    t.beforeEach(() => {
        console.error = () => {}; // Silenciar logs

        originalPrismaFindFirst = prisma.embalse.findFirst;
        originalPrismaFindMany = prisma.resultadoSimulacion.findMany;
        originalPrismaFindUnique = prisma.resultadoSimulacion.findUnique;
        originalPrismaDelete = prisma.resultadoSimulacion.delete;
        originalPrismaTransaction = prisma.$transaction;

        originalManual = MotorSimulacion.simularEscenarioManual;
        originalHistorico = MotorSimulacion.simularEscenarioHistorico;
    });

    t.afterEach(() => {
        console.error = originalConsoleError;
        prisma.embalse.findFirst = originalPrismaFindFirst;
        prisma.resultadoSimulacion.findMany = originalPrismaFindMany;
        prisma.resultadoSimulacion.findUnique = originalPrismaFindUnique;
        prisma.resultadoSimulacion.delete = originalPrismaDelete;
        prisma.$transaction = originalPrismaTransaction;

        MotorSimulacion.simularEscenarioManual = originalManual;
        MotorSimulacion.simularEscenarioHistorico = originalHistorico;
    });

   // --- 1. POST /api/simulaciones (ejecutarSimulacion) ---
    await t.test('POST /api/simulaciones - Falla si embalseId no es válido', async () => {
        const res = await request(app).post('/api/simulaciones').send({ embalseId: 'abc' });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /embalseId debe ser un entero positivo/);
    });

    await t.test('POST /api/simulaciones - Falla si el tipo de escenario no es válido', async () => {
        const res = await request(app).post('/api/simulaciones').send({ embalseId: 1, escenario: { tipo: 'invalido' } });
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Tipo de escenario no válido/);
    });

    await t.test('POST /api/simulaciones - Falla si el embalse no existe', async () => {
        prisma.embalse.findFirst = async () => null;
        const res = await request(app).post('/api/simulaciones').send({ embalseId: 1, escenario: { tipo: 'manual' } });
        assert.strictEqual(res.status, 404);
        assert.match(res.body.error, /Embalse no encontrado/);
    });

    await t.test('POST /api/simulaciones - Ejecuta escenario manual (motor real) y guarda en transacción', async () => {
        // Al embalse le damos una capacidad para que el motor matemático no falle
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales', capacidadHm3: 70 });
        
        prisma.$transaction = async (cb) => {
            const txMock = {
                resultadoSimulacion: {
                    create: async (args) => ({ id: 10, fechaEjecucion: new Date(), ...args.data }),
                    findMany: async () => [{ id: 10 }],
                    deleteMany: async () => ({ count: 0 })
                }
            };
            return cb(txMock);
        };

        const res = await request(app).post('/api/simulaciones').send({
            embalseId: 1,
            // AÑADIDOS LOS DATOS REALES QUE EXIGE EL MOTOR
            estadoInicial: { volumenHm3: 35 }, 
            escenario: { tipo: 'manual', duracionMin: 60, pasoMin: 60, caudalEntradaM3s: 10, mes: 6 } 
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.id, 10);
        assert.strictEqual(res.body.tipo, 'manual');
    });

    await t.test('POST /api/simulaciones - Falla escenario histórico con fechas inválidas o rango invertido', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales' });

        let res = await request(app).post('/api/simulaciones').send({
            embalseId: 1,
            estadoInicial: { volumenHm3: 35 },
            escenario: { tipo: 'historico', desde: 'texto-roto', hasta: 'texto-roto' }
        });
        assert.strictEqual(res.status, 400);

        res = await request(app).post('/api/simulaciones').send({
            embalseId: 1,
            estadoInicial: { volumenHm3: 35 },
            escenario: { tipo: 'historico', desde: '2026-08-10', hasta: '2026-08-01' }
        });
        assert.strictEqual(res.status, 400);
    });

    await t.test('POST /api/simulaciones - Falla escenario histórico si no hay datos en la BD', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales' });
        prisma.medicionHistorica = { findMany: async () => [] };

        const res = await request(app).post('/api/simulaciones').send({
            embalseId: 1,
            estadoInicial: { volumenHm3: 35 },
            escenario: { tipo: 'historico', desde: '2026-08-01', hasta: '2026-08-02' }
        });
        assert.strictEqual(res.status, 404);
    });

    await t.test('POST /api/simulaciones - Ejecuta escenario histórico (motor real) con éxito', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales', capacidadHm3: 70 });
        
        // Damos datos históricos coherentes para que el motor matemático los pueda usar
        prisma.medicionHistorica = { 
            findMany: async () => [
                { timestamp: new Date(), caudalEntrada: 10, volumen: 50, caudalSalida: 5 }
            ] 
        };
        
        prisma.$transaction = async (cb) => {
            const txMock = {
                resultadoSimulacion: {
                    create: async () => ({ id: 11, fechaEjecucion: new Date() }),
                    findMany: async () => [],
                    deleteMany: async () => ({ count: 0 })
                }
            };
            return cb(txMock);
        };

        const res = await request(app).post('/api/simulaciones').send({
            embalseId: 1,
            estadoInicial: { volumenHm3: 50 }, 
            escenario: { tipo: 'historico', desde: '2026-08-01', hasta: '2026-08-02', pasoMin: 60 }
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.id, 11);
    });

    await t.test('POST /api/simulaciones - Captura error general en catch', async () => {
        prisma.embalse.findFirst = async () => { throw new Error('Fallo crítico simulación'); };
        const res = await request(app).post('/api/simulaciones').send({ 
            embalseId: 1, 
            estadoInicial: { volumenHm3: 35 }, 
            escenario: { tipo: 'manual', duracionMin: 60, caudalEntradaM3s: 10 } 
        });
        assert.strictEqual(res.status, 400);
    });

    // --- 2. GET /api/simulaciones (obtenerSimulaciones) ---
    await t.test('GET /api/simulaciones - Falla si embalseId en query es inválido', async () => {
        const res = await request(app).get('/api/simulaciones?embalseId=abc');
        assert.strictEqual(res.status, 400);
    });

    await t.test('GET /api/simulaciones - Éxito listando simulaciones', async () => {
        prisma.resultadoSimulacion.findMany = async () => [{ id: 1, tipo: 'manual' }];
        const res = await request(app).get('/api/simulaciones?embalseId=1');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 1);
    });

    await t.test('GET /api/simulaciones - Falla (catch) error DB', async () => {
        prisma.resultadoSimulacion.findMany = async () => { throw new Error('DB Error'); };
        const res = await request(app).get('/api/simulaciones');
        assert.strictEqual(res.status, 500);
    });

    // --- 3. GET /api/simulaciones/:id (obtenerSimulacionPorId) ---
    await t.test('GET /api/simulaciones/:id - Falla id inválido', async () => {
        const res = await request(app).get('/api/simulaciones/abc');
        assert.strictEqual(res.status, 400);
    });

    await t.test('GET /api/simulaciones/:id - Falla 404 si no existe', async () => {
        prisma.resultadoSimulacion.findUnique = async () => null;
        const res = await request(app).get('/api/simulaciones/99');
        assert.strictEqual(res.status, 404);
    });

    await t.test('GET /api/simulaciones/:id - Éxito calculando métricas', async () => {
        prisma.resultadoSimulacion.findUnique = async () => ({
            id: 1, tipo: 'manual', alertaMaxima: 'Normal',
            proyeccion: [{ desembalseSeguridadHm3: 2, demandaUrbanaObjetivoHm3: 1, demandaUrbanaServidaHm3: 1, demandaAgrariaObjetivoHm3: 2, demandaAgrariaServidaHm3: 2 }]
        });
        const res = await request(app).get('/api/simulaciones/1');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.metricas);
        assert.strictEqual(res.body.metricas.demandaUrbanaSatisfechaPct, 100);
    });

    await t.test('GET /api/simulaciones/:id - Falla (catch)', async () => {
        prisma.resultadoSimulacion.findUnique = async () => { throw new Error('DB Error'); };
        const res = await request(app).get('/api/simulaciones/1');
        assert.strictEqual(res.status, 500);
    });

    // --- 4. GET /api/simulaciones/:id/exportar (exportarSimulacion) ---
    await t.test('GET /api/simulaciones/:id/exportar - Falla id inválido o no encontrada', async () => {
        let res = await request(app).get('/api/simulaciones/abc/exportar');
        assert.strictEqual(res.status, 400);

        prisma.resultadoSimulacion.findUnique = async () => null;
        res = await request(app).get('/api/simulaciones/99/exportar');
        assert.strictEqual(res.status, 404);
    });

    await t.test('GET /api/simulaciones/:id/exportar - Éxito descargando CSV', async () => {
        prisma.resultadoSimulacion.findUnique = async () => ({
            id: 1,
            proyeccion: [{ paso: 1, instanteMin: 60, nivelPorcentaje: 50, volumenHm3: 35, caudalEntradaM3s: 10, caudalEcologicoM3s: 1, desembalseSeguridadM3s: 0, demandaUrbanaServidaHm3: 1, demandaAgrariaServidaHm3: 2, riesgo: 'Normal' }],
            embalse: { nombre: 'Embalse Test' }
        });
        const res = await request(app).get('/api/simulaciones/1/exportar');
        assert.strictEqual(res.status, 200);
        assert.match(res.headers['content-type'], /text\/csv/);
    });

    await t.test('GET /api/simulaciones/:id/exportar - Falla (catch)', async () => {
        prisma.resultadoSimulacion.findUnique = async () => { throw new Error('Error CSV'); };
        const res = await request(app).get('/api/simulaciones/1/exportar');
        assert.strictEqual(res.status, 500);
    });

    // --- 5. DELETE /api/simulaciones/:id (eliminarSimulacion) ---
    await t.test('DELETE /api/simulaciones/:id - Falla id inválido', async () => {
        const res = await request(app).delete('/api/simulaciones/abc');
        assert.strictEqual(res.status, 400);
    });

    await t.test('DELETE /api/simulaciones/:id - Falla 404 si código Prisma P2025', async () => {
        prisma.resultadoSimulacion.delete = async () => { const e = new Error(); e.code = 'P2025'; throw e; };
        const res = await request(app).delete('/api/simulaciones/99');
        assert.strictEqual(res.status, 404);
    });

    await t.test('DELETE /api/simulaciones/:id - Éxito eliminando', async () => {
        prisma.resultadoSimulacion.delete = async () => ({ id: 1 });
        const res = await request(app).delete('/api/simulaciones/1');
        assert.strictEqual(res.status, 200);
    });

    await t.test('DELETE /api/simulaciones/:id - Falla (catch) error genérico', async () => {
        prisma.resultadoSimulacion.delete = async () => { throw new Error('Error DB'); };
        const res = await request(app).delete('/api/simulaciones/1');
        assert.strictEqual(res.status, 500);
    });

    // --- 6. GET /api/historial-simulacion (obtenerHistorial) ---
    await t.test('GET /api/historial-simulacion - Falla si embalseId query es inválido', async () => {
        const res = await request(app).get('/api/historial-simulacion?embalseId=abc');
        assert.strictEqual(res.status, 400);
    });

    await t.test('GET /api/historial-simulacion - Éxito listando historial mapeado', async () => {
        prisma.historialSimulacion = {
            findMany: async () => [{ id: 1, tipo: 'info', fechaHora: new Date(), eventoDisparador: 'Evento', accionAutomatica: 'Acción' }]
        };
        const res = await request(app).get('/api/historial-simulacion');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].titulo, 'Evento');
    });

    await t.test('GET /api/historial-simulacion - Falla (catch) error DB', async () => {
        prisma.historialSimulacion = { findMany: async () => { throw new Error('DB Error'); } };
        const res = await request(app).get('/api/historial-simulacion');
        assert.strictEqual(res.status, 500);
    });

    // --- NUEVOS TESTS PARA COBERTURA DE BIFURCACIONES (BRANCHES) ---

    await t.test('POST /api/simulaciones - Branch: req.body es undefined', async () => {
        // Al no enviar nada, req.body será undefined y saltará al || {}
        const res = await request(app).post('/api/simulaciones').send(undefined);
        assert.strictEqual(res.status, 400); 
    });

    await t.test('GET /api/simulaciones - Branch: sin embalseId en la query', async () => {
        // Al no mandar embalseId, la cláusula 'where' debe ser undefined
        prisma.resultadoSimulacion.findMany = async (query) => {
            assert.strictEqual(query.where, undefined);
            return [];
        };
        const res = await request(app).get('/api/simulaciones');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/simulaciones/:id - Branch: fallbacks a 0 y prevención de división por cero', async () => {
        // Enviamos una proyección vacía de propiedades para forzar los || 0 y el ternary a 100%
        prisma.resultadoSimulacion.findUnique = async () => ({
            id: 1, tipo: 'manual', alertaMaxima: 'Normal',
            proyeccion: [{ paso: 1 }] 
        });
        const res = await request(app).get('/api/simulaciones/1');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.metricas.volumenTotalDesembalsadoHm3, 0);
        assert.strictEqual(res.body.metricas.demandaUrbanaSatisfechaPct, 100);
        assert.strictEqual(res.body.metricas.demandaAgrariaSatisfechaPct, 100);
    });

    await t.test('GET /api/historial-simulacion - Branch: límite superior, embalseId válido y tipo fallback', async () => {
        prisma.historialSimulacion = {
            findMany: async (query) => {
                // Comprobamos que el límite de 2500 se ha capado a 1000
                assert.strictEqual(query.take, 1000);
                assert.deepStrictEqual(query.where, { embalseId: 1 });
                
                // Devolvemos un registro sin 'tipo' para forzar el || 'info'
                return [{ id: 1, fechaHora: new Date(), eventoDisparador: 'A', accionAutomatica: 'B' }]; 
            }
        };
        const res = await request(app).get('/api/historial-simulacion?limite=2500&embalseId=1');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body[0].tipo, 'info'); // Comprobación del fallback
    });
    
});