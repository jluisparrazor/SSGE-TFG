const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

// --- Rutas Públicas ---
router.post('/auth/login', authController.login);

// --- Rutas Protegidas (Usuario logueado) ---
router.get('/auth/me', requireAuth, authController.getMe);

// --- Rutas de Administración (Solo ADMIN) ---
const soloAdmin = [requireAuth, requireRole('ADMIN')];

router.get('/admin/usuarios', soloAdmin, authController.obtenerUsuarios);
router.post('/admin/usuarios', soloAdmin, authController.crearUsuario);
router.put('/admin/usuarios/:id', soloAdmin, authController.actualizarUsuario);

// Auditoría
router.get('/auditoria', soloAdmin, authController.obtenerAuditoria);

module.exports = router;