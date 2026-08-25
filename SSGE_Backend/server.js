require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');
const { prisma } = require('./src/lib/prisma');
const MedicionController = require('./src/controllers/medicion.controller');
const TelegramService = require('./src/services/telegram.service');

const app = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const INGESTA_API_KEY = process.env.INGESTA_API_KEY;
const INGESTA_SOCKET_ROOM = 'ingesta';

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

const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	},
});

// Inyectamos la instancia de Socket.io en Express.
app.set('io', io);

function isSocketIngestAuthorized(socket) {
	const apiKey = socket.handshake.auth?.apiKey || socket.handshake.headers['x-api-key'];
	return Boolean(apiKey && apiKey === INGESTA_API_KEY);
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

	socket.on('medicion_scrapper', async (datos, confirmar) => {
		if (!socketIngestaAutorizado) {
			const respuesta = { ok: false, error: 'No autorizado para ingesta' };
			socket.emit('server:error', { message: respuesta.error });
			if (typeof confirmar === 'function') confirmar(respuesta);
			return;
		}

		if (!datos || !datos.timestamp) {
			const respuesta = { ok: false, error: 'Payload de medicion invalido' };
			socket.emit('server:error', { message: respuesta.error });
			if (typeof confirmar === 'function') confirmar(respuesta);
			return;
		}

		try {
			const medicion = await MedicionController.procesarYGuardarPayload(datos);
			io.emit('actualizar_dashboard', datos);
			if (typeof confirmar === 'function') {
				confirmar({ ok: true, id: medicion.id, timestamp: medicion.timestamp });
			}
		} catch (error) {
			console.error(`Error al persistir ${datos.timestamp}:`, error.message);
			if (typeof confirmar === 'function') confirmar({ ok: false, error: error.message });
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

	try {
		TelegramService.iniciar();
	} catch (error) {
		console.error('Error al iniciar el bot de Telegram:', error.message);
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