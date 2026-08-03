const express = require('express');
const router = express.Router();
const ingestaController = require('../controllers/ingesta.controller');
const { requireAuth, requireRole, requireIngestaApiKey } = require('../middlewares/auth.middleware');

// El scraper lee la configuración usando su API Key
router.get('/ingesta/embalses-config', requireIngestaApiKey, ingestaController.obtenerEmbalsesConfig);

// Los administradores/operadores pueden lanzar el scraper manualmente
const authAdminOperador = [requireAuth, requireRole('ADMIN', 'OPERADOR')];
router.post('/ingesta/cargar-rango', authAdminOperador, ingestaController.cargarRangoHistorico);
router.post('/admin/ingesta/ejecutar', authAdminOperador, ingestaController.ejecutarTarea);

module.exports = router;