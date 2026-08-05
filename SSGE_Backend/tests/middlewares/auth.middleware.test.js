const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { requireAuth, requireRole, requireIngestaApiKey } = require('../../src/middlewares/auth.middleware');

test('Middleware de Autenticación (auth.middleware.js)', async (t) => {
    
    // Simulamos los objetos de Express (req, res, next)
    const mockResponse = () => {
        const res = {};
        res.status = (code) => {
            res.statusCode = code;
            return res;
        };
        res.json = (data) => {
            res.body = data;
            return res;
        };
        return res;
    };

    t.beforeEach(() => {
        // Forzamos las variables de entorno para que el test sea predecible
        process.env.JWT_SECRET = 'secreto_super_seguro_test';
        process.env.INGESTA_API_KEY = 'apikey_sensores_123';
    });

    // --- TESTS PARA requireAuth ---
    
    await t.test('requireAuth - Falla (401) si no hay cabecera de autorización', () => {
        const req = { headers: {} };
        const res = mockResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAuth(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'Token requerido');
        assert.strictEqual(nextCalled, false);
    });

    await t.test('requireAuth - Falla (401) si el esquema no es Bearer', () => {
        const req = { headers: { authorization: 'Basic 123456789' } };
        const res = mockResponse();
        const next = () => {};

        requireAuth(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'Token requerido');
    });

    await t.test('requireAuth - Falla (401) si el token es inventado o ha caducado', () => {
        const req = { headers: { authorization: 'Bearer token_invalido_totalmente' } };
        const res = mockResponse();
        const next = () => {};

        requireAuth(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'Token inválido o expirado');
    });

    await t.test('requireAuth - Permite el paso e inyecta req.user con un token válido', () => {
        // Generamos un token real usando la misma librería y clave secreta
        const tokenValido = jwt.sign(
            { sub: 99, username: 'jluis_admin', rol: 'ADMIN' }, 
            process.env.JWT_SECRET
        );
        
        const req = { headers: { authorization: `Bearer ${tokenValido}` } };
        const res = mockResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAuth(req, res, next);

        assert.strictEqual(nextCalled, true);
        assert.ok(req.user);
        assert.strictEqual(req.user.id, 99);
        assert.strictEqual(req.user.username, 'jluis_admin');
        assert.strictEqual(req.user.rol, 'ADMIN');
    });

    // --- TESTS PARA requireRole ---

    await t.test('requireRole - Falla (401) si el usuario no ha pasado antes por requireAuth', () => {
        const req = {}; // No hay req.user
        const res = mockResponse();
        const next = () => {};

        const middleware = requireRole('ADMIN');
        middleware(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'No autenticado');
    });

    await t.test('requireRole - Falla (403) si el usuario tiene un rol inferior al requerido', () => {
        const req = { user: { rol: 'VISUALIZADOR' } };
        const res = mockResponse();
        const next = () => {};

        // Exigimos que sea ADMIN u OPERADOR
        const middleware = requireRole('ADMIN', 'OPERADOR');
        middleware(req, res, next);

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.error, 'No autorizado');
    });

    await t.test('requireRole - Pasa correctamente si el usuario tiene el rol exigido', () => {
        const req = { user: { rol: 'OPERADOR' } };
        const res = mockResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        const middleware = requireRole('ADMIN', 'OPERADOR');
        middleware(req, res, next);

        assert.strictEqual(nextCalled, true);
    });

    // --- TESTS PARA requireIngestaApiKey ---

    await t.test('requireIngestaApiKey - Falla (401) si no se envía la cabecera x-api-key', () => {
        const req = { headers: {} };
        const res = mockResponse();
        const next = () => {};

        requireIngestaApiKey(req, res, next);

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.error, 'API key de ingesta invalida');
    });

    await t.test('requireIngestaApiKey - Falla (401) si la API key es incorrecta', () => {
        const req = { headers: { 'x-api-key': 'clave_aleatoria_incorrecta' } };
        const res = mockResponse();
        const next = () => {};

        requireIngestaApiKey(req, res, next);

        assert.strictEqual(res.statusCode, 401);
    });

    await t.test('requireIngestaApiKey - Pasa correctamente e inyecta el rol INGESTA', () => {
        const req = { headers: { 'x-api-key': 'apikey_sensores_123' } };
        const res = mockResponse();
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireIngestaApiKey(req, res, next);

        assert.strictEqual(nextCalled, true);
        assert.ok(req.user);
        assert.strictEqual(req.user.rol, 'INGESTA');
        assert.strictEqual(req.user.username, 'ingesta');
    });
});