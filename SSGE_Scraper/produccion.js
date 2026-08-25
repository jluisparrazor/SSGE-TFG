const dotenv = require('dotenv');
const cron = require('node-cron');
const { io } = require('socket.io-client');
const { obtenerDatosEstacion } = require('./saih_sdk.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

const rutasEnv = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '../SSGE_Backend/.env'),
    path.join(__dirname, '../.env'),
];

for (const rutaEnv of rutasEnv) {
    if (fs.existsSync(rutaEnv)) {
        dotenv.config({ path: rutaEnv, override: false });
    }
}

const INGESTA_API_KEY = process.env.INGESTA_API_KEY || '';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || INGESTA_API_KEY;
const PORT = Number(process.env.PORT) || 3001;
const TIMEOUT_INGESTA_MS = 15000;

if (!INGESTA_API_KEY) {
    console.error('[Producción] INGESTA_API_KEY no definida. Crea SSGE_Scraper/.env o usa SSGE_Backend/.env con esta clave.');
    process.exit(1);
}

if (!SCRAPER_API_KEY) {
    console.error('[Producción] SCRAPER_API_KEY no definida. Se requiere para la API /historico.');
    process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ ok: true, servicio: 'ssge-scraper' });
});

app.post('/historico', async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== SCRAPER_API_KEY) {
        return res.status(401).json({ error: 'API key invalida' });
    }

    const estacionCodigo = typeof req.body?.estacionCodigo === 'string' ? req.body.estacionCodigo.trim() : '';
    const desde = typeof req.body?.desde === 'string' ? req.body.desde.trim() : '';
    const hasta = typeof req.body?.hasta === 'string' ? req.body.hasta.trim() : '';

    if (!estacionCodigo || !desde || !hasta) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios: estacionCodigo, desde, hasta' });
    }

    try {
        const datos = await obtenerDatosEstacion(estacionCodigo, desde, hasta);
        return res.json({ ok: true, datos: Array.isArray(datos) ? datos : [] });
    } catch (error) {
        console.error('[API /historico] Error:', error.message || error);
        return res.status(500).json({ error: 'Error consultando datos historicos en CHG' });
    }
});

// Conexión al Nodo Central
const socket = io(BACKEND_URL, {
    auth: {
        apiKey: INGESTA_API_KEY,
    },
});

// Genera la fecha en formato DD/MM/YYYY para el formulario web de la CHG
const formatearFechaCHG = (fecha) => {
    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const anio = fecha.getFullYear();
    return `${dia}/${mes}/${anio}`;
};

const obtenerFechaHoy = () => formatearFechaCHG(new Date());

const obtenerFechaAyer = () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    return formatearFechaCHG(ayer);
};

const inferirEstacionPorSenales = (embalse) => {
    try {
        const rutaDiccionario = path.join(__dirname, 'data', 'diccionario_saih.json');
        if (!fs.existsSync(rutaDiccionario)) return null;

        const diccionario = JSON.parse(fs.readFileSync(rutaDiccionario, 'utf8'));
        const codigosEmbalse = (embalse?.senalesAsignadas || [])
            .map((rel) => String(rel?.senal?.codigo || '').split(',')[0])
            .filter(Boolean);

        if (codigosEmbalse.length === 0) return null;

        let mejorEstacion = null;
        let mejorPuntuacion = 0;

        for (const [estacion, info] of Object.entries(diccionario)) {
            const setCodigos = new Set((info?.sensores || []).map((s) => String(s?.id_sensor || '').split(',')[0]));
            let aciertos = 0;
            for (const codigo of codigosEmbalse) {
                if (setCodigos.has(codigo)) aciertos++;
            }
            if (aciertos > mejorPuntuacion) {
                mejorPuntuacion = aciertos;
                mejorEstacion = estacion;
            }
        }

        return mejorPuntuacion > 0 ? mejorEstacion : null;
    } catch (_error) {
        return null;
    }
};

const obtenerConfiguracionesEmbalses = async () => {
    try {
        const res = await fetch(`${BACKEND_URL}/api/ingesta/embalses-config`, {
            headers: {
                'x-api-key': INGESTA_API_KEY,
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const embalses = await res.json();
        if (!Array.isArray(embalses) || embalses.length === 0) return [];

        const candidatos = embalses.filter((e) => e.saihEstacionCodigo || (e.senalesAsignadas && e.senalesAsignadas.length > 0));

        const configurados = [];
        for (const embalse of candidatos) {
            const codigo = embalse.saihEstacionCodigo || inferirEstacionPorSenales(embalse);
            if (!codigo) continue;

            configurados.push({
                id: embalse.id,
                nombre: embalse.nombre,
                saihEstacionCodigo: codigo
            });
        }

        return configurados;
    } catch (error) {
        console.error('[Cron] No se pudo obtener configuración de embalses:', error.message);
        return [];
    }
};

// Convierte "DD/MM/YY-HH:mm" a timestamp numérico para ordenar correctamente
const parseTimestampSAIH = (timestamp) => {
    if (!timestamp || typeof timestamp !== 'string') return 0;

    const [fecha, hora] = timestamp.split('-');
    if (!fecha || !hora) return 0;

    const [dia, mes, anioCorto] = fecha.split('/');
    const [hh, mm] = hora.split(':');
    if (!dia || !mes || !anioCorto || !hh || !mm) return 0;

    const anio = Number(`20${anioCorto}`);
    const fechaNormalizada = new Date(anio, Number(mes) - 1, Number(dia), Number(hh), Number(mm), 0, 0);
    return Number.isNaN(fechaNormalizada.getTime()) ? 0 : fechaNormalizada.getTime();
};

const extraerUltimasFilasValidas = (datos, cantidad = 4) => {
    const filasValidas = (datos || []).filter((fila) => {
        return fila['NIVEL EMBALSE (m.s.n.m)'] &&
            fila['NIVEL EMBALSE (m.s.n.m)'].trim() !== "" &&
            fila['Fecha y Hora'];
    });

    return filasValidas
        .sort((a, b) => parseTimestampSAIH(b['Fecha y Hora']) - parseTimestampSAIH(a['Fecha y Hora']))
        .slice(0, cantidad)
        .reverse();
};

const guardarMedicion = (payload) => new Promise((resolve, reject) => {
    socket.timeout(TIMEOUT_INGESTA_MS).emit('medicion_scrapper', payload, (error, respuesta) => {
        if (error) {
            reject(new Error(`Sin confirmación del backend tras ${TIMEOUT_INGESTA_MS / 1000}s`));
            return;
        }
        if (!respuesta?.ok) {
            reject(new Error(respuesta?.error || 'El backend rechazó la medición'));
            return;
        }
        resolve(respuesta);
    });
});

let lecturaEnCurso = false;
// Tiempo máximo de una ejecución: 10 min
const MAX_DURACION_LECTURA_MS = 10 * 60 * 1000;

// Lógica de extracción y envío
const ejecutarLectura = async () => {
	if (lecturaEnCurso) {
		console.log('[Cron] Lectura omitida: ya hay una ejecución en curso.');
		return;
	}

	lecturaEnCurso = true;
    const safetyTimer = setTimeout(() => {
        console.error('[Cron] Seguridad: liberando bloqueo tras alcanzar el tiempo máximo.');
        lecturaEnCurso = false;
    }, MAX_DURACION_LECTURA_MS);
    console.log(`\n[Cron] Iniciando lectura programada: ${new Date().toLocaleString()}`);
    try {
        const fechaActual = obtenerFechaHoy();
        const fechaAyer = obtenerFechaAyer();
        const embalsesConfigurados = await obtenerConfiguracionesEmbalses();

        if (embalsesConfigurados.length === 0) {
            console.log('[Cron] No hay embalses con código SAIH configurado.');
            return;
        }

        console.log(`[Cron] Embalses objetivo: ${embalsesConfigurados.length}`);
        
        for (const configEmbalse of embalsesConfigurados) {
            const estacionObjetivo = configEmbalse.saihEstacionCodigo;
            const embalseId = configEmbalse.id;
            const nombreEmbalse = configEmbalse.nombre;

            console.log(`[Cron] ▶ Procesando: ${nombreEmbalse} (${estacionObjetivo})`);

            try {
                const datosHoy = await obtenerDatosEstacion(estacionObjetivo, fechaActual, fechaActual);
                let ultimas4 = extraerUltimasFilasValidas(datosHoy);
                let fechaUsada = fechaActual;

                // Fallback automático: al inicio del día la CHG suele tener filas vacías.
                if (ultimas4.length === 0) {
                    if (datosHoy && datosHoy.length > 0) {
                        console.log(`[Cron] ${nombreEmbalse}: hay tabla hoy, pero vacía. Probando con el día anterior...`);
                    } else {
                        console.log(`[Cron] ${nombreEmbalse}: no hay datos útiles de hoy. Probando con el día anterior...`);
                    }

                    const datosAyer = await obtenerDatosEstacion(estacionObjetivo, fechaAyer, fechaAyer);
                    ultimas4 = extraerUltimasFilasValidas(datosAyer);
                    fechaUsada = fechaAyer;
                }

                if (ultimas4.length === 0) {
                    console.log(`[Cron] ${nombreEmbalse}: tampoco hay datos válidos del día anterior.`);
                    continue;
                }

                console.log(`[Cron] ${nombreEmbalse}: enviando ${ultimas4.length} lectura(s) de fecha objetivo: ${fechaUsada}`);

                for (const fila of ultimas4) {
                    const payload = {
                        origen: 'SAIH_CHG_PRODUCCION',
                        embalse: nombreEmbalse,
                        embalseId,
                        estacion: estacionObjetivo,
                        timestamp: fila['Fecha y Hora'],
                        mediciones: fila
                    };

                    const confirmacion = await guardarMedicion(payload);
                    console.log(`[Cron] ${nombreEmbalse} -> ${payload.timestamp} guardada (${confirmacion.timestamp})`);
                }
            } catch (error) {
                console.error(`[Cron] ${nombreEmbalse}: error durante la extracción:`, error.message);
            }
        }
    } finally {
        clearTimeout(safetyTimer);
        lecturaEnCurso = false;
    }
};

let cronIniciado = false;

socket.on('connect', () => {
    console.log(`[Producción] Conectado al Nodo Central. ID de sesión: ${socket.id}`);

    if (!cronIniciado) {
        cronIniciado = true;

        // 1. Ejecución inmediata al arrancar el servicio (para poblar la interfaz sin esperar)
        ejecutarLectura();

        // 2. Programación del Cron Job (solo una vez)
        // La expresión '30 * * * *' significa: "Ejecutar en el minuto 30 de cada hora" (ej. 15:30, 16:30)
        // Esto da a la CHG ~30 min de retraso para que disponga el dato de la hora actual
        cron.schedule('30 * * * *', () => {
            ejecutarLectura();
        });

        console.log('[Producción] ⏳ Servicio en segundo plano activo. Esperando el siguiente ciclo horario...');
    }
});

socket.on('connect_error', (err) => {
    console.error('[Producción] Error de conexión con el backend:', err.message);
});

socket.on('ingesta:refresh-config', async (evento) => {
    console.log('[Producción] Evento de refresco recibido:', evento?.tipo || 'sin_tipo');
    await ejecutarLectura();
});

app.listen(PORT, () => {
    console.log(`[Producción] API HTTP activa en puerto ${PORT}`);
});