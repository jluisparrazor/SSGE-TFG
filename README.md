# SSGE — Sistema para la Simulación y Gestión de Embalses

Trabajo Fin de Grado: sistema web para la monitorización, ingesta de datos y simulación hidrológica de embalses.

## Descripción

La gestión de los recursos hídricos requiere combinar información procedente de sensores, modelos físicos, criterios operativos y decisiones humanas. En este contexto, los embalses y las presas desempeñan un papel fundamental al permitir regular las aportaciones, atender las demandas urbanas y agrarias, mantener los caudales ecológicos y reducir el impacto de episodios de avenida o sequía.

Este Trabajo Fin de Grado presenta el desarrollo del Sistema para la Simulación y Gestión de Embalses (SSGE), un sistema web que centraliza información habitualmente distribuida entre diferentes fuentes. La aplicación integra datos hidrológicos procedentes del Sistema Automático de Información Hidrológica (SAIH) mediante un servicio de ingesta de datos automatizada, permite consultar y monitorizar el estado de los embalses en tiempo real, y ofrece herramientas de simulación para analizar distintos escenarios de operación.

Desde el punto de vista técnico, la solución se ha construido sobre una arquitectura distribuida que separa el cliente web, el servidor y la base de datos. La principal aportación del proyecto reside en la implementación de un motor de simulación histórico y manual que combina algoritmos de balance de masas con reglas de lógica difusa. Esto permite modelar restricciones de demanda, caudales ecológicos y umbrales de seguridad utilizando reglas flexibles y cercanas al lenguaje humano.

De este modo, el SSGE se consolida como una herramienta que no automatiza decisiones críticas, sino que reduce la incertidumbre y apoya activamente la estrategia operativa frente a la variabilidad climática y el estrés hídrico.

## Demo desplegada

- Frontend: https://ssge-tfg.vercel.app/ (acceso en modo invitado, sin credenciales)

## Estructura del repositorio

Monorepo con tres paquetes independientes:

- `SSGE_Backend/` — API REST y WebSockets (Node.js, Express, Prisma, PostgreSQL).
- `SSGE-Frontend/` — cliente web (React, Vite).
- `SSGE_Scraper/` — servicio de ingesta automática de datos SAIH (Playwright).

## Requisitos

- Node.js >= 20
- npm
- Instancia de PostgreSQL

## Instalación en local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/jluisparrazor/SSGE-TFG.git
   cd SSGE-TFG
   ```

2. Crear un archivo `.env` en cada paquete:

   **`SSGE_Backend/.env`**
   ```
   DATABASE_URL=postgresql://usuario:password@localhost:5432/ssge
   JWT_SECRET=<clave-secreta>
   INGESTA_API_KEY=<clave-compartida-con-el-scraper>
   PORT=3000
   ```

   **`SSGE_Scraper/.env`**
   ```
   BACKEND_URL=http://localhost:3000
   INGESTA_API_KEY=<misma-clave-que-en-el-backend>
   ```

   **`SSGE-Frontend/.env`**
   ```
   VITE_API_URL=http://localhost:3000
   VITE_SOCKET_URL=http://localhost:3000
   ```

3. Preparar la base de datos:
   ```bash
   cd SSGE_Backend
   npm install
   npx prisma migrate deploy
   ```

4. Arrancar todo el sistema desde la raíz:
   ```bash
   npm install
   npm run dev
   ```

   El frontend queda disponible en `http://localhost:5173` y el backend en `http://localhost:3000`.

## Tests

Desde `SSGE_Backend/`:
```bash
npm test              # ejecuta los tests (node:test + supertest)
npm run test:coverage # genera informe de cobertura con c8
```

## Stack tecnológico

- **Backend**: Node.js, Express, Prisma, PostgreSQL, JWT, Socket.IO
- **Frontend**: React, Vite
- **Scraper**: Playwright, node-cron, Socket.IO client
- **Despliegue**: Vercel (frontend), Railway (backend, scraper y base de datos)

## Autor

José Luis Parra
Trabajo Fin de Grado — Escuela Técnica Superior de Ingenierías Informática y de Telecomunicación de Granada

## Licencia

Proyecto académico (Trabajo Fin de Grado).
