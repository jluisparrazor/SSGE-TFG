const test = require('node:test');
const assert = require('node:assert');

// Importamos prisma para poder "secuestrar" su método de escritura durante el test
const { prisma } = require('../../src/lib/prisma');
const auditMiddleware = require('../../src/middlewares/audit.middleware');

test('Middleware de Auditoría', async (t) => {
    let originalCreate;

    // Antes de cada test, guardamos la función original de Prisma
    t.beforeEach(() => {
        originalCreate = prisma.auditoriaEvento.create;
    });

    // Después de cada test, la restauramos para no romper otras pruebas
    t.afterEach(() => {
        prisma.auditoriaEvento.create = originalCreate;
    });

    // Función de utilidad para crear objetos req y res simulados
    function crearMocksHTTP() {
        const req = {
            method: 'GET',
            originalUrl: '/api/test',
            headers: {},
            params: {},
            query: {},
            socket: {}
        };
        
        const res = {
            statusCode: 200,
            callbacks: {},
            // Simulamos el comportamiento del evento .on('finish')
            on(evento, callback) {
                this.callbacks[evento] = callback;
            },
            // Método auxiliar para disparar el evento en el test
            emitirFinalizacion() {
                if (this.callbacks['finish']) {
                    this.callbacks['finish']();
                }
            }
        };
        
        const next = () => {}; // Función next() vacía
        
        return { req, res, next };
    }

    await t.test('Debe extraer la IP correctamente desde x-forwarded-for', async () => {
        const { req, res, next } = crearMocksHTTP();
        req.headers['x-forwarded-for'] = '192.168.1.100, 10.0.0.1'; // Simulamos proxy
        
        auditMiddleware(req, res, next);

        // Usamos una promesa para esperar a que el 'setImmediate' del middleware se ejecute
        await new Promise((resolve) => {
            // Secuestramos la llamada a Prisma
            prisma.auditoriaEvento.create = async ({ data }) => {
                assert.strictEqual(data.ip, '192.168.1.100'); // Debe coger la primera IP
                resolve();
            };
            
            // Disparamos el final de la respuesta
            res.emitirFinalizacion();
        });
    });

    await t.test('Debe registrar la acción de un usuario autenticado', async () => {
        const { req, res, next } = crearMocksHTTP();
        req.method = 'POST';
        req.originalUrl = '/api/embalses';
        res.statusCode = 201;
        
        // Simulamos que el middleware de autenticación ya ha puesto al usuario en 'req'
        req.user = { id: 5, username: 'operador1', rol: 'OPERADOR' };
        req.socket.remoteAddress = '127.0.0.1'; // IP directa
        
        auditMiddleware(req, res, next);

        await new Promise((resolve) => {
            prisma.auditoriaEvento.create = async ({ data }) => {
                assert.strictEqual(data.metodo, 'POST');
                assert.strictEqual(data.endpoint, '/api/embalses');
                assert.strictEqual(data.estadoHttp, 201);
                assert.strictEqual(data.actorId, 5);
                assert.strictEqual(data.actorUsername, 'operador1');
                assert.strictEqual(data.actorRol, 'OPERADOR');
                assert.strictEqual(data.ip, '127.0.0.1');
                
                // Comprobamos que el detalle contiene la estructura JSON esperada
                const detalleParseado = JSON.parse(data.detalle);
                assert.ok('duracionMs' in detalleParseado);
                assert.ok('params' in detalleParseado);
                
                resolve();
            };
            
            res.emitirFinalizacion();
        });
    });

    await t.test('Debe registrar acciones anónimas si no hay usuario en req', async () => {
        const { req, res, next } = crearMocksHTTP();
        // req.user no existe (anónimo)
        
        auditMiddleware(req, res, next);

        await new Promise((resolve) => {
            prisma.auditoriaEvento.create = async ({ data }) => {
                assert.strictEqual(data.actorId, null);
                assert.strictEqual(data.actorUsername, null);
                assert.strictEqual(data.actorRol, null);
                resolve();
            };
            
            res.emitirFinalizacion();
        });
    });
});