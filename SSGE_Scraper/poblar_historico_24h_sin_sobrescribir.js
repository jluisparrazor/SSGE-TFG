const { io } = require('socket.io-client');
const { obtenerDatosEstacion } = require('./saih_sdk.js');
const http = require('http');
const https = require('https');

const BACKEND_URL = 'http://localhost:3000';
const socket = io(BACKEND_URL);

const formatearFecha = (fecha) => {
  return `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
};

const parsearTimestampSaih = (timestamp) => {
  try {
    const [fecha, hora] = timestamp.split('-');
    if (!fecha || !hora) return null;

    const [dia, mes, anio] = fecha.split('/');
    if (!dia || !mes || !anio) return null;

    const anioCompleto = anio.length === 2 ? `20${anio}` : anio;
    return new Date(`${anioCompleto}-${mes}-${dia}T${hora}:00`);
  } catch (error) {
    return null;
  }
};

const estaEnUltimas24Horas = (timestamp, desde, hasta) => {
  const fecha = parsearTimestampSaih(timestamp);
  if (!fecha || Number.isNaN(fecha.getTime())) return false;
  return fecha >= desde && fecha <= hasta;
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

const obtenerEmbalsesBD = async () => {
  const url = `${BACKEND_URL}/api/embalses`;
  const embalses = await getJson(url);

  if (!Array.isArray(embalses)) {
    return [];
  }

  return embalses.filter((e) => e.saihEstacionCodigo && e.saihEstacionCodigo.trim() !== '');
};

const obtenerTimestampsExistentesDia = async (embalseId) => {
  const url = `${BACKEND_URL}/api/mediciones?rango=dia&embalseId=${embalseId}`;
  const mediciones = await getJson(url);

  if (!Array.isArray(mediciones)) {
    return new Set();
  }

  const timestamps = mediciones
    .map((m) => (typeof m.timestamp === 'string' ? m.timestamp.trim() : null))
    .filter((ts) => ts && ts.includes('-'))
    .filter(Boolean);

  return new Set(timestamps);
};

const iniciarPoblacion = async () => {
  const ahora = new Date();
  const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

  const strAhora = formatearFecha(ahora);
  const strHace24Horas = formatearFecha(hace24Horas);

  console.log(`[Poblador 24h] Solicitando historico CHG desde ${strHace24Horas} hasta ${strAhora}...`);
  console.log('[Poblador 24h] Obteniendo lista de embalses cargados...\n');

  try {
    const embalses = await obtenerEmbalsesBD();

    if (!Array.isArray(embalses) || embalses.length === 0) {
      console.log('[Poblador 24h] No hay embalses con codigo SAIH configurado en BD.');
      process.exit(1);
      return;
    }

    console.log(`[Poblador 24h] Se encontraron ${embalses.length} embalse(s) para poblar.\n`);

    let totalEmitidos = 0;
    let totalOmitidos = 0;

    for (let e = 0; e < embalses.length; e++) {
      const embalse = embalses[e];
      const saihEstacion = embalse.saihEstacionCodigo.trim();

      console.log(`\n[Embalse ${e + 1}/${embalses.length}] ${embalse.nombre} (${saihEstacion})`);
      console.log(`${'='.repeat(60)}`);

      try {
        const [datos, existentes] = await Promise.all([
          obtenerDatosEstacion(saihEstacion, strHace24Horas, strAhora),
          obtenerTimestampsExistentesDia(embalse.id),
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
            estaEnUltimas24Horas(fila['Fecha y Hora'].trim(), hace24Horas, ahora)
        );

        datosValidos.reverse();

        console.log(`   Registros validos CHG (24h): ${datosValidos.length}`);
        console.log(`   Registros ya existentes en BD (24h): ${existentes.size}`);

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
            origen: 'SAIH_CHG_POBLADOR_24H',
            embalse: embalse.nombre,
            embalseId: embalse.id,
            timestamp,
            mediciones: fila,
          };

          socket.emit('medicion_scrapper', payload);
          existentes.add(timestamp);
          emitidos += 1;

          console.log(`   [>>] ${timestamp}`);

          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        console.log(`   Nuevos insertados: ${emitidos} | Omitidos: ${omitidos}`);
        totalEmitidos += emitidos;
        totalOmitidos += omitidos;
      } catch (error) {
        console.error(`   [Error] ${error.message}`);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('[Poblador 24h] Finalizado.');
    console.log(`[Poblador 24h] Total nuevos insertados: ${totalEmitidos}`);
    console.log(`[Poblador 24h] Total omitidos: ${totalOmitidos}`);

    process.exit(0);
  } catch (error) {
    console.error('[Poblador 24h] Error:', error.message);
    process.exit(1);
  }
};

socket.on('connect', () => {
  console.log('[Poblador 24h] Conectado al Nodo Central.');
  iniciarPoblacion();
});
