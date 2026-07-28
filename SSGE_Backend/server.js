require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { prisma, pool } = require('./src/lib/prisma');
const MedicionRepository = require('./src/services/MedionRepository');
const EmbalseRepository = require('./src/services/EmbalseRepository');
const { simularEscenarioManual, simularEscenarioHistorico } = require('./src/services/MotorSimulacion');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const INGESTA_API_KEY = process.env.INGESTA_API_KEY;
const INGESTA_SOCKET_ROOM = 'ingesta';
const SCRAPER_DIR = process.env.SCRAPER_DIR || '';
const SCRAPER_DIR_FALLBACK = path.resolve(__dirname, '../SSGE_Scraper');

const TAREAS_INGESTA = {
	produccion: 'produccion.js',
	poblar_historico_mes_sin_sobrescribir: 'poblar_historico_mes_sin_sobrescribir.js',
};

const tareasEnEjecucion = new Set();

if (!INGESTA_API_KEY) {
	console.error('INGESTA_API_KEY no está definida en .env');
	process.exit(1);
}
if (!DATABASE_URL) {
	console.error('DATABASE_URL no está definida en .env');
	process.exit(1);
}
if (!JWT_SECRET) {
	console.error('JWT_SECRET no está definida en .env');
	process.exit(1);
}

function lanzarScriptIngesta(nombreTarea) {
	const scraperDir = obtenerDirectorioScraper();
	const script = TAREAS_INGESTA[nombreTarea];
	if (!script) {
		const error = new Error('Tarea de ingesta no valida');
		error.code = 'TAREA_NO_VALIDA';
		throw error;
	}

	if (tareasEnEjecucion.has(nombreTarea)) {
		const error = new Error('La tarea ya se esta ejecutando');
		error.code = 'TAREA_EN_EJECUCION';
		throw error;
	}

	const scriptPath = path.join(scraperDir, script);
	if (!fs.existsSync(scriptPath)) {
		const error = new Error(`No se encontro el script ${script} en ${scraperDir}`);
		error.code = 'SCRIPT_NO_ENCONTRADO';
		throw error;
	}

	tareasEnEjecucion.add(nombreTarea);

	const proceso = spawn('node', [scriptPath], {
		cwd: scraperDir,
		detached: true,
		stdio: 'ignore',
	});

	proceso.on('error', () => {
		tareasEnEjecucion.delete(nombreTarea);
	});

	proceso.on('exit', () => {
		tareasEnEjecucion.delete(nombreTarea);
	});

	proceso.unref();
}

function obtenerDirectorioScraper() {
	const candidatos = [SCRAPER_DIR, SCRAPER_DIR_FALLBACK].filter(Boolean);

	for (const candidato of candidatos) {
		try {
			if (fs.existsSync(candidato) && fs.statSync(candidato).isDirectory()) {
				return candidato;
			}
		} catch (_error) {
			// Si falla un candidato, intentamos el siguiente.
		}
	}

	const error = new Error('No se encontro el directorio del scraper. Verifica que exista SSGE_Scraper en el proyecto o define SCRAPER_DIR en el .env del backend.');
	error.code = 'SCRAPER_NO_CONFIGURADO';
	throw error;
}



const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	},
});

function getClientIp(req) {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.length > 0) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || null;
}

app.use((req, res, next) => {
  const inicio = Date.now();

  res.on('finish', async () => {
    try {
      const user = req.user || null;
      const duracionMs = Date.now() - inicio;

      await prisma.auditoriaEvento.create({
        data: {
          metodo: req.method,
          endpoint: req.originalUrl || req.url,
          estadoHttp: res.statusCode,
          actorId: user?.id ? Number(user.id) : null,
          actorUsername: user?.username || null,
          actorRol: user?.rol || null,
          ip: getClientIp(req),
          userAgent: req.headers['user-agent'] || null,
          detalle: JSON.stringify({
            duracionMs,
            params: req.params,
            query: req.query
          })
        }
      });
    } catch (error) {
      console.error('Error guardando auditoria:', error.message);
    }
  });

  next();
});

