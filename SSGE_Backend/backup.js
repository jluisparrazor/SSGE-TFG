require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no está definida en el archivo .env');
    process.exit(1);
}

// Limpiamos la URL para que pg_dump no falle con el parámetro ?schema=public
const urlObj = new URL(process.env.DATABASE_URL);
urlObj.search = ''; // Esto elimina todo lo que haya después del símbolo "?"
const cleanDatabaseUrl = urlObj.toString();

// Creamos una carpeta para los backups si no existe
const backupDir = path.join(__dirname, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
}

// Generamos un nombre de archivo con la fecha y hora actual
const fecha = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
const backupFile = path.join(backupDir, `ssge_backup_${fecha}.sql`);

console.log('Iniciando copia de seguridad de emergencia...');
console.log('Base de datos:', cleanDatabaseUrl.split('@')[1]); // Muestra el host/bd sin la contraseña

// Usamos pg_dump para extraer toda la base de datos a un archivo .sql usando la URL limpia
const comando = `pg_dump "${cleanDatabaseUrl}" --clean --if-exists -F p -f "${backupFile}"`;

exec(comando, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error crítico al generar el backup: ${error.message}`);
        return;
    }
    if (stderr && !stderr.includes('warning')) {
        console.warn(`Aviso de pg_dump: ${stderr}`);
    }
    
    console.log('--------------------------------------------------');
    console.log(`¡Copia de seguridad completada con éxito!`);
    console.log(`Archivo guardado en: ${backupFile}`);
    console.log('--------------------------------------------------');
});