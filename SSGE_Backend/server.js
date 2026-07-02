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
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const INGESTA_API_KEY = process.env.INGESTA_API_KEY;
const INGESTA_SOCKET_ROOM = 'ingesta';
const SCRAPER_DIR = process.env.SCRAPER_DIR || '';
const SCRAPER_DIR_FALLBACK = '/home/jluisparrazor/Escritorio/SSGE-TFG/SSGE-Scraper';

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

	const error = new Error('No se encontro el directorio del scraper. Define SCRAPER_DIR en el .env del backend apuntando a la carpeta externa.');
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