function isSocketIngestAuthorized(socket) {
	const apiKey = socket.handshake.auth?.apiKey || socket.handshake.headers['x-api-key'];
	return Boolean(apiKey && apiKey === INGESTA_API_KEY);
}

function requireIngestaApiKey(req, res, next) {
	const apiKey = req.headers['x-api-key'];
	if (!apiKey || apiKey !== INGESTA_API_KEY) {
		return res.status(401).json({ error: 'API key de ingesta invalida' });
	}

	req.user = {
		id: null,
		username: 'ingesta',
		rol: 'INGESTA',
	};

	return next();
}

app.get('/api/ingesta/embalses-config', requireIngestaApiKey, async (_req, res) => {
	try {
		const embalses = await prisma.embalse.findMany({
			where: { eliminado: false },
			select: {
				id: true,
				nombre: true,
				saihEstacionCodigo: true,
				saihIdPunto: true,
				senalesAsignadas: {
					where: { activa: true },
					select: {
						senal: {
							select: {
								codigo: true,
								nombre: true,
							},
						},
					},
				},
			},
		});

		return res.json(embalses);
	} catch (error) {
		console.error('Error en GET /api/ingesta/embalses-config:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
});

app.get('/api/embalses', async (_req, res) => {
	try {
		const embalses = await EmbalseRepository.obtenerTodos();
		res.json(embalses);
	} catch (error) {
		console.error('Error en /api/embalses:', error.message);
    	res.status(500).json({ error: error.message || "Error DB" });
	}
});

app.post('/api/embalses', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
	try {
		const embalseCreado = await EmbalseRepository.guardar(req.body);

		io.to(INGESTA_SOCKET_ROOM).emit('ingesta:refresh-config', {
			tipo: 'embalse_creado',
			embalseId: embalseCreado.id,
			timestamp: new Date().toISOString(),
		});

		res.status(201).json(embalseCreado);
	} catch (error) {
		console.error('Error en POST /api/embalses:', error.message);
		res.status(400).json({ error: error.message || "Error al crear embalse" });
	}
});

app.get('/api/mediciones', async (req, res) => {
	try {
		const rango = req.query.rango || 'hoy';
		const embalseIdRaw = req.query.embalseId;
		const embalseIdQuery = embalseIdRaw !== undefined ? Number(embalseIdRaw) : null;
		const limiteQuery = Number(req.query.limite);
		const limite = Number.isFinite(limiteQuery) && limiteQuery > 0 
			? Math.min(1000, Math.floor(limiteQuery)) 
			: 500;

		if (embalseIdRaw !== undefined && (!Number.isInteger(embalseIdQuery) || embalseIdQuery <= 0)) {
			return res.status(400).json({ error: 'embalseId debe ser un número entero positivo' });
		}

		// Obtenemos el embalse base (el especificado o el primero) para validar su existencia y obtener sus cotas
		const embalseBase = embalseIdQuery
			? await prisma.embalse.findFirst({
				where: { id: embalseIdQuery, eliminado: false },
				select: {
					id: true,
					cotaMaximaM: true,
					cotaMinimaM: true
				}
				})
			: await prisma.embalse.findFirst({
				where: { eliminado: false },
				orderBy: { id: 'asc' },
				select: {
					id: true,
					cotaMaximaM: true,
					cotaMinimaM: true
				}
				});

		if (!embalseBase) {
			return res.json([]);
		}

		// Obtnenemos el historial de mediciones por rango
		const historial = await MedicionRepository.obtenerPorRango(rango, embalseBase.id, limite);

		const cotaMax = embalseBase.cotaMaximaM ?? 960;
		const cotaMin = embalseBase.cotaMinimaM ?? 900;

		const datosFormateados = historial.map(medicion => ({
			timestamp: `${medicion.timestamp.getDate().toString().padStart(2, '0')}/${(medicion.timestamp.getMonth()+1).toString().padStart(2, '0')}/${medicion.timestamp.getFullYear().toString().slice(-2)}-${medicion.timestamp.getHours().toString().padStart(2, '0')}:00`,
			nivel : medicion.nivel,
			volumen: medicion.volumen,
			precipitacion: medicion.precipitacion,
			temperatura: medicion.temperatura,
			caudalEntrada: medicion.caudalEntrada,
			caudalSalida: medicion.caudalSalida,
			cotaMaximaM: cotaMax,
			cotaMinimaM: cotaMin
		}));

		res.json(datosFormateados);

	} catch (error) {
		console.error('Error en /api/mediciones:', error.message);
    	res.status(500).json({ error: error.message || "Error DB" });
	}
});

//Endpoint para cargar datos del SAIH en un rango para la Simulación histórico
app.post('/api/ingesta/cargar-rango', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
  try {
    const { embalseId, estacionCodigo, desde, hasta } = req.body;

    if (!embalseId || !estacionCodigo || !desde || !hasta) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }

    // 1. Buscamos el nombre del embalse para armar el payload de guardado
    const embalse = await prisma.embalse.findUnique({
      where: { id: Number(embalseId) }
    });

    if (!embalse) {
      return res.status(404).json({ error: 'Embalse no encontrado' });
    }

    // 2. El input type="date" envía YYYY-MM-DD. El SAIH necesita DD/MM/YYYY.
    const formatFechaSAIH = (fechaStr) => {
      const [yyyy, mm, dd] = fechaStr.split('-');
      return `${dd}/${mm}/${yyyy}`;
    };
    const strDesde = formatFechaSAIH(desde);
    const strHasta = formatFechaSAIH(hasta);

    // 3. Importamos dinámicamente tu SDK de scraping
    const scraperDir = obtenerDirectorioScraper();
    const { obtenerDatosEstacion } = require(path.join(scraperDir, 'saih_sdk.js'));

    // 4. Invocamos al scraper
    const datosNuevos = await obtenerDatosEstacion(estacionCodigo, strDesde, strHasta);

    if (!datosNuevos || datosNuevos.length === 0) {
      return res.json({ 
        ok: true, 
        mensaje: 'La CHG no devolvió datos para este rango.', 
        registrosNuevos: 0 
      });
    }

    // 5. Filtramos filas vacías o inválidas (como haces en poblar_historico)
    const datosValidos = datosNuevos.filter(
      (fila) =>
        fila['NIVEL EMBALSE (m.s.n.m)'] &&
        fila['NIVEL EMBALSE (m.s.n.m)'].trim() !== '' &&
        fila['Fecha y Hora'] &&
        fila['Fecha y Hora'].trim() !== ''
    );

    // 6. Guardamos en BD utilizando tu repositorio existente
    let registrosGuardados = 0;
    for (const fila of datosValidos) {
      const payload = {
        origen: 'SAIH_CHG_HISTORICO_ONDEMAND',
        embalse: embalse.nombre,
        embalseId: embalse.id,
        timestamp: fila['Fecha y Hora'].trim(),
        mediciones: fila,
      };

      try {
        await MedicionRepository.guardar(payload);
        registrosGuardados++;
      } catch (err) {
        // Ignoramos si falla uno concreto (ej. ya existe en BD por una restricción UNIQUE)
        console.warn(`Aviso al guardar histórico ${payload.timestamp}:`, err.message);
      }
    }

    return res.json({ 
      ok: true, 
      mensaje: `Datos extraídos del SAIH correctamente.`,
      registrosNuevos: registrosGuardados
    });

  } catch (error) {
    console.error('Error cargando datos del SAIH bajo demanda:', error);
    return res.status(500).json({ error: 'Error al comunicarse con el scraper o la base de datos' });
  }
});

app.post('/api/simulacion/ejecutar', async (req, res) => {
  try {
    const { embalseId, estadoInicial, escenario } = req.body || {};

    const embalseIdNumero = Number(embalseId);
    if (!Number.isInteger(embalseIdNumero) || embalseIdNumero <= 0) {
      return res.status(400).json({ error: 'embalseId debe ser un entero positivo' });
    }

    // Aceptamos tanto manual como historico
    if (!escenario || !['manual', 'historico'].includes(escenario.tipo)) {
      return res.status(400).json({ error: 'Tipo de escenario no válido' });
    }

    const embalse = await prisma.embalse.findFirst({
      where: { id: embalseIdNumero, eliminado: false },
      select: {
        id: true,
        nombre: true,
        capacidadHm3: true,
        cotaMaximaM: true,
        cotaMinimaM: true,
		demandaUrbanaMensual: true,
        demandaAgrariaMensual: true,
        caudalEcologicoMensual: true,
        evaporacionMensual: true,
        curvaSuperficie: true,
        umbralesSequiaAgraria: true,
      },
    });

    if (!embalse) {
      return res.status(404).json({ error: 'Embalse no encontrado' });
    }

    let resultado;

    if (escenario.tipo === 'manual') {
      resultado = simularEscenarioManual({
        embalse,
        estadoInicial,
        escenario,
      });
    } else {
      // MODO HISTÓRICO: Consulta a la base de datos
      const fechaDesde = new Date(escenario.desde);
      const fechaHasta = new Date(escenario.hasta);
      fechaHasta.setHours(23, 59, 59, 999);

      const serieHistorica = await prisma.medicionHistorica.findMany({
        where: {
          embalseId: embalse.id,
          timestamp: { gte: fechaDesde, lte: fechaHasta },
        },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, caudalEntrada: true, volumen: true, caudalSalida:true}
      });

      if (serieHistorica.length === 0) {
        return res.status(404).json({ error: 'No hay datos históricos en ese rango.' });
      }

      resultado = simularEscenarioHistorico({
        embalse,
        estadoInicial,
        serieHistorica,
        escenario,
      });
    }

    const resultadoGuardado = await prisma.resultadoSimulacion.create({
      data: {
        tipo: resultado.tipo,
        embalseId: embalse.id,
        parametrosInput: resultado.parametros,
        proyeccion: resultado.proyeccion,
        alertaMaxima: resultado.metricas.alertaMaxima,
        duracionMin: Number(resultado.parametros.duracionMin) || 0,
      },
      select: { id: true, fechaEjecucion: true },
    });

    res.json({ ...resultado, id: resultadoGuardado.id, fechaEjecucion: resultadoGuardado.fechaEjecucion });
  } catch (error) {
    console.error('Error en ejecución:', error);
    res.status(400).json({ error: error.message || 'Error en simulación' });
  }
});

app.get('/api/simulaciones/:id/exportar', requireAuth, requireRole('ADMIN', 'OPERADOR', 'VISUALIZADOR'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de simulación inválido' });
    }

    const simulacion = await prisma.resultadoSimulacion.findUnique({
      where: { id },
      include: { embalse: true }
    });

    if (!simulacion) {
      return res.status(404).json({ error: 'Simulación no encontrada' });
    }

    // Generamos el CSV a partir del JSON guardado
    const proyeccion = simulacion.proyeccion || [];
    
    // Cabeceras del CSV
    const cabeceras = [
      'Paso', 'Minutos', 'Nivel (%)', 'Volumen (hm3)', 
      'Entrada (m3/s)', 'Ecologico (m3/s)', 'Desembalse (m3/s)',
      'Urbana Servida (hm3)', 'Agraria Servida (hm3)', 'Situacion'
    ];

    const filas = proyeccion.map(p => [
      p.paso,
      p.instanteMin,
      p.nivelPorcentaje,
      p.volumenHm3,
      p.caudalEntradaM3s,
      p.caudalEcologicoM3s,
      p.desembalseSeguridadM3s,
      p.demandaUrbanaServidaHm3,
      p.demandaAgrariaServidaHm3,
      p.riesgo
    ]);

    const csvContent = [
      cabeceras.join(','),
      ...filas.map(fila => fila.join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="simulacion_${id}_${simulacion.embalse.nombre.replace(/\s+/g, '_')}.csv"`);
    
    return res.send(csvContent);

  } catch (error) {
    console.error('Error al exportar simulación:', error.message);
    return res.status(500).json({ error: 'Error al generar el archivo de exportación' });
  }
});

app.get('/api/simulaciones', async (req, res) => {
  try {
    const embalseIdRaw = req.query.embalseId;
    const embalseId = embalseIdRaw !== undefined ? Number(embalseIdRaw) : undefined;

    if (embalseIdRaw !== undefined && (!Number.isInteger(embalseId) || embalseId <= 0)) {
      return res.status(400).json({ error: 'embalseId debe ser un entero positivo' });
    }

    const resultados = await prisma.resultadoSimulacion.findMany({
      where: embalseId ? { embalseId } : undefined,
      orderBy: { fechaEjecucion: 'desc' },
      take: 20,
      select: {
        id: true,
        fechaEjecucion: true,
        tipo: true,
        alertaMaxima: true,
        duracionMin: true,
		parametrosInput: true,
        embalse: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },
    });
	

    res.json(resultados);
  } catch (error) {
    console.error('Error en GET /api/simulaciones:', error);
    res.status(500).json({ error: error.message || 'Error DB' });
  }
});

app.get('/api/simulaciones/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const simulacion = await prisma.resultadoSimulacion.findUnique({
      where: { id },
      include: { embalse: true }
    });

    if (!simulacion) {
      return res.status(404).json({ error: 'Simulación no encontrada' });
    }

    const proyeccion = simulacion.proyeccion || [];

    // Recalculamos las métricas extraídas de la proyección guardada
    const volumenTotalDesembalsadoHm3 = proyeccion.reduce((acc, p) => acc + (p.desembalseSeguridadHm3 || 0), 0);
    const totalUrbanaObjetivo = proyeccion.reduce((acc, p) => acc + (p.demandaUrbanaObjetivoHm3 || 0), 0);
    const totalUrbanaServida = proyeccion.reduce((acc, p) => acc + (p.demandaUrbanaServidaHm3 || 0), 0);
    const totalAgrariaObjetivo = proyeccion.reduce((acc, p) => acc + (p.demandaAgrariaObjetivoHm3 || 0), 0);
    const totalAgrariaServida = proyeccion.reduce((acc, p) => acc + (p.demandaAgrariaServidaHm3 || 0), 0);

    const metricas = {
      alertaMaxima: simulacion.alertaMaxima,
      volumenTotalDesembalsadoHm3: Number(volumenTotalDesembalsadoHm3.toFixed(4)),
      demandaUrbanaSatisfechaPct: totalUrbanaObjetivo > 0 ? Number(((totalUrbanaServida / totalUrbanaObjetivo) * 100).toFixed(2)) : 100,
      demandaAgrariaSatisfechaPct: totalAgrariaObjetivo > 0 ? Number(((totalAgrariaServida / totalAgrariaObjetivo) * 100).toFixed(2)) : 100,
    };

    return res.json({
      id: simulacion.id,
      fechaEjecucion: simulacion.fechaEjecucion,
      tipo: simulacion.tipo,
      embalse: simulacion.embalse,
      parametros: simulacion.parametrosInput,
      proyeccion: proyeccion,
      metricas: metricas
    });

  } catch (error) {
    console.error('Error al obtener la simulación:', error.message);
    return res.status(500).json({ error: 'Error al recuperar la simulación' });
  }
});

app.delete('/api/simulaciones/:id', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de simulación inválido' });
    }

    // Prisma permite borrar directamente por el ID
    await prisma.resultadoSimulacion.delete({
      where: { id }
    });

    return res.json({ message: 'Simulación eliminada correctamente' });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'La simulación no existe' });
    }
    console.error('Error en DELETE /api/simulaciones/:id:', error.message);
    return res.status(500).json({ error: 'Error al eliminar la simulación' });
  }
});

app.get('/api/historial-simulacion', async (req, res) => {
  try {
    const embalseIdRaw = req.query.embalseId;
    const embalseId = embalseIdRaw !== undefined ? Number(embalseIdRaw) : undefined;

    const limiteRaw = Number(req.query.limite);
    const limite = Number.isFinite(limiteRaw) && limiteRaw > 0
      ? Math.min(1000, Math.floor(limiteRaw))
      : 4;

    if (embalseIdRaw !== undefined && (!Number.isInteger(embalseId) || embalseId <= 0)) {
      return res.status(400).json({ error: 'embalseId debe ser un número entero positivo' });
    }

    const historiales = await prisma.historialSimulacion.findMany({
      where: embalseId ? { embalseId } : undefined,
      orderBy: { fechaHora: 'desc' },
      take: limite,
      select: {
        id: true,
        tipo: true,
        fechaHora: true,
        eventoDisparador: true,
        accionAutomatica: true,
      },
    });

    const resultados = historiales.map(item => ({
      id: item.id,
      tipo: item.tipo || 'info',
      hora: item.fechaHora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      titulo: item.eventoDisparador,
      descripcion: item.accionAutomatica,
      fechaHora: item.fechaHora,
    }));

    res.json(resultados);
  } catch (error) {
    console.error('Error en /api/historial-simulacion:', error);
    res.status(500).json({ error: error.message || "Error DB" });
  }
});

// Endpoint para obtener un embalse por su ID, incluyendo sensores, compuertas y señales asignadas
app.get('/api/embalses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

		const embalse = await EmbalseRepository.obtenerPorId(id);

    if (!embalse) {
      return res.status(404).json({ error: 'Embalse no encontrado' });
    }

    res.json(embalse);
  } catch (error) {
    console.error('Error en GET /api/embalses/:id:', error.message);
    res.status(500).json({ error: error.message || 'Error DB' });
  }
});

// Endpoint para actualizar un embalse por su ID
app.put('/api/embalses/:id', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'id inválido' });
    }

    const actualizado = await EmbalseRepository.actualizar(id, req.body);
    res.json(actualizado);
  } catch (error) {
    console.error('Error en PUT /api/embalses/:id:', error.message);
    const msg = error?.message || 'Error al actualizar embalse';

    if (msg.toLowerCase().includes('no existe')) {
      return res.status(404).json({ error: msg });
    }

    res.status(400).json({ error: msg });
  }
});

// DELETE /api/embalses/:id - Borrado lógico
app.delete('/api/embalses/:id', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        const embalseEliminado = await EmbalseRepository.eliminarLogico(id);
        
        res.json({
            message: 'Embalse eliminado correctamente',
            embalse: embalseEliminado
        });
    } catch (error) {
        console.error('Error en DELETE /api/embalses/:id:', error);
        res.status(400).json({ 
            message: error.message || 'Error al eliminar embalse',
            error: error.message 
        });
    }
});

// PATCH /api/embalses/:id/estado - Activar o Desactivar embalse
app.patch('/api/embalses/:id/estado', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;
        
        if (!id || isNaN(id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }

        if (typeof activo !== 'boolean') {
            return res.status(400).json({ error: 'El campo activo debe ser un booleano' });
        }

        const embalseActualizado = await EmbalseRepository.cambiarEstado(id, activo);
        
        res.json({
            message: `Embalse ${activo ? 'activado' : 'desactivado'} correctamente`,
            embalse: embalseActualizado
        });
    } catch (error) {
        console.error('Error en PATCH /api/embalses/:id/estado:', error);
        res.status(400).json({ 
            error: error.message || 'Error al cambiar el estado del embalse' 
        });
    }
});

app.post('/api/admin/ingesta/ejecutar', requireAuth, requireRole('ADMIN', 'OPERADOR'), async (req, res) => {
	try {
		const tarea = typeof req.body?.tarea === 'string' ? req.body.tarea.trim() : '';
		if (!tarea) {
			return res.status(400).json({ error: 'tarea es obligatoria' });
		}

		lanzarScriptIngesta(tarea);

		return res.status(202).json({
			ok: true,
			mensaje: `Tarea ${tarea} lanzada correctamente`,
		});
	} catch (error) {
		if (error?.code === 'TAREA_EN_EJECUCION') {
			return res.status(409).json({ error: error.message });
		}
		if (error?.code === 'TAREA_NO_VALIDA') {
			return res.status(400).json({ error: error.message });
		}
		if (error?.code === 'SCRIPT_NO_ENCONTRADO') {
			return res.status(404).json({ error: error.message });
		}
		if (error?.code === 'SCRAPER_NO_CONFIGURADO') {
			return res.status(500).json({ error: error.message });
		}

		console.error('Error en POST /api/admin/ingesta/ejecutar:', error.message);
		return res.status(500).json({ error: error.message || 'No se pudo lanzar la tarea' });
	}
});
	
app.post('/api/auth/login', async (req, res) => {
	try {
		const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (!username || !password) {
			return res.status(400).json({ error: 'username y password son obligatorios' });
		}
		const usuario = await prisma.usuario.findUnique({
			where: { username },
			select: {
				id: true,
				username: true,
				passwordHash: true,
				rol: true,
				activo: true,
			},
		});
		if (!usuario || !usuario.activo) {
			return res.status(401).json({ error: 'Credenciales inválidas' });
		}

		const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
		if (!passwordValida) {
			return res.status(401).json({ error: 'Credenciales inválidas' });
		}

		const token = jwt.sign(
			{
				sub: usuario.id,
				username: usuario.username,
				rol: usuario.rol,
			},
			JWT_SECRET,
			{ expiresIn: '8h' }
		);

		return res.status(200).json({
			token,
			usuario: {
				id: usuario.id,
				username: usuario.username,
				rol: usuario.rol,
			},
		});
	} catch (error) {
		console.error('Error en POST /api/auth/login:', error);
		return res.status(500).json({ error: 'Error interno del servidor' });
	}
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
	try {
		const usuario = await prisma.usuario.findUnique({
			where: { id: Number(req.user.id) },
			select: {
				id: true,
				username: true,
				rol: true,
				activo: true,
			},
		});

		if (!usuario || !usuario.activo) {
			return res.status(401).json({ error: 'Sesion invalida' });
		}

		return res.json({ usuario });
	} catch (error) {
		console.error('Error en GET /api/auth/me:', error.message);
		return res.status(500).json({ error: 'Error interno del servidor' });
	}
});

app.get('/api/admin/usuarios', requireAuth, requireRole('ADMIN'), async (_req, res) => {
	try {
		const usuarios = await prisma.usuario.findMany({
			orderBy: { id: 'asc' },
			select: {
				id: true,
				username: true,
				rol: true,
				activo: true,
				fchCreacion: true,
				fchActualizacion: true,
			},
		});

		return res.json(usuarios);
	} catch (error) {
		console.error('Error en GET /api/admin/usuarios:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
});

app.post('/api/admin/usuarios', requireAuth, requireRole('ADMIN'), async (req, res) => {
	try {
		const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		const rol = typeof req.body?.rol === 'string' ? req.body.rol.toUpperCase() : '';
		const activo = req.body?.activo !== undefined ? Boolean(req.body.activo) : true;

		if (!username || !password || !rol) {
			return res.status(400).json({ error: 'username, password y rol son obligatorios' });
		}

		const rolesValidos = ['ADMIN', 'OPERADOR', 'VISUALIZADOR', 'INGESTA'];
		if (!rolesValidos.includes(rol)) {
			return res.status(400).json({ error: 'Rol invalido' });
		}

		const yaExiste = await prisma.usuario.findUnique({ where: { username } });
		if (yaExiste) {
			return res.status(409).json({ error: 'El username ya existe' });
		}

		const passwordHash = await bcrypt.hash(password, 10);

		const usuarioCreado = await prisma.usuario.create({
			data: {
				username,
				passwordHash,
				rol,
				activo,
			},
			select: {
				id: true,
				username: true,
				rol: true,
				activo: true,
				fchCreacion: true,
				fchActualizacion: true,
			},
		});

		return res.status(201).json(usuarioCreado);
	} catch (error) {
		console.error('Error en POST /api/admin/usuarios:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
});

app.put('/api/admin/usuarios/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id) || id <= 0) {
			return res.status(400).json({ error: 'id invalido' });
		}

		const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined;
		const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
		const rol = typeof req.body?.rol === 'string' ? req.body.rol.toUpperCase() : undefined;
		const activo = req.body?.activo;

		const data = {};

		if (username !== undefined && username !== '') {
			data.username = username;
		}

		if (rol !== undefined) {
			const rolesValidos = ['ADMIN', 'OPERADOR', 'VISUALIZADOR', 'INGESTA'];
			if (!rolesValidos.includes(rol)) {
				return res.status(400).json({ error: 'Rol invalido' });
			}
			data.rol = rol;
		}

		if (activo !== undefined) {
			data.activo = Boolean(activo);
		}

		if (password !== undefined) {
			if (!password) {
				return res.status(400).json({ error: 'Password invalida' });
			}
			data.passwordHash = await bcrypt.hash(password, 10);
		}

		if (Object.keys(data).length === 0) {
			return res.status(400).json({ error: 'No hay cambios para actualizar' });
		}

		const actualizado = await prisma.usuario.update({
			where: { id },
			data,
			select: {
				id: true,
				username: true,
				rol: true,
				activo: true,
				fchCreacion: true,
				fchActualizacion: true,
			},
		});

		return res.json(actualizado);
	} catch (error) {
		if (error?.code === 'P2025') {
			return res.status(404).json({ error: 'Usuario no encontrado' });
		}
		if (error?.code === 'P2002') {
			return res.status(409).json({ error: 'El username ya existe' });
		}
		console.error('Error en PUT /api/admin/usuarios/:id:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
});

app.get('/api/auditoria', requireAuth, requireRole('ADMIN'), async (req, res) => {
	try {
		const limiteRaw = Number(req.query.limite);
		const paginaRaw = Number(req.query.pagina);
		const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(200, Math.floor(limiteRaw)) : 50;
		const pagina = Number.isFinite(paginaRaw) && paginaRaw > 0 ? Math.floor(paginaRaw) : 1;
		const skip = (pagina - 1) * limite;

		const total = await prisma.auditoriaEvento.count();
		const eventos = await prisma.auditoriaEvento.findMany({
			orderBy: { fechaHora: 'desc' },
			take: limite,
			skip,
			select: {
				id: true,
				fechaHora: true,
				metodo: true,
				endpoint: true,
				estadoHttp: true,
				actorId: true,
				actorUsername: true,
				actorRol: true,
				ip: true,
				userAgent: true,
				detalle: true,
			},
		});

		return res.json({
			total,
			pagina,
			limite,
			totalPaginas: Math.max(1, Math.ceil(total / limite)),
			eventos,
		});
	} catch (error) {
		console.error('Error en GET /api/auditoria:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
});

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      username: payload.username,
      rol: payload.rol
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    return next();
  };
}

io.on('connection', (socket) => {
	console.log(`Socket conectado: ${socket.id}`);
	const socketIngestaAutorizado = isSocketIngestAuthorized(socket);

	if (socketIngestaAutorizado) {
		socket.join(INGESTA_SOCKET_ROOM);
	}

	socket.emit('server:ready', {
		message: 'Socket.IO funcionando correctamente',
		timestamp: new Date().toISOString(),
	});

	socket.on('medicion_scrapper', async (datos) => {
		if (!socketIngestaAutorizado) {
			socket.emit('server:error', { message: 'No autorizado para ingesta' });
			return;
		}

		if (!datos || !datos.timestamp) {
			socket.emit('server:error', { message: 'Payload de medicion invalido' });
			return;
		}

		try {
			io.emit('actualizar_dashboard', datos);
			await MedicionRepository.guardar(datos);
		} catch (error) {
			console.error('Error al persistir datos:', error.message);
		}
	});

	socket.on('ping', () => {
		socket.emit('pong', {
			timestamp: new Date().toISOString(),
		});
	});

	socket.on('disconnect', (reason) => {
		console.log(`Socket desconectado: ${socket.id} (${reason})`);
	});
});

async function start() {
	try {
		await prisma.$connect();
		console.log('Prisma conectado correctamente');
	} catch (error) {
		console.warn('Prisma no pudo conectarse al arrancar:', error instanceof Error ? error.message : error);
	}

	server.listen(PORT, () => {
		console.log(`Servidor escuchando en http://localhost:${PORT}`);
	});
}

async function shutdown(signal) {
    console.log(`Recibida señal ${signal}. Cerrando servidor...`);

    const forceExit = setTimeout(() => {
        console.warn('Cierre forzado tras timeout');
        process.exit(1);
    }, 5000);

    try {
        io.close();
        server.close(async () => {
            try {
                await prisma.$disconnect();
                await pool.end();
                clearTimeout(forceExit);
                console.log('Recursos cerrados correctamente');
                process.exit(0);
            } catch (error) {
                clearTimeout(forceExit);
                console.error('Error cerrando recursos:', error);
                process.exit(1);
            }
        });
    } catch (error) {
        clearTimeout(forceExit);
        console.error('Error en el apagado:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
