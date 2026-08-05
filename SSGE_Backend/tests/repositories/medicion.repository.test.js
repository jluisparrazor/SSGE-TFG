const test = require('node:test');
const assert = require('node:assert');
const { prisma } = require('../../src/lib/prisma');
const MedicionRepository = require('../../src/repositories/medicion.repository');

test('Repositorio de Mediciones', async (t) => {

    const limpiarBD = async () => {
        // ¡SEGURO DE VIDA! Verificación estricta de la base de datos
        if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('ssge_auto_test')) {
            throw new Error('ALERTA CRÍTICA: Intento de borrado fuera de la base de datos de test (ssge_auto_test). Ejecución abortada.');
        }

        await prisma.medicionHistorica.deleteMany();
        await prisma.embalse.deleteMany();
    };
    
    t.before(limpiarBD);
    t.afterEach(limpiarBD);

    t.after(async () => {
        await prisma.$disconnect();
    });

    await t.test('obtenerPrimerEmbalseId - Devuelve null si no hay embalses', async () => {
        const id = await MedicionRepository.obtenerPrimerEmbalseId();
        assert.strictEqual(id, null);
    });

    await t.test('obtenerPrimerEmbalseId - Devuelve el id del primer embalse insertado', async () => {
        const embalseA = await prisma.embalse.create({
            data: { nombre: 'Embalse A', capacidadHm3: 100, activo: true, cotaMaximaM: 150.0 }
        });
        
        await prisma.embalse.create({
            data: { nombre: 'Embalse B', capacidadHm3: 200, activo: true, cotaMaximaM: 160.0 }
        });

        const id = await MedicionRepository.obtenerPrimerEmbalseId();
        assert.strictEqual(id, embalseA.id);
    });

    await t.test('verificarEmbalseExiste - Comprueba correctamente la existencia', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'Embalse C', capacidadHm3: 150, activo: true, cotaMaximaM: 155.5 }
        });

        const existe = await MedicionRepository.verificarEmbalseExiste(embalse.id);
        const noExiste = await MedicionRepository.verificarEmbalseExiste(9999);

        assert.strictEqual(existe, true);
        assert.strictEqual(noExiste, false);
    });

    await t.test('obtenerPorRango - Filtra por fecha y limita resultados', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'Embalse D', capacidadHm3: 100, activo: true, cotaMaximaM: 120.0 }
        });

        const baseTime = new Date('2026-08-04T10:00:00Z').getTime();

        await prisma.medicionHistorica.createMany({
            data: [
                { embalseId: embalse.id, timestamp: new Date(baseTime - 3000), nivel: 10, volumen: 5, caudalEntrada: 0, caudalSalida: 0, precipitacion: 0, temperatura: 0 },
                { embalseId: embalse.id, timestamp: new Date(baseTime - 2000), nivel: 20, volumen: 10, caudalEntrada: 0, caudalSalida: 0, precipitacion: 0, temperatura: 0 },
                { embalseId: embalse.id, timestamp: new Date(baseTime - 1000), nivel: 30, volumen: 15, caudalEntrada: 0, caudalSalida: 0, precipitacion: 0, temperatura: 0 }
            ]
        });

        const limiteFecha = new Date(baseTime - 2500);
        const resultados = await MedicionRepository.obtenerPorRango(embalse.id, limiteFecha, 10);

        assert.strictEqual(resultados.length, 2);
        assert.strictEqual(resultados[0].nivel, 30);
        assert.strictEqual(resultados[1].nivel, 20);
    });

    await t.test('obtenerUltimosDatos - Recupera los ultimos caudales superiores a cero', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'Embalse E', capacidadHm3: 100, activo: true, cotaMaximaM: 180.0 }
        });

        const baseTime = new Date('2026-08-04T10:00:00Z').getTime();

        await prisma.medicionHistorica.create({
            data: { embalseId: embalse.id, timestamp: new Date(baseTime - 3000), nivel: 100, caudalEntrada: 15, caudalSalida: 5, volumen: 50, precipitacion: 0, temperatura: 0 }
        });

        await prisma.medicionHistorica.create({
            data: { embalseId: embalse.id, timestamp: new Date(baseTime - 2000), nivel: 101, caudalEntrada: 0, caudalSalida: 10, volumen: 45, precipitacion: 0, temperatura: 0 }
        });

        await prisma.medicionHistorica.create({
            data: { embalseId: embalse.id, timestamp: new Date(baseTime - 1000), nivel: 102, caudalEntrada: 0, caudalSalida: 0, volumen: 40, precipitacion: 0, temperatura: 0 }
        });

        const ultimosDatos = await MedicionRepository.obtenerUltimosDatos(embalse.id);

        assert.strictEqual(ultimosDatos.estadoPrevio.nivel, 102);
        assert.strictEqual(ultimosDatos.respaldoEntrada, 15);
        assert.strictEqual(ultimosDatos.respaldoSalida, 10);
    });

    await t.test('upsert - Crea el registro si no existe y lo actualiza si ya existe', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'Embalse F', capacidadHm3: 100, activo: true, cotaMaximaM: 140.0 }
        });

        const timestamp = new Date('2026-08-04T12:00:00Z');
        const dataInicial = { nivel: 50, volumen: 20, caudalEntrada: 10, caudalSalida: 5, precipitacion: 0, temperatura: 25 };

        const registroCreado = await MedicionRepository.upsert(embalse.id, timestamp, dataInicial);
        assert.strictEqual(registroCreado.nivel, 50);

        const dataActualizada = { nivel: 55, volumen: 22, caudalEntrada: 12, caudalSalida: 6, precipitacion: 2, temperatura: 24 };
        const registroActualizado = await MedicionRepository.upsert(embalse.id, timestamp, dataActualizada);
        
        assert.strictEqual(registroActualizado.id, registroCreado.id);
        assert.strictEqual(registroActualizado.nivel, 55);

        const totalRegistros = await prisma.medicionHistorica.count({ where: { embalseId: embalse.id } });
        assert.strictEqual(totalRegistros, 1);
    });
});