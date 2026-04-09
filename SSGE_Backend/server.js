require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { Server } = require('socket.io');

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

app.get('/health', (_req, res) => {
	res.json({
		ok: true,
		service: 'ssge-backend',
		timestamp: new Date().toISOString(),
	});
});

app.get('/db-health', async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, database: 'connected' });
	} catch (error) {
		res.status(500).json({
			ok: false,
			database: 'error',
			message: error instanceof Error ? error.message : 'Unknown database error',
		});
	}
});

app.get('/hola', (_req, res) => {
	res.json({
		ok: true,
		service: 'hola caracola',
		timestamp: new Date().toISOString(),
	});
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

	server.close(async () => {
		try {
			await prisma.$disconnect();
			await pool.end();
			console.log('Recursos cerrados correctamente');
			process.exit(0);
		} catch (error) {
			console.error('Error cerrando recursos:', error);
			process.exit(1);
		}
	});
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
