const { prisma } = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res) => {
	try {
		const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		
        if (!username || !password) {
			return res.status(400).json({ error: 'username y password son obligatorios' });
		}
		
        const usuario = await prisma.usuario.findUnique({
			where: { username },
			select: { id: true, username: true, passwordHash: true, rol: true, activo: true },
		});
		
        if (!usuario || !usuario.activo) {
			return res.status(401).json({ error: 'Credenciales inválidas' });
		}

		const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
		if (!passwordValida) {
			return res.status(401).json({ error: 'Credenciales inválidas' });
		}

		const token = jwt.sign(
			{ sub: usuario.id, username: usuario.username, rol: usuario.rol },
			JWT_SECRET,
			{ expiresIn: '8h' }
		);

		return res.status(200).json({
			token,
			usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol },
		});
	} catch (error) {
		console.error('Error en POST /api/auth/login:', error);
		return res.status(500).json({ error: 'Error interno del servidor' });
	}
};

const getMe = async (req, res) => {
	try {
		const usuario = await prisma.usuario.findUnique({
			where: { id: Number(req.user.id) },
			select: { id: true, username: true, rol: true, activo: true },
		});

		if (!usuario || !usuario.activo) {
			return res.status(401).json({ error: 'Sesion invalida' });
		}
		return res.json({ usuario });
	} catch (error) {
		console.error('Error en GET /api/auth/me:', error.message);
		return res.status(500).json({ error: 'Error interno del servidor' });
	}
};

const obtenerUsuarios = async (_req, res) => {
	try {
		const usuarios = await prisma.usuario.findMany({
			orderBy: { id: 'asc' },
			select: { id: true, username: true, rol: true, activo: true, fchCreacion: true, fchActualizacion: true },
		});
		return res.json(usuarios);
	} catch (error) {
		console.error('Error en GET /api/admin/usuarios:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
};

const crearUsuario = async (req, res) => {
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
			data: { username, passwordHash, rol, activo },
			select: { id: true, username: true, rol: true, activo: true, fchCreacion: true, fchActualizacion: true },
		});

		return res.status(201).json(usuarioCreado);
	} catch (error) {
		console.error('Error en POST /api/admin/usuarios:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
};

const actualizarUsuario = async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id invalido' });

		const { username, password, rol, activo } = req.body;
		const data = {};

		if (username !== undefined && username.trim() !== '') data.username = username.trim();
		if (rol !== undefined) {
			const rolesValidos = ['ADMIN', 'OPERADOR', 'VISUALIZADOR', 'INGESTA'];
			if (!rolesValidos.includes(rol.toUpperCase())) return res.status(400).json({ error: 'Rol invalido' });
			data.rol = rol.toUpperCase();
		}
		if (activo !== undefined) data.activo = Boolean(activo);
		if (password !== undefined) {
			if (!password) return res.status(400).json({ error: 'Password invalida' });
			data.passwordHash = await bcrypt.hash(password, 10);
		}

		if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No hay cambios para actualizar' });

		const actualizado = await prisma.usuario.update({
			where: { id },
			data,
			select: { id: true, username: true, rol: true, activo: true, fchCreacion: true, fchActualizacion: true },
		});
		return res.json(actualizado);
	} catch (error) {
		if (error?.code === 'P2025') return res.status(404).json({ error: 'Usuario no encontrado' });
		if (error?.code === 'P2002') return res.status(409).json({ error: 'El username ya existe' });
		console.error('Error en PUT /api/admin/usuarios/:id:', error.message);
		return res.status(500).json({ error: 'Error DB' });
	}
};

const obtenerAuditoria = async (req, res) => {
  try {
    const limiteRaw = Number(req.query.limite);
    const paginaRaw = Number(req.query.pagina);
    const limite = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(200, Math.floor(limiteRaw)) : 50;
    const pagina = Number.isFinite(paginaRaw) && paginaRaw > 0 ? Math.floor(paginaRaw) : 1;
    const skip = (pagina - 1) * limite;

    const incluirTotal = ['1', 'true', 'si'].includes(String(req.query.incluirTotal || '').toLowerCase());

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
        detalle: true
      }
    });

    if (!incluirTotal) {
      return res.json({ pagina, limite, eventos });
    }

    const total = await prisma.auditoriaEvento.count();

    return res.json({
      total,
      pagina,
      limite,
      totalPaginas: Math.max(1, Math.ceil(total / limite)),
      eventos
    });
  } catch (error) {
    console.error('Error en GET /api/auditoria:', error.message);
    return res.status(500).json({ error: 'Error DB' });
  }
};

module.exports = {
	login,
	getMe,
	obtenerUsuarios,
	crearUsuario,
	actualizarUsuario,
	obtenerAuditoria
};