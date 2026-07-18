const { io } = require('socket.io-client');
const { obtenerDatosEstacion } = require('./saih_sdk.js');

const socket = io('http://localhost:3000');

const formatearFecha = (fecha) => {
    return `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
};

const iniciarPoblacion = async () => {
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 2); // Pillamos los últimos 2 días para tener buena gráfica

    const strHoy = formatearFecha(hoy);
    const strAyer = formatearFecha(ayer);

    console.log(`[Poblador] Solicitando histórico a la CHG desde ${strAyer} hasta ${strHoy}...`);

    try {
        const datos = await obtenerDatosEstacion('E41_CANALES', strAyer, strHoy);

        if (datos && datos.length > 0) {
            // 1. Filtramos las filas que están completamente vacías (las del futuro)
            const datosValidos = datos.filter(fila => fila['NIVEL EMBALSE (m.s.n.m)'] && fila['NIVEL EMBALSE (m.s.n.m)'].trim() !== "");

            // 2. La web los da de más nuevo a más viejo. Los invertimos para insertarlos cronológicamente
            datosValidos.reverse();

            console.log(`[Poblador] ✅ Se encontraron ${datosValidos.length} registros válidos. Inyectando...`);

            // 3. Los enviamos al backend con una pequeña pausa de 200ms entre cada uno
            // Esto asegura que el backend tenga tiempo de guardarlos en orden y aplicar el LOCF correctamente
            for (let i = 0; i < datosValidos.length; i++) {
                const fila = datosValidos[i];
                const payload = {
                    origen: 'SAIH_CHG_POBLADOR',
                    embalse: 'Embalse de Canales',
                    timestamp: fila['Fecha y Hora'],
                    mediciones: fila
                };

                socket.emit('medicion_scrapper', payload);
                console.log(`[>>] Emitido histórico: ${payload.timestamp}`);
                
                // Pausa de 200ms
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            console.log(`\n[Poblador] 🎉 Histórico inyectado con éxito. Ya puedes cerrar este script (Ctrl+C).`);
            setTimeout(() => process.exit(0), 1000);

        } else {
            console.log('[Poblador] No se obtuvieron datos de la CHG.');
            process.exit(1);
        }
    } catch (error) {
        console.error('[Poblador] Error:', error.message);
        process.exit(1);
    }
};

socket.on('connect', () => {
    console.log(`[Poblador] Conectado al Nodo Central.`);
    iniciarPoblacion();
});