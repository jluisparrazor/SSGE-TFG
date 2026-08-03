const express = require('express');
const router = express.Router();

// Importamos nuestro nuevo controlador y los middlewares de seguridad
const embalseController = require('../controllers/embalse.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

// Definimos los roles autorizados para modificar
const authAdminOperador = [requireAuth, requireRole('ADMIN', 'OPERADOR')];

// --- Rutas de lectura (No requieren rol estricto) ---
router.get('/', embalseController.obtenerTodos);
router.get('/:id', embalseController.obtenerPorId);

// --- Rutas de escritura (Protegidas) ---
router.post('/', authAdminOperador, embalseController.crear);
router.put('/:id', authAdminOperador, embalseController.actualizar);
router.delete('/:id', authAdminOperador, embalseController.eliminar);
router.patch('/:id/estado', authAdminOperador, embalseController.cambiarEstado);

module.exports = router;