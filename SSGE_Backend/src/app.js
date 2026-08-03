const express = require('express');
const cors = require('cors');
const auditMiddleware = require('./middlewares/audit.middleware');

const embalseRoutes = require('./routes/embalse.routes');
const authRoutes = require('./routes/auth.routes');
const simulacionRoutes = require('./routes/simulacion.routes');
const medicionRoutes = require('./routes/medicion.routes');
const ingestaRoutes = require('./routes/ingesta.routes');
const auditoriaRoutes = require('./routes/auditoria.routes');

const app = express();

// --- Middlewares Globales ---
app.use(cors());
app.use(express.json());
app.use(auditMiddleware); 

// --- Montaje de Rutas ---
app.use('/api/embalses', embalseRoutes);
app.use('/api/mediciones', medicionRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api', authRoutes);
app.use('/api', simulacionRoutes);
app.use('/api', ingestaRoutes);


// Exportamos la app configurada
module.exports = app;