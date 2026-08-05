const test = require('node:test');
const assert = require('node:assert');
const { prisma } = require('../../src/lib/prisma');

let comandosRegistrados = {};
let mensajesEnviados = [];
let fotosEnviadas = [];

class TelegramBotMock {
    constructor(token, options) {}
    
    setMyCommands() {
        return Promise.resolve();
    }
    
    onText(regex, callback) {
        comandosRegistrados[regex.toString()] = callback;
    }
    
    sendMessage(chatId, texto, opciones) {
        mensajesEnviados.push({ chatId, texto, opciones });
        return Promise.resolve();
    }
    
    sendPhoto(chatId, photo, options) {
        fotosEnviadas.push({ chatId, photo, options });
        return Promise.resolve();
    }
}

const moduloTelegram = require.resolve('node-telegram-bot-api');
require(moduloTelegram);
require.cache[moduloTelegram].exports = { default: TelegramBotMock };

const TelegramService = require('../../src/services/telegram.service');

test('Servicio de Telegram - Cobertura 100% Unificada', async (t) => {
    t.beforeEach(() => {
        comandosRegistrados = {};
        mensajesEnviados = [];
        fotosEnviadas = [];
        process.env.TELEGRAM_BOT_TOKEN = 'TOKEN_TEST';
        TelegramService.iniciar();
    });

    await t.test('Debe desactivarse limpiamente si no hay token en el entorno', () => {
        delete process.env.TELEGRAM_BOT_TOKEN;
        // Al iniciarlo sin token, imprimirá el warn pero no romperá la aplicación
        TelegramService.iniciar();
        assert.ok(true);
    });

    // --- COMANDO /start ---
    await t.test('Comando /start - Envía bienvenida con el nombre del usuario', async () => {
        process.env.TELEGRAM_BOT_TOKEN = 'TOKEN_TEST';
        TelegramService.iniciar();
        const funcionStart = comandosRegistrados['/\\/start/'];
        await funcionStart({ chat: { id: 123 }, from: { first_name: 'José Luis' } });

        assert.strictEqual(mensajesEnviados.length, 1);
        assert.match(mensajesEnviados[0].texto, /¡Hola, \*José Luis\*!/);
    });

    await t.test('Comando /start - Usa fallback "operador" si no hay nombre', async () => {
        const funcionStart = comandosRegistrados['/\\/start/'];
        await funcionStart({ chat: { id: 123 }, from: {} });

        assert.match(mensajesEnviados[0].texto, /¡Hola, \*operador\*!/);
    });

    // --- COMANDO /ayuda ---
    await t.test('Comando /ayuda - Muestra el panel de control', async () => {
        const funcionAyuda = comandosRegistrados['/\\/ayuda/'];
        await funcionAyuda({ chat: { id: 123 } });

        assert.match(mensajesEnviados[0].texto, /Comandos disponibles:/);
    });

    // --- COMANDO /embalses ---
    await t.test('Comando /embalses - Lista los embalses correctamente', async () => {
        prisma.embalse.findMany = async () => [{ nombre: 'Embalse Canales', capacidadHm3: 70.7 }];
        const funcionEmbalses = comandosRegistrados['/\\/embalses/'];
        await funcionEmbalses({ chat: { id: 123 } });

        assert.match(mensajesEnviados[0].texto, /Embalse Canales/);
    });

    await t.test('Comando /embalses - Avisa si la BD esta vacía', async () => {
        prisma.embalse.findMany = async () => [];
        const funcionEmbalses = comandosRegistrados['/\\/embalses/'];
        await funcionEmbalses({ chat: { id: 123 } });

        assert.match(mensajesEnviados[0].texto, /No hay embalses activos/);
    });

    await t.test('Comando /embalses - Maneja errores de base de datos', async () => {
        prisma.embalse.findMany = async () => { throw new Error('Fallo crítico BD'); };
        const funcionEmbalses = comandosRegistrados['/\\/embalses/'];
        await funcionEmbalses({ chat: { id: 123 } });

        assert.match(mensajesEnviados[0].texto, /Error al consultar la lista/);
    });

    // --- COMANDO /estado ---
    await t.test('Comando /estado - Devuelve la info correcta del embalse', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Rules', capacidadHm3: 114 });
        prisma.medicionHistorica.findFirst = async () => ({
            volumen: 45.6, nivel: 160.5, caudalEntrada: 12.3, caudalSalida: 4.1, timestamp: new Date()
        });

        const funcionEstado = comandosRegistrados['/\\/estado (.+)/'];
        await funcionEstado({ chat: { id: 123 } }, [null, 'Rules']);

        assert.match(mensajesEnviados[0].texto, /Estado actual: Rules/);
        assert.match(mensajesEnviados[0].texto, /45.6 hm³/);
    });

    await t.test('Comando /estado - Maneja embalse con capacidad cero o inválida', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Sin Capacidad', capacidadHm3: 0 });
        prisma.medicionHistorica.findFirst = async () => ({
            volumen: 10, nivel: 100, caudalEntrada: 1, caudalSalida: 1, timestamp: new Date()
        });

        const funcionEstado = comandosRegistrados['/\\/estado (.+)/'];
        await funcionEstado({ chat: { id: 123 } }, [null, 'Sin Capacidad']);

        // Añadimos el patrón del Markdown (\*Llenado:\*) para que coincida con la salida real
        assert.match(mensajesEnviados[0].texto, /\*Llenado:\* --%/);
    });

    await t.test('Comando /estado - Maneja embalse no encontrado', async () => {
        prisma.embalse.findFirst = async () => null;
        const funcionEstado = comandosRegistrados['/\\/estado (.+)/'];
        await funcionEstado({ chat: { id: 123 } }, [null, 'Inexistente']);

        assert.match(mensajesEnviados[0].texto, /No he encontrado ningún embalse/);
    });

    await t.test('Comando /estado - Maneja embalse sin mediciones', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Sin Datos', capacidadHm3: 50 });
        prisma.medicionHistorica.findFirst = async () => null;
        const funcionEstado = comandosRegistrados['/\\/estado (.+)/'];
        await funcionEstado({ chat: { id: 123 } }, [null, 'Sin Datos']);

        assert.match(mensajesEnviados[0].texto, /aún no tiene datos registrados/);
    });

    await t.test('Comando /estado - Captura errores de base de datos', async () => {
        prisma.embalse.findFirst = async () => { throw new Error('Fallo red'); };
        const funcionEstado = comandosRegistrados['/\\/estado (.+)/'];
        await funcionEstado({ chat: { id: 123 } }, [null, 'Canales']);

        assert.match(mensajesEnviados[0].texto, /error interno al consultar/);
    });

    // --- COMANDO /calidad ---
    await t.test('Comando /calidad - Muestra los sensores simulados', async () => {
        prisma.embalse.findFirst = async () => ({
            nombre: 'Canales',
            sensores: [
                { tipo: 'Oxígeno' }, { tipo: 'Temperatura' }, { tipo: 'Turbidez' }, { tipo: 'Extra', nombre: 'P2' }
            ]
        });

        const funcionCalidad = comandosRegistrados['/\\/calidad (.+)/'];
        await funcionCalidad({ chat: { id: 123 } }, [null, 'Canales']);

        assert.match(mensajesEnviados[0].texto, /8.2 mg\/L/);
        assert.match(mensajesEnviados[0].texto, /21.5 °C/);
    });

    await t.test('Comando /calidad - Maneja embalse no encontrado', async () => {
        prisma.embalse.findFirst = async () => null;
        const funcionCalidad = comandosRegistrados['/\\/calidad (.+)/'];
        await funcionCalidad({ chat: { id: 123 } }, [null, 'Falso']);

        assert.match(mensajesEnviados[0].texto, /No he encontrado ningún embalse/);
    });

    await t.test('Comando /calidad - Maneja embalse sin sensores', async () => {
        prisma.embalse.findFirst = async () => ({ nombre: 'Vacío', sensores: [] });
        const funcionCalidad = comandosRegistrados['/\\/calidad (.+)/'];
        await funcionCalidad({ chat: { id: 123 } }, [null, 'Vacío']);

        assert.match(mensajesEnviados[0].texto, /no tiene sensores de calidad configurados/);
    });

    await t.test('Comando /calidad - Captura errores de base de datos', async () => {
        prisma.embalse.findFirst = async () => { throw new Error('Error BD'); };
        const funcionCalidad = comandosRegistrados['/\\/calidad (.+)/'];
        await funcionCalidad({ chat: { id: 123 } }, [null, 'Canales']);

        assert.match(mensajesEnviados[0].texto, /Error al consultar los sensores/);
    });

    // --- COMANDO /grafica ---
    await t.test('Comando /grafica - Genera y envía la gráfica', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales' });
        prisma.medicionHistorica.findMany = async () => [{ timestamp: new Date(), volumen: 45.2 }];

        const funcionGrafica = comandosRegistrados['/\\/grafica (.+)/'];
        await funcionGrafica({ chat: { id: 123 } }, [null, 'Canales']);

        assert.strictEqual(fotosEnviadas.length, 1);
        assert.match(fotosEnviadas[0].photo, /quickchart\.io\/chart/);
    });

    await t.test('Comando /grafica - Maneja embalse no encontrado', async () => {
        prisma.embalse.findFirst = async () => null;
        const funcionGrafica = comandosRegistrados['/\\/grafica (.+)/'];
        await funcionGrafica({ chat: { id: 123 } }, [null, 'Inexistente']);

        assert.match(mensajesEnviados[0].texto, /No he encontrado ningún embalse activo/);
    });

    await t.test('Comando /grafica - Maneja ausencia de registros en 24h', async () => {
        prisma.embalse.findFirst = async () => ({ id: 1, nombre: 'Canales' });
        prisma.medicionHistorica.findMany = async () => [];

        const funcionGrafica = comandosRegistrados['/\\/grafica (.+)/'];
        await funcionGrafica({ chat: { id: 123 } }, [null, 'Canales']);

        assert.match(mensajesEnviados[0].texto, /No hay registros de las últimas 24 horas/);
    });

    await t.test('Comando /grafica - Captura errores de base de datos', async () => {
        prisma.embalse.findFirst = async () => { throw new Error('Error Gráfica'); };
        const funcionGrafica = comandosRegistrados['/\\/grafica (.+)/'];
        await funcionGrafica({ chat: { id: 123 } }, [null, 'Canales']);

        assert.match(mensajesEnviados[0].texto, /Error al generar la gráfica/);
    });
});