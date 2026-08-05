const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const express = require('express');

const embalseController = require('../../src/controllers/embalse.controller');
const EmbalseRepository = require('../../src/repositories/embalse.repository');

const app = express();
app.use(express.json());

// --- MOCK DE SOCKET.IO (Cubre líneas 86-89) ---
const mockIo = {
    to: (room) => ({
        emit: (event, data) => {
            // Simulamos la emisión del evento correctamente
        }
    })
};
app.set('io', mockIo); 
// ----------------------------------------------

app.post('/api/embalses', embalseController.guardar || embalseController.crear);
app.get('/api/embalses', embalseController.obtenerTodos || embalseController.listar);
app.get('/api/embalses/:id', embalseController.obtenerPorId || embalseController.obtenerUno);
app.put('/api/embalses/:id', embalseController.actualizar);
app.patch('/api/embalses/:id/estado', embalseController.cambiarEstado);
app.delete('/api/embalses/:id', embalseController.eliminarLogico || embalseController.eliminar);

test('Controlador de Embalses (API REST) - Cobertura 100%', async (t) => {
    
    let repoObtenerTodos, repoObtenerPorId, repoGuardar, repoActualizar, repoCambiarEstado, repoEliminarLogico;
    const originalConsoleError = console.error;

    t.beforeEach(() => {
        console.error = () => {}; 
        repoObtenerTodos = EmbalseRepository.obtenerTodos;
        repoObtenerPorId = EmbalseRepository.obtenerPorId;
        repoGuardar = EmbalseRepository.guardar;
        repoActualizar = EmbalseRepository.actualizar;
        repoCambiarEstado = EmbalseRepository.cambiarEstado;
        repoEliminarLogico = EmbalseRepository.eliminarLogico;
    });

    t.afterEach(() => {
        console.error = originalConsoleError;
        EmbalseRepository.obtenerTodos = repoObtenerTodos;
        EmbalseRepository.obtenerPorId = repoObtenerPorId;
        EmbalseRepository.guardar = repoGuardar;
        EmbalseRepository.actualizar = repoActualizar;
        EmbalseRepository.cambiarEstado = repoCambiarEstado;
        EmbalseRepository.eliminarLogico = repoEliminarLogico;
    });

    // --- GET /api/embalses ---
    await t.test('GET /api/embalses - Devuelve 200 y la lista de embalses', async () => {
        EmbalseRepository.obtenerTodos = async () => [{ id: 1, nombre: 'Canales' }];
        const res = await request(app).get('/api/embalses');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/embalses - Falla (catch) si hay error en BD', async () => {
        EmbalseRepository.obtenerTodos = async () => { throw new Error('Error BD'); };
        const res = await request(app).get('/api/embalses');
        assert.ok([400, 500].includes(res.status));
    });

    // --- GET /api/embalses/:id ---
    await t.test('GET /api/embalses/:id - Devuelve 200 y el embalse', async () => {
        EmbalseRepository.obtenerPorId = async (id) => ({ id: Number(id), nombre: 'Rules' });
        const res = await request(app).get('/api/embalses/1');
        assert.strictEqual(res.status, 200);
    });

    await t.test('GET /api/embalses/:id - Validaciones de ID inválido o no encontrado', async () => {
        EmbalseRepository.obtenerPorId = async () => null;
        let res = await request(app).get('/api/embalses/99');
        assert.ok([404, 400].includes(res.status));
        res = await request(app).get('/api/embalses/abc');
        assert.ok([400, 404, 500].includes(res.status));
    });

    await t.test('GET /api/embalses/:id - Falla (catch) si hay error en BD', async () => {
        EmbalseRepository.obtenerPorId = async () => { throw new Error('Error BD'); };
        const res = await request(app).get('/api/embalses/1');
        assert.ok([400, 500].includes(res.status));
    });

    // --- POST /api/embalses (CUBRIENDO VALIDAR PAYLOAD Y SOCKET.IO) ---
    await t.test('POST /api/embalses - Crea correctamente y emite socket (Líneas 86-89)', async () => {
        const payloadValido = { 
            nombre: 'Nuevo', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10,
            sensores: [{ tipo: 'NIVEL', valorActual: 15 }], // Cubre línea 24
            compuertas: [{ nombre: '', estadoAperturaPorcentaje: 50, caudalSalidaActual: 10, cotaTomaM: 50 }] // Cubre líneas 36-37
        };
        EmbalseRepository.guardar = async (data) => ({ id: 2, ...data });
        const res = await request(app).post('/api/embalses').send(payloadValido);
        assert.ok([200, 201].includes(res.status));
    });

    await t.test('POST /api/embalses - Falla si sensor no tiene tipo (Líneas 22-24)', async () => {
        const payload = { nombre: 'Test', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10, sensores: [{ tipo: '' }] };
        const res = await request(app).post('/api/embalses').send(payload);
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /El tipo de sensor es obligatorio/);
    });

    await t.test('POST /api/embalses - Falla si compuerta apertura inválida (Línea 32)', async () => {
        const payload = { nombre: 'Test', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10, compuertas: [{ estadoAperturaPorcentaje: 150 }] };
        const res = await request(app).post('/api/embalses').send(payload);
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /apertura debe estar entre 0 y 100/);
    });

    await t.test('POST /api/embalses - Falla si compuerta caudal negativo (Línea 33)', async () => {
        const payload = { nombre: 'Test', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10, compuertas: [{ caudalSalidaActual: -5 }] };
        const res = await request(app).post('/api/embalses').send(payload);
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /caudal de salida no puede ser negativo/);
    });

    await t.test('POST /api/embalses - Falla si cota de toma está fuera de rango (Línea 34)', async () => {
        const payload = { nombre: 'Test', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 50, compuertas: [{ cotaTomaM: 10 }] };
        const res = await request(app).post('/api/embalses').send(payload);
        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /dentro del rango/);
    });

    await t.test('POST /api/embalses - Validaciones de payload incompleto', async () => {
        const res = await request(app).post('/api/embalses').send({});
        assert.ok([400, 422, 500].includes(res.status));
    });

    await t.test('POST /api/embalses - Falla (catch) si hay error interno', async () => {
        const payloadValido = { nombre: 'Fallo', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10 };
        EmbalseRepository.guardar = async () => { throw new Error('Error BD'); };
        const res = await request(app).post('/api/embalses').send(payloadValido);
        assert.ok([400, 500].includes(res.status));
    });

    // --- PUT /api/embalses/:id ---
    await t.test('PUT /api/embalses/:id - Actualiza correctamente', async () => {
        const payloadValido = { nombre: 'Actualizado', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10 };
        EmbalseRepository.actualizar = async (id, data) => ({ id: Number(id), ...data });
        const res = await request(app).put('/api/embalses/1').send(payloadValido);
        assert.strictEqual(res.status, 200);
    });

    await t.test('PUT /api/embalses/:id - Validaciones ID y Payload', async () => {
        let res = await request(app).put('/api/embalses/abc').send({});
        assert.ok([400, 404, 500].includes(res.status));
    });

    await t.test('PUT /api/embalses/:id - Devuelve 404 explícito si no existe (Líneas 107-108)', async () => {
        const payloadValido = { nombre: 'Fallo', capacidadHm3: 50, cotaMaximaM: 100, cotaMinimaM: 10 };
        // Forzamos el mensaje exacto para entrar en el if
        EmbalseRepository.actualizar = async () => { throw new Error('El embalse NO EXISTE en el sistema'); };
        const res = await request(app).put('/api/embalses/99').send(payloadValido);
        assert.strictEqual(res.status, 404);
        assert.match(res.body.error.toLowerCase(), /no existe/);
    });

    // --- PATCH /api/embalses/:id/estado ---
    await t.test('PATCH /api/embalses/:id/estado - Cambia estado', async () => {
        EmbalseRepository.cambiarEstado = async (id, activo) => ({ id: Number(id), activo });
        const res = await request(app).patch('/api/embalses/1/estado').send({ activo: false });
        assert.strictEqual(res.status, 200);
    });

    await t.test('PATCH /api/embalses/:id/estado - Validación y catch de errores', async () => {
        let res = await request(app).patch('/api/embalses/1/estado').send({});
        assert.ok([400, 500].includes(res.status));
        EmbalseRepository.cambiarEstado = async () => { throw new Error('Error de cambio de estado'); };
        res = await request(app).patch('/api/embalses/1/estado').send({ activo: true });
        assert.ok([400, 404, 500].includes(res.status));
    });

    // --- DELETE /api/embalses/:id ---
    await t.test('DELETE /api/embalses/:id - Elimina lógicamente', async () => {
        EmbalseRepository.eliminarLogico = async (id) => ({ id: Number(id), eliminado: true });
        const res = await request(app).delete('/api/embalses/1');
        assert.ok([200, 204].includes(res.status));
    });

    await t.test('DELETE /api/embalses/:id - Validación y catch de errores', async () => {
        let res = await request(app).delete('/api/embalses/abc');
        assert.ok([400, 404, 500].includes(res.status));
        EmbalseRepository.eliminarLogico = async () => { throw new Error('Error al borrar'); };
        res = await request(app).delete('/api/embalses/99');
        assert.ok([400, 404, 500].includes(res.status));
    });
});