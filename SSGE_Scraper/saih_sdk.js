const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function resolverExecutablePath() {
    const candidatos = [
        process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        process.env.CHROMIUM_EXECUTABLE_PATH,
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
    ].filter(Boolean);

    for (const candidato of candidatos) {
        if (fs.existsSync(candidato)) {
            return candidato;
        }
    }

    return undefined;
}

async function obtenerDatosEstacion(nombreEstacion, fechaInicio, fechaFin, filtroSensor = null) {
    const rutaDiccionario = path.join(__dirname, 'data', 'diccionario_saih.json');
    if (!fs.existsSync(rutaDiccionario)) throw new Error("No se encuentra diccionario_saih.json");

    const diccionario = JSON.parse(fs.readFileSync(rutaDiccionario, 'utf8'));
    const info = diccionario[nombreEstacion];
    if (!info) throw new Error(`Estación '${nombreEstacion}' no encontrada.`);

    const sensoresAAgregar = info.sensores.filter(s => 
        !filtroSensor || s.nombre_sensor.toUpperCase().includes(filtroSensor.toUpperCase())
    );

    const executablePath = resolverExecutablePath();
    const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: executablePath ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    const page = await browser.newPage();
    const url = 'https://www.chguadalquivir.es/saih/DatosHistoricos.aspx';

    try {
        console.log(`[Scraper] Conectando a CHG para: ${nombreEstacion}`);
        await page.goto(url);

        await page.fill('#ContentPlaceHolder1_FechaInicial', fechaInicio);
        await page.fill('#ContentPlaceHolder1_FechaFinal', fechaFin);
        await page.selectOption('#ContentPlaceHolder1_ListaRemotas', info.id_punto);
        await page.waitForSelector('#ContentPlaceHolder1_ListaSen');

        const mapaRenombrado = {};
        for (const sensor of sensoresAAgregar) {
            const idCorto = sensor.id_sensor.split(',')[0];
            mapaRenombrado[idCorto] = sensor.nombre_sensor.replace(idCorto, "").trim();
            await page.selectOption('#ContentPlaceHolder1_ListaSen', sensor.id_sensor);
            await page.click('#ContentPlaceHolder1_AgregarSeñal');
            await page.waitForSelector('#ContentPlaceHolder1_ListaSen');
        }

        await page.click('#ContentPlaceHolder1_Visualizar');
        await page.waitForSelector('table');

        const tablasExtraidas = await page.$$eval('table', (tablas) => {
            return tablas.map(t => {
                const filas = Array.from(t.querySelectorAll('tr'));
                return filas.map(f => Array.from(f.querySelectorAll('th, td')).map(c => c.innerText.trim()));
            });
        });

        // Modificación clave: procesar y retornar los datos en memoria
        let datosExtraidos = [];
        tablasExtraidas.forEach(tabla => {
            if (tabla.length === 0) return;
            const cabecera = tabla[0].map(col => mapaRenombrado[col] || col);
            if (cabecera.includes('Fecha y Hora')) {
                const filas = tabla.slice(1);
                datosExtraidos = filas.map(fila => {
                    let obj = {};
                    cabecera.forEach((col, i) => obj[col] = fila[i]);
                    return obj;
                });
            }
        });

        return datosExtraidos;

    } catch (error) {
        console.error("[Scraper] Error:", error);
        return [];
    } finally {
        await browser.close();
    }
}

module.exports = { obtenerDatosEstacion };