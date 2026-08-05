const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');

const medicionController = require('../../src/controllers/medicion.controller');
const MedicionRepository = require('../../src/repositories/medicion.repository');

// --------------------------------------------------------------------------
// SETUP: Montamos una app de Express aislada
// --------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Enlazamos las rutas simuladas
app.get('/api/mediciones', medicionController.obtenerPorRango);
app.post('/api/mediciones', medicionController.guardar);

test('Controlador de Mediciones (API REST) - Cobertura 100%', async (t) => {
    
    let repoPrimerId, repoVerificar, repoUltimos, repoUpsert, repoRango;

    t.beforeEach(() => {
        repoPrimerId = MedicionRepository.obtenerPrimerEmbalseId;
        repoVerificar = MedicionRepository.verificarEmbalseExiste;
        repoUltimos = MedicionRepository.obtenerUltimosDatos;
        repoUpsert = MedicionRepository.upsert;
        repoRango = MedicionRepository.obtenerPorRango;
    });

    t.afterEach(() => {
        MedicionRepository.obtenerPrimerEmbalseId = repoPrimerId;
        MedicionRepository.verificarEmbalseExiste = repoVerificar;
        MedicionRepository.obtenerUltimosDatos = repoUltimos;
        MedicionRepository.upsert = repoUpsert;
        MedicionRepository.obtenerPorRango = repoRango;
    });

    // --- 1. GET /api/mediciones (obtenerPorRango) ---
    
    await t.test('GET /api/mediciones - Rango día (defecto) con embalse válido', async () => {
        MedicionRepository.obtenerPorRango = async (id, fecha) => [{ id: 1, nivel: 100 }];
        const res = await request(app).get('/api/mediciones?embalseId=1');
        
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body[0].nivel, 100);
    });

    await t.test('GET /api/mediciones - Rango mes con embalse inválido (usa primer ID)', async () => {
        MedicionRepository.obtenerPrimerEmbalseId = async () => 2;
        MedicionRepository.obtenerPorRango = async (id, fecha) => [{ id: 2, nivel: 200 }];
        
        const res = await request(app).get('/api/mediciones?embalseId=abc&rango=mes');
        
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body[0].nivel, 200);
    });

    await t.test('GET /api/mediciones - Rango semana con embalse inválido y sin primer ID', async () => {
        MedicionRepository.obtenerPrimerEmbalseId = async () => null;
        
        const res = await request(app).get('/api/mediciones?embalseId=abc&rango=semana');
        
        // Debe devolver array vacío temprano (Línea 64)
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body, []);
    });

    await t.test('GET /api/mediciones - Falla (catch) si hay error en BD', async () => {
        MedicionRepository.obtenerPrimerEmbalseId = async () => 1;
        MedicionRepository.obtenerPorRango = async () => { throw new Error('Error DB Simulado'); };
        
        const res = await request(app).get('/api/mediciones?embalseId=1');
        
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Error DB Simulado/);
    });


    // --- 2. POST /api/mediciones (procesarYGuardarPayload) ---
    
    await t.test('POST /api/mediciones - Guarda correctamente parseando comas, años cortos y usando fallbacks', async () => {
        MedicionRepository.verificarEmbalseExiste = async () => true;
        MedicionRepository.obtenerUltimosDatos = async () => ({
            estadoPrevio: { temperatura: 15.5 }, // Valor que debe rescatarse por fallback
            respaldoEntrada: 0, 
            respaldoSalida: 0
        });
        MedicionRepository.upsert = async (id, fecha, data) => ({ id: 99, ...data });

        const payload = {
            embalseId: 1,
            timestamp: '15/08/26 14:30', // Prueba parsearFecha con año '26' (Línea 12)
            mediciones: {
                'NIVEL EMBALSE (m.s.n.m)': '100,5', // Prueba extraerSeguro reemplazando coma por punto (Línea 24)
                'APORTACION AL EMBALSE (m³/s)': '10.2', // Prueba extraerCaudal válido (Línea 33)
                'CAUDAL DESEMBALSADO AL RIO (m³/s)': '-5', // Caudal negativo, debe saltar al fallback (Líneas 33-34)
                'TEMPERATURA (ºC)': '' // Campo vacío, debe usar el de estadoPrevio (Línea 24)
            }
        };

        const res = await request(app).post('/api/mediciones').send(payload);
        
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.nivel, 100.5);
        assert.strictEqual(res.body.caudalEntrada, 10.2);
        assert.strictEqual(res.body.caudalSalida, 0); // Caudal inválido = fallback
        assert.strictEqual(res.body.temperatura, 15.5); // Vacío = fallback
    });

    await t.test('POST /api/mediciones - Embalse ID no numérico, usa primer ID y fecha inválida', async () => {
        MedicionRepository.obtenerPrimerEmbalseId = async () => 3;
        MedicionRepository.obtenerUltimosDatos = async () => ({
            estadoPrevio: {}, respaldoEntrada: 0, respaldoSalida: 0
        });
        MedicionRepository.upsert = async (id) => ({ embalseUsado: id });

        // 'timestamp' con formato roto para disparar el catch/isNaN de parsearFecha (Líneas 16 y 20)
        const payload = { embalseId: 'nulo', timestamp: 'hola_mundo' };
        
        const res = await request(app).post('/api/mediciones').send(payload);
        
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.embalseUsado, 3);
    });

    await t.test('POST /api/mediciones - Embalse ID no numérico y no hay primer embalse en la BD', async () => {
        MedicionRepository.obtenerPrimerEmbalseId = async () => null;
        
        const res = await request(app).post('/api/mediciones').send({ embalseId: 'nulo' });
        
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /No hay embalses creados/); // (Línea 44)
    });

    await t.test('POST /api/mediciones - Embalse válido numérico, pero no existe, usa primer ID', async () => {
        MedicionRepository.verificarEmbalseExiste = async () => false;
        MedicionRepository.obtenerPrimerEmbalseId = async () => 5;
        MedicionRepository.obtenerUltimosDatos = async () => ({
            estadoPrevio: {}, respaldoEntrada: 0, respaldoSalida: 0
        });
        MedicionRepository.upsert = async (id, fecha, data) => ({ id });

        // Timestamp omitido, forzando la línea 4
        const payload = { embalseId: 999 }; 
        const res = await request(app).post('/api/mediciones').send(payload);
        
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.id, 5); // Fallback exitoso (Línea 47)
    });

    await t.test('POST /api/mediciones - Embalse numérico, no existe, y no hay primer embalse', async () => {
        MedicionRepository.verificarEmbalseExiste = async () => false;
        MedicionRepository.obtenerPrimerEmbalseId = async () => null;
        
        const res = await request(app).post('/api/mediciones').send({ embalseId: 999 });
        
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /No hay embalses creados/); // (Línea 49)
    });
    
    await t.test('POST /api/mediciones - Falla interna genérica (catch) al guardar', async () => {
        MedicionRepository.verificarEmbalseExiste = async () => true;
        MedicionRepository.obtenerUltimosDatos = async () => { throw new Error('Fallo crítico insertando DB'); };
        
        const res = await request(app).post('/api/mediciones').send({ embalseId: 1 });
        
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Fallo crítico insertando DB/); // (Línea 86)
    });
});