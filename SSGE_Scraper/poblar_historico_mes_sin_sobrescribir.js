require('dotenv').config();
const { io } = require('socket.io-client');
const { obtenerDatosEstacion } = require('./saih_sdk.js');
const http = require('http');
const https = require('https');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const INGESTA_API_KEY = process.env.INGESTA_API_KEY || '';

const socket = io(BACKEND_URL, {
  auth: {
    apiKey: INGESTA_API_KEY,
  },
});

const formatearFecha = (fecha) => {
  return `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
};

const esHoraObjetivo = (timestamp) => {
  const partes = timestamp.split('-');
  if (partes.length < 2) return false;

  const hhmm = partes[1].trim();
  return hhmm.startsWith('00:') || hhmm.startsWith('12:');
};

const getJson = (url) => {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;

    lib
      .get(url, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            return;
          }

          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (error) {
            reject(new Error(`Respuesta JSON invalida: ${error.message}`));
          }
        });
      })
      .on('error', reject);
  });
};

const obtenerEmblesesBD = async () => {
  const url = `${BACKEND_URL}/api/embalses`;
  const embalses = await getJson(url);
  
  if (!Array.isArray(embalses)) {
    return [];
  }
  
  // Filtrar solo embalses que tengan código SAIH configurado
  return embalses.filter((e) => e.saihEstacionCodigo && e.saihEstacionCodigo.trim() !== '');
};

const obtenerTimestampsExistentesMes = async (embalseId) => {
  const url = `${BACKEND_URL}/api/mediciones?rango=mes&embalseId=${embalseId}`;
  const mediciones = await getJson(url);

  if (!Array.isArray(mediciones)) {
    return new Set();
  }

  const timestamps = mediciones
    .map((m) => (typeof m.timestamp === 'string' ? m.timestamp.trim() : null))
    .filter((ts) => ts && esHoraObjetivo(ts))
    .filter(Boolean);

  return new Set(timestamps);
};

const iniciarPoblacion = async () => {
  const hoy = new Date();
  const haceUnMes = new Date(hoy);
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);

  const strHoy = formatearFecha(hoy);
  const strHaceUnMes = formatearFecha(haceUnMes);

  console.log(`[Poblador Mes] Solicitando historico CHG desde ${strHaceUnMes} hasta ${strHoy}...`);
  console.log(`[Poblador Mes] Obteniendo lista de embalses cargados...\n`);

  try {
    const embalses = await obtenerEmblesesBD();

    if (!Array.isArray(embalses) || embalses.length === 0) {
      console.log('[Poblador Mes] No hay embalses con código SAIH configurado en BD.');
      process.exit(1);
      return;
    }

    console.log(`[Poblador Mes] Se encontraron ${embalses.length} embalse(s) para poblar.\n`);

    let totalEmitidos = 0;
    let totalOmitidos = 0;

    for (let e = 0; e < embalses.length; e++) {
      const embalse = embalses[e];
      const saihEstacion = embalse.saihEstacionCodigo.trim();
      
      console.log(`\n[Embalse ${e + 1}/${embalses.length}] ${embalse.nombre} (${saihEstacion})`);
      console.log(`${'='.repeat(60)}`);

      try {
        const [datos, existentes] = await Promise.all([
          obtenerDatosEstacion(saihEstacion, strHaceUnMes, strHoy),
          obtenerTimestampsExistentesMes(embalse.id),
        ]);

        if (!datos || datos.length === 0) {
          console.log(`[!] No se obtuvieron datos CHG para ${embalse.nombre}.`);
          continue;
        }

        const datosValidos = datos.filter(
          (fila) =>
            fila['NIVEL EMBALSE (m.s.n.m)'] &&
            fila['NIVEL EMBALSE (m.s.n.m)'].trim() !== '' &&
            fila['Fecha y Hora'] &&
            fila['Fecha y Hora'].trim() !== '' &&
            esHoraObjetivo(fila['Fecha y Hora'].trim())
        );

        datosValidos.reverse();

        console.log(`   Registros válidos CHG: ${datosValidos.length}`);
        console.log(`   Registros ya existentes en BD: ${existentes.size}`);

        let emitidos = 0;
        let omitidos = 0;

        for (let i = 0; i < datosValidos.length; i++) {
          const fila = datosValidos[i];
          const timestamp = fila['Fecha y Hora'].trim();

          if (existentes.has(timestamp)) {
            omitidos += 1;
            continue;
          }

          const payload = {
            origen: 'SAIH_CHG_POBLADOR_MES',
            embalse: embalse.nombre,
            embalseId: embalse.id,
            timestamp,
            mediciones: fila,
          };

          // DEBUG: mostrar claves de mediciones en la primera
          if (emitidos === 0) {
            console.log(`   📋 Claves en mediciones:`, Object.keys(fila).slice(0, 10));
          }

          socket.emit('medicion_scrapper', payload);
          existentes.add(timestamp);
          emitidos += 1;

          console.log(`   [>>] ${timestamp}`);

          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        console.log(`   ✓ Nuevos insertados: ${emitidos} | Omitidos: ${omitidos}`);
        totalEmitidos += emitidos;
        totalOmitidos += omitidos;

      } catch (error) {
        console.error(`   [Error] ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Poblador Mes] ✓ Finalizado.`);
    console.log(`[Poblador Mes] Total nuevos insertados: ${totalEmitidos}`);
    console.log(`[Poblador Mes] Total omitidos: ${totalOmitidos}`);

    process.exit(0);
  } catch (error) {
    console.error('[Poblador Mes] Error:', error.message);
    process.exit(1);
  }
};

socket.on('connect', () => {
  console.log('[Poblador Mes] Conectado al Nodo Central.');
  iniciarPoblacion();
});

socket.on('connect_error', (err) => {
  console.error('[Poblador Mes] Error de conexión con el backend:', err.message);
});

socket.on('server:error', (payload) => {
  console.error('[Poblador Mes] Error recibido del backend:', payload?.message || payload);
});
