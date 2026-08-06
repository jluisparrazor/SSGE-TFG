// prisma/seed.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// Validar que DATABASE_URL esté configurada
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no está definida en .env');
  process.exit(1);
}

console.log('Conectando a base de datos:', process.env.DATABASE_URL);

// Parse la URL de conexión
const url = new URL(process.env.DATABASE_URL);

// Crear pool con configuración explícita
const pool = new Pool({
  user: url.username,
  password: url.password,
  host: url.hostname,
  port: parseInt(url.port || '5432', 10),
  database: url.pathname.slice(1), // Quita el / inicial
});

// Crear adapter
const adapter = new PrismaPg(pool);

// Crear cliente con adapter
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando la plantación de datos (Seed)...');

  await prisma.usuario.deleteMany();

  // 1. Limpiamos la base de datos por si ejecutamos el seed varias veces
  // (Al borrar el embalse, el onDelete: Cascade borrará también sus sensores y compuertas)
  await prisma.embalse.deleteMany(); 
  console.log('Base de datos limpiada.');

  //Hash de contraseñas para los usuarios
  const adminHash = await bcrypt.hash('0000', 10);
  const operadorHash = await bcrypt.hash('0000', 10);
  const visualizadorHash = await bcrypt.hash('0000', 10);
  const ingestaHash = await bcrypt.hash('0000', 10);

  // Usuarios iniciales
  await prisma.usuario.createMany({
    data: [
      { username: 'admin',       passwordHash: adminHash,       rol: 'ADMIN',        activo: true },
      { username: 'operador',    passwordHash: operadorHash,    rol: 'OPERADOR',     activo: true },
      { username: 'visualizador',passwordHash: visualizadorHash,rol: 'VISUALIZADOR', activo: true },
      { username: 'ingesta',     passwordHash: ingestaHash,     rol: 'INGESTA',      activo: true }
    ],
    skipDuplicates: true
  });

  console.log('Usuarios creados.');

  // 2. Creamos el Embalse de Canales con toda su configuración recuperada
  const embalseCanales = await prisma.embalse.create({
    data: {
      nombre: 'Canales',
      capacidadHm3: 70.7, 
      cotaMaximaM: 954.0, 
      cotaMinimaM: 900.0, 
      demandaUrbanaMensual: 4.72,
      demandaAgrariaMensual: [2.1, 2.1, 4.5, 8.2, 17.21, 14.0, 13.5, 15.9, 9.0, 5.0, 2.8, 2.1],
      caudalEcologicoMensual: [0.145, 0.145, 0.145, 0.145, 0.110, 0.110, 0.110, 0.110, 0.110, 0.115, 0.115, 0.145],
      evaporacionMensual: [38.9, 45.8, 92.0, 105.2, 125.9, 166.6, 235.2, 232.7, 161.9, 81.2, 58.6, 48.7],
      umbralesSequiaAgraria: [15, 43, 65],
      curvaSuperficie: [
          {"vol": 0, "sup": 1}, 
          {"vol": 14.1, "sup": 31}, 
          {"vol": 70.7, "sup": 156}
      ],
      activo: true,
      
      // MAGIA DE PRISMA: Creamos las relaciones anidadas directamente
      sensores: {
        create: [
          { tipo: 'Nivel_Agua', valorActual: 915.5 },
          { tipo: 'Precipitacion_Lluvia', valorActual: 0.0 },
          { tipo: 'Turbidez', valorActual: 2.1 }
        ]
      },
      compuertas: {
        create: [
          { nombre: 'Aliviadero de Superficie', cotaTomaM: null, estadoAperturaPorcentaje: 0.0, caudalSalidaActual: 0.0 },
          { nombre: 'Desagüe de Fondo', cotaTomaM: null, estadoAperturaPorcentaje: 0.0, caudalSalidaActual: 10.0 }
        ]
      }
    }
  });

  console.log('Embalse creado con éxito:', embalseCanales.nombre);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completado.');
  })
  .catch(async (e) => {
    console.error('Error en el seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });