require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const MedicionRepository = require('./src/services/MedionRepository');
const EmbalseRepository = require('./src/services/EmbalseRepository');
const { time } = require('console');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	console.error('DATABASE_URL no está definida en .env');
	process.exit(1);
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

const pool = new Pool({
	connectionString: DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Manejo de eventos de Socket.IO
io.on('connection', (socket) => {
	console.log('Nodo conectado: ', socket.id);

	socket.on('medicion_scrapper', async (datos) => {
		
		console.log('Datos recibidos del scrapper: ', datos.timestamp);

		try {
			io.emit('actualizar_dashboard', datos);
			console.log('Datos emitidos al Frontend');

			await MedicionRepository.guardar(datos);
			console.log('Datos guardados en la base de datos');

		} catch (error) {
			console.error('Error al persistir datos:', error.message);
		}
	});

	socket.on('disconnect', () => {
		console.log('Nodo desconectado: ', socket.id);
	});
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

app.post('/api/embalses', async (req, res) => {
	try {
		const embalseCreado = await EmbalseRepository.guardar(req.body);
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
app.put('/api/embalses/:id', async (req, res) => {
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
app.delete('/api/embalses/:id', async (req, res) => {
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
	

io.on('connection', (socket) => {
	console.log(`Socket conectado: ${socket.id}`);

	socket.emit('server:ready', {
		message: 'Socket.IO funcionando correctamente',
		timestamp: new Date().toISOString(),
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
