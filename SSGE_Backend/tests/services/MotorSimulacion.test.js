const test = require('node:test');
const assert = require('node:assert');
const MotorSimulacion = require('../../src/services/MotorSimulacion');

test('Motor de Simulación - Lógica Difusa y Escenarios', async (t) => {

    await t.test('simularEscenarioManual - Lanza error si el embalse no tiene capacidad válida', () => {
        const embalseInvalido = { capacidadHm3: 0 };
        const estadoInicial = { volumenHm3: 10 };
        const escenario = { duracionMin: 60, caudalEntradaM3s: 5 };

        assert.throws(() => {
            MotorSimulacion.simularEscenarioManual({ embalse: embalseInvalido, estadoInicial, escenario });
        }, /capacidad configurada válida/);
    });

    await t.test('simularEscenarioManual - Lanza error si duracionMin es invalido (Línea 206)', () => {
        const embalseMock = { id: 1, capacidadHm3: 100.0 };
        const estadoInicial = { volumenHm3: 50 };
        const escenario = { duracionMin: -10, caudalEntradaM3s: 10 }; 

        assert.throws(() => {
            MotorSimulacion.simularEscenarioManual({ embalse: embalseMock, estadoInicial, escenario });
        }, /duracionMin debe ser un número positivo/);
    });

    await t.test('simularEscenarioManual - Lanza error si caudalEntradaM3s es invalido (Línea 208)', () => {
        const embalseMock = { id: 1, capacidadHm3: 100.0 };
        const estadoInicial = { volumenHm3: 50 };
        const escenario = { duracionMin: 60, caudalEntradaM3s: -5 }; 

        assert.throws(() => {
            MotorSimulacion.simularEscenarioManual({ embalse: embalseMock, estadoInicial, escenario });
        }, /caudalEntradaM3s debe ser un número mayor o igual a 0/);
    });

    await t.test('calcularEstadoInicialHm3 - Lanza error si no hay volumen ni nivel (Líneas 332-333)', () => {
        const embalseMock = { id: 1, capacidadHm3: 100.0 };
        const estadoInicial = {}; // Estado inicial vacío
        const escenario = { duracionMin: 60, caudalEntradaM3s: 10 };

        assert.throws(() => {
            MotorSimulacion.simularEscenarioManual({ embalse: embalseMock, estadoInicial, escenario });
        }, /estadoInicial.volumenHm3 o estadoInicial.nivelPorcentaje es obligatorio/);
    });

    await t.test('simularEscenarioManual - Ejecuta correctamente una proyección básica', () => {
        const embalseMock = {
            id: 1,
            nombre: 'Embalse Test',
            capacidadHm3: 100.0,
            cotaMaximaM: 150.0,
            cotaMinimaM: 10.0,
            demandaUrbanaMensual: 4.72,
            demandaAgrariaMensual: [2,2,2,2,2,2,2,2,2,2,2,2],
            caudalEcologicoMensual: [0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1,0.1],
            evaporacionMensual: [10,10,10,10,10,10,10,10,10,10,10,10],
            umbralesSequiaAgraria: [15, 43, 65],
            curvaSuperficie: [{ vol: 0, sup: 1 }, { vol: 100, sup: 200 }]
        };

        const estadoInicial = { volumenHm3: 50.0 };
        const escenario = { pasoMin: 60, duracionMin: 120, mes: 6, caudalEntradaM3s: 10 };

        const resultado = MotorSimulacion.simularEscenarioManual({
            embalse: embalseMock,
            estadoInicial,
            escenario
        });

        assert.strictEqual(resultado.tipo, 'manual');
        assert.strictEqual(resultado.embalse.nombre, 'Embalse Test');
        assert.ok(resultado.proyeccion.length > 0);
        assert.ok(resultado.metricas);
        assert.ok(['Normal', 'Precaucion', 'Alerta', 'Emergencia'].includes(resultado.metricas.alertaMaxima));
    });

    await t.test('simularEscenarioHistorico - Lanza error si la serie histórica está vacía', () => {
        const embalseMock = { id: 1, capacidadHm3: 100.0 };
        const serieHistorica = [];
        const escenario = { pasoMin: 60 };

        assert.throws(() => {
            MotorSimulacion.simularEscenarioHistorico({ embalse: embalseMock, serieHistorica, escenario });
        }, /serie histórica está vacía/);
    });

    await t.test('simularEscenarioHistorico - Procesa una serie histórica corta correctamente', () => {
        const embalseMock = {
            id: 1,
            nombre: 'Embalse Histórico',
            capacidadHm3: 100.0,
            cotaMaximaM: 150.0,
            cotaMinimaM: 10.0,
        };

        const serieHistorica = [
            { timestamp: '2026-08-01T00:00:00Z', caudalEntrada: 15, caudalSalida: 5, volumen: 50 },
            { timestamp: '2026-08-01T01:00:00Z', caudalEntrada: 12, caudalSalida: 4, volumen: 51 }
        ];

        const resultado = MotorSimulacion.simularEscenarioHistorico({
            embalse: embalseMock,
            serieHistorica,
            escenario: { pasoMin: 60 }
        });

        assert.strictEqual(resultado.tipo, 'historico');
        assert.strictEqual(resultado.proyeccion.length, 2);
        assert.ok(resultado.metricas.volumenTotalDesembalsadoHm3 >= 0);
    });

    await t.test('simularEscenarioHistorico - Usa fallback y calcula pct con volumen > 100 (Líneas 320 y 406)', () => {
        const embalseMock = {
            id: 1,
            nombre: 'Embalse Complejo',
            capacidadHm3: 200.0, // Capacidad mayor a 100 para probar el bloque else
            cotaMaximaM: 150.0,
            cotaMinimaM: 10.0,
        };

        // El primer registro no tiene volumen (fuerza línea 320 fallback).
        // El segundo tiene volumen > 100 (fuerza línea 406 calculo de porcentaje basado en capacidad).
        const serieHistorica = [
            { timestamp: '2026-08-01T00:00:00Z', caudalEntrada: 15, caudalSalida: 5 }, 
            { timestamp: '2026-08-01T01:00:00Z', caudalEntrada: 12, caudalSalida: 4, volumen: 150.0 } 
        ];

        const estadoInicial = { nivelPorcentaje: 50 }; // 50% de 200Hm3 = 100Hm3 iniciales

        const resultado = MotorSimulacion.simularEscenarioHistorico({
            embalse: embalseMock,
            estadoInicial,
            serieHistorica,
            escenario: { pasoMin: 60 }
        });

        // 150hm3 respecto a 200hm3 de capacidad total = 75%
        assert.strictEqual(resultado.proyeccion[1].nivelRealPorcentaje, 75);
    });

    await t.test('simularEscenarioManual - Branches: Fallbacks por arrays vacíos o inválidos y nivelPorcentaje', () => {
        const embalseMock = {
            id: 1,
            nombre: 'Embalse Fallbacks',
            capacidadHm3: 100.0,
            cotaMaximaM: 150.0,
            cotaMinimaM: 10.0,
            // Pasamos arrays vacíos o de longitud incorrecta para forzar los fallbacks defensivos
            demandaAgrariaMensual: [], 
            caudalEcologicoMensual: [0.1], // Longitud != 12
            evaporacionMensual: [], // Longitud != 12
            umbralesSequiaAgraria: [15, 43], // Longitud != 3
            curvaSuperficie: [] // Array vacío
        };

        // Usamos nivelPorcentaje en vez de volumenHm3 para forzar la rama en calcularEstadoInicialHm3
        const estadoInicial = { nivelPorcentaje: 50 }; 
        const escenario = { pasoMin: 60, duracionMin: 60, mes: 6, caudalEntradaM3s: 10 };

        const resultado = MotorSimulacion.simularEscenarioManual({
            embalse: embalseMock,
            estadoInicial,
            escenario
        });

        assert.strictEqual(resultado.tipo, 'manual');
        // Aseguramos que la simulación ha logrado completarse sin estallar por culpa de los arrays rotos
        assert.strictEqual(resultado.proyeccion[0].desembalseSeguridadHm3 >= 0, true);
    });

    await t.test('simularEscenarioHistorico - Branches: Denominador 0, valores BD nulos y volumen excedido', () => {
        const embalseMock = {
            id: 1,
            capacidadHm3: 100.0,
        };

        const serieHistorica = [
            // 1. Volumen inicial muy superior a la capacidad (200 > 100)
            // Esto provoca que nivelPorcentaje > 100, haciendo que todas las reglas difusas (w1 a w7) sean 0.
            // Forzamos así el 'if (denominador === 0) return 0.3;'.
            // También omitimos caudalSalida (null) para cubrir ramas condicionales.
            { timestamp: '2026-08-01T00:00:00Z', caudalEntrada: 10, caudalSalida: null, volumen: 200 },
            
            // 2. Valores corruptos/texto para forzar el isNaN y los fallbacks a null.
            { timestamp: '2026-08-01T01:00:00Z', caudalEntrada: 5, caudalSalida: undefined, volumen: 'Invalido' }
        ];

        const resultado = MotorSimulacion.simularEscenarioHistorico({
            embalse: embalseMock,
            estadoInicial: { volumenHm3: 50 }, // Se ignorará porque serieHistorica[0] tiene volumen
            serieHistorica,
            escenario: { pasoMin: 60 }
        });

        assert.strictEqual(resultado.tipo, 'historico');
        // El primer paso debe haber disparado el desembalse de seguridad de fallback (0.3)
        assert.strictEqual(resultado.proyeccion[0].desembalseSeguridadM3s, 0.3);
        
        // El segundo paso debe haber gestionado la data corrupta asignando 'null' en lugar de NaN
        assert.strictEqual(resultado.proyeccion[1].caudalSalidaRealM3s, null);
        assert.strictEqual(resultado.proyeccion[1].volumenRealHm3, null);
    });

    await t.test('simularEscenarioHistorico - Lanza error si el embalse no tiene capacidad válida', () => {
        // Le pasamos capacidad 0 o un embalse nulo para forzar el throw en el modo histórico
        const embalseInvalido = { capacidadHm3: 0 }; 
        const serieHistorica = [{ timestamp: '2026-08-01T00:00:00Z', caudalEntrada: 10, volumen: 50 }];
        const escenario = { pasoMin: 60 };

        assert.throws(() => {
            MotorSimulacion.simularEscenarioHistorico({ 
                embalse: embalseInvalido, 
                serieHistorica, 
                escenario 
            });
        }, /capacidad configurada válida/);
    });
});