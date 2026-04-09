// prisma/seed.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// Validar que DATABASE_URL esté configurada
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida en .env');
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
  console.log('🌱 Iniciando la plantación de datos (Seed)...');

  // 1. Limpiamos la base de datos por si ejecutamos el seed varias veces
  // (Al borrar el embalse, el onDelete: Cascade borrará también sus sensores y compuertas)
  await prisma.embalse.deleteMany();
  console.log('🧹 Base de datos limpiada.');

  // 2. Creamos el Embalse de Canales (Granada) con sus sensores y compuertas de golpe
  const embalseCanales = await prisma.embalse.create({
    data: {
      nombre: 'Embalse de Canales',
      capacidadHm3: 70.8,    // Capacidad real aproximada
      cotaMaximaM: 954.0,    // Altura máxima sobre el nivel del mar
      cotaMinimaM: 900.0,    // Altura mínima de referencia

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
          { nombre: 'Aliviadero de Superficie', estadoAperturaPorcentaje: 0.0, caudalSalidaActual: 0.0 },
          { nombre: 'Desagüe de Fondo', estadoAperturaPorcentaje: 10.0, caudalSalidaActual: 5.2 }
        ]
      }
    }
  });

  console.log('💧 Embalse creado con éxito:', embalseCanales.nombre);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('✅ Seed completado.');
  })
  .catch(async (e) => {
    console.error('❌ Error en el seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });