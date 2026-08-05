const { io } = require('socket.io-client');
const { obtenerDatosEstacion } = require('./saih_sdk.js');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
// 1. Conexión al Nodo Central
const socket = io(BACKEND_URL);

socket.on('connect', async () => {
    console.log(`[Simulador] Conectado al Nodo Central. ID: ${socket.id}`);
    console.log('[Simulador] Iniciando extracción de datos del SAIH...');

    // 2. Ejecutar el scraper (Ajusta las fechas según necesites)
    const historial = await obtenerDatosEstacion('E41_CANALES', '16/03/2026', '19/03/2026');

    if (!historial || historial.length === 0) {
        console.error('[Simulador] Error: No hay datos para simular.');
        process.exit(1);
    }

    // Ordenar cronológicamente (de más antiguo a más reciente)
    historial.reverse();
    console.log(`[Simulador] Extracción finalizada. ${historial.length} registros obtenidos.`);
    console.log('[Simulador] Comenzando inyección de datos (1 lectura / 2 seg)...');

    // 3. Bucle de emisión (Streaming)
    let indice = 0;
    const intervalo = setInterval(() => {
        if (indice >= historial.length) {
            console.log('[Simulador] Simulación completada.');
            clearInterval(intervalo);
            socket.disconnect();
            return;
        }

        const payload = {
            origen: 'SAIH_CHG',
            embalse: 'Embalse de Canales',
            embalseId: 1,
            timestamp: historial[indice]['Fecha y Hora'],
            mediciones: historial[indice]
        };

        // Enviar por WebSockets
        socket.emit('medicion_scrapper', payload);
        console.log(`[>>] Emitido: Registro ${indice + 1}/${historial.length} - ${payload.timestamp}`);

        indice++;
    }, 2000); 
});

socket.on('connect_error', (err) => {
    console.error('[Simulador] Fallo de conexión con backend:', err.message);
});