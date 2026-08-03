const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no esta definida en .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = { prisma, pool };