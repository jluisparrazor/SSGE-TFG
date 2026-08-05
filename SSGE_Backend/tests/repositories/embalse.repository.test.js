const test = require('node:test');
const assert = require('node:assert');
const { prisma } = require('../../src/lib/prisma');
const EmbalseRepository = require('../../src/repositories/embalse.repository');

test('Repositorio de Embalses', async (t) => {
    
    const limpiarBD = async () => {
        // ¡SEGURO DE VIDA! Verificación estricta de la base de datos
        if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('ssge_auto_test')) {
            throw new Error('🛑 ALERTA CRÍTICA: Intento de borrado fuera de la base de datos de test (ssge_auto_test). Ejecución abortada.');
        }

        await prisma.embalseSenal.deleteMany();
        await prisma.senal.deleteMany();
        await prisma.sensor.deleteMany();
        await prisma.compuerta.deleteMany();
        await prisma.embalse.deleteMany();
    };

    t.before(limpiarBD);
    t.afterEach(limpiarBD);

    t.after(async () => {
        await prisma.$disconnect();
    });

    await t.test('guardar - Crea un embalse con todas sus relaciones usando una transaccion', async () => {
        const payload = {
            nombre: 'Embalse Test Guardar',
            capacidadHm3: 120.5,
            cotaMaximaM: 180.0,
            cotaMinimaM: 10.0,
            sensores: [{ tipo: 'NIVEL', valorActual: 915.5 }],
            compuertas: [{ nombre: 'Aliviadero Central', estadoAperturaPorcentaje: 0.0, caudalSalidaActual: 0.0 }],
            senalesAsignadas: [{ codigo: 'SEN-001', nombre: 'Señal Principal' }]
        };

        const resultado = await EmbalseRepository.guardar(payload);

        assert.ok(resultado.id);
        assert.strictEqual(resultado.nombre, 'Embalse Test Guardar');
        assert.strictEqual(resultado.sensores.length, 1);
        assert.strictEqual(resultado.compuertas.length, 1);
        assert.strictEqual(resultado.senalesAsignadas.length, 1);
        assert.strictEqual(resultado.senalesAsignadas[0].senal.codigo, 'SEN-001');
    });

    await t.test('actualizar - Modifica el embalse y recrea sus relaciones', async () => {
        const embalseBase = await prisma.embalse.create({
            data: { nombre: 'Base', capacidadHm3: 100, cotaMaximaM: 150 }
        });

        const payloadActualizacion = {
            nombre: 'Embalse Actualizado',
            capacidadHm3: 200,
            cotaMaximaM: 160,
            sensores: [{ tipo: 'CAUDAL', valorActual: 15.2 }],
            compuertas: [],
            senalesAsignadas: []
        };

        const resultado = await EmbalseRepository.actualizar(embalseBase.id, payloadActualizacion);

        assert.strictEqual(resultado.id, embalseBase.id);
        assert.strictEqual(resultado.nombre, 'Embalse Actualizado');
        assert.strictEqual(resultado.capacidadHm3, 200);

        assert.strictEqual(resultado.sensores.length, 1);
        assert.strictEqual(resultado.sensores[0].tipo, 'CAUDAL');
        assert.strictEqual(resultado.compuertas.length, 0);
    });

    // NUEVO: Cobertura del bucle de señales durante la actualización
    await t.test('actualizar - Actualiza las señales asignadas y descarta las que no tienen código', async () => {
        const embalseBase = await prisma.embalse.create({
            data: { nombre: 'Base Señales', capacidadHm3: 100, cotaMaximaM: 150, cotaMinimaM: 10 } // <- Cotas añadidas
        });

        const payloadActualizacion = {
            nombre: 'Base Señales', 
            capacidadHm3: 100,
            sensores: [], 
            compuertas: [],
            senalesAsignadas: [
                { codigo: 'SEN-UP-01', nombre: 'Señal Actualizada 1' },
                { codigo: '' }, 
            ]
        };

        const resultado = await EmbalseRepository.actualizar(embalseBase.id, payloadActualizacion);
        assert.strictEqual(resultado.senalesAsignadas.length, 1);
        assert.strictEqual(resultado.senalesAsignadas[0].senal.codigo, 'SEN-UP-01');
    });

    await t.test('actualizar - Lanza error si el embalse no existe', async () => {
        try {
            await EmbalseRepository.actualizar(9999, { nombre: 'Fallo' });
            assert.fail('Debería haber lanzado un error');
        } catch (error) {
            assert.strictEqual(error.message, 'El embalse no existe');
        }
    });

    await t.test('obtenerTodos - Recupera solo los embalses no eliminados', async () => {
        await prisma.embalse.create({
            data: { nombre: 'Activo', capacidadHm3: 10, cotaMaximaM: 20, eliminado: false }
        });
        
        await prisma.embalse.create({
            data: { nombre: 'Borrado', capacidadHm3: 10, cotaMaximaM: 20, eliminado: true }
        });

        const resultados = await EmbalseRepository.obtenerTodos();

        assert.strictEqual(resultados.length, 1);
        assert.strictEqual(resultados[0].nombre, 'Activo');
    });

    await t.test('obtenerPorId - Devuelve null si el embalse está eliminado lógicamente', async () => {
        const embalseBorrado = await prisma.embalse.create({
            data: { nombre: 'Borrado', capacidadHm3: 10, cotaMaximaM: 20, eliminado: true }
        });

        const resultado = await EmbalseRepository.obtenerPorId(embalseBorrado.id);
        
        assert.strictEqual(resultado, null);
    });

    await t.test('cambiarEstado - Modifica correctamente la bandera activo', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'EstadoTest', capacidadHm3: 10, cotaMaximaM: 20, activo: false }
        });

        const resultado = await EmbalseRepository.cambiarEstado(embalse.id, true);
        
        assert.strictEqual(resultado.activo, true);
    });

    // NUEVO: Cobertura de errores al cambiar de estado
    await t.test('cambiarEstado - Lanza error si el embalse no existe o está eliminado', async () => {
        try {
            await EmbalseRepository.cambiarEstado(9999, true);
            assert.fail('Debería haber lanzado un error');
        } catch (error) {
            assert.strictEqual(error.message, 'Embalse no encontrado o eliminado');
        }

        const embalseBorrado = await prisma.embalse.create({
            data: { nombre: 'Borrado', capacidadHm3: 10, cotaMaximaM: 150, cotaMinimaM: 10, eliminado: true } // <- Cotas añadidas
        });

        try {
            await EmbalseRepository.cambiarEstado(embalseBorrado.id, true);
            assert.fail('Debería haber lanzado un error');
        } catch (error) {
            assert.strictEqual(error.message, 'Embalse no encontrado o eliminado');
        }
    });

    await t.test('eliminarLogico - Marca el registro como eliminado sin borrarlo de la tabla', async () => {
        const embalse = await prisma.embalse.create({
            data: { nombre: 'A Borrar', capacidadHm3: 10, cotaMaximaM: 20, eliminado: false }
        });

        const resultado = await EmbalseRepository.eliminarLogico(embalse.id);
        
        assert.strictEqual(resultado.eliminado, true);

        const filaEnBd = await prisma.embalse.findUnique({ where: { id: embalse.id } });
        assert.strictEqual(filaEnBd.eliminado, true);
    });

    // NUEVO: Cobertura de errores al eliminar lógicamente
    await t.test('eliminarLogico - Lanza error si el embalse no existe o ya está eliminado', async () => {
        try {
            await EmbalseRepository.eliminarLogico(9999);
            assert.fail('Debería haber lanzado un error');
        } catch (error) {
            assert.strictEqual(error.message, 'Embalse no encontrado');
        }

        const embalseBorrado = await prisma.embalse.create({
            data: { nombre: 'Ya Borrado', capacidadHm3: 10, cotaMaximaM: 150, cotaMinimaM: 10, eliminado: true } // <- Cotas añadidas
        });

        try {
            await EmbalseRepository.eliminarLogico(embalseBorrado.id);
            assert.fail('Debería haber lanzado un error');
        } catch (error) {
            assert.strictEqual(error.message, 'El embalse ya ha sido eliminado');
        }
    });
});