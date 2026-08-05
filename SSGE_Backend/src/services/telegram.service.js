// src/services/telegram.service.js
const TelegramBot = require('node-telegram-bot-api').default;
const { prisma } = require('../lib/prisma');

class TelegramService {
    static bot;

    static iniciar() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        
        if (!token) {
            console.warn('⚠️ Token de Telegram no configurado en .env. El bot está desactivado.');
            return;
        }

        // Activamos el bot en modo polling (escucha continua)
        this.bot = new TelegramBot(token, { polling: true });

        this.bot.setMyCommands([
            { command: 'embalses', description: 'Listar embalses activos' },
            { command: 'estado', description: 'Consultar estado (ej. /estado Negratin)' },
            { command: 'grafica', description: 'Ver gráfica 24h (ej. /grafica Negratin)' },
            { command: 'ayuda', description: 'Ver panel de ayuda' }
        ]);

        // --- COMANDO /start (Bienvenida automática) ---
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const nombreUsuario = msg.from.first_name || 'operador';

            const bienvenida = `🌊 ¡Hola, *${nombreUsuario}*! Bienvenido al asistente del **SSGE** (Sistema de Simulación y Gestión de Embalses).\n\n` +
                               `Estoy conectado a la base de datos para ayudarte a monitorizar los embalses en tiempo real.\n\n` +
                               `📋 *Comandos disponibles:*\n` +
                               `🔹 /embalses - Lista todos los embalses activos.\n` +
                               `🔹 /estado [nombre] - Consulta nivel, volumen y caudales actuales.\n` +
                               `🔹 /calidad [nombre] - Revisa los sensores de calidad del agua.\n` +
                               `🔹 /grafica [nombre] - Envía una imagen con la gráfica de las últimas 24h.\n` +
                               `🔹 /ayuda - Vuelve a mostrar este panel.\n\n` +
                               `_Escribe cualquiera de los comandos para empezar._`;

            this.bot.sendMessage(chatId, bienvenida, { parse_mode: 'Markdown' });
        });

        // --- 1. COMANDO /ayuda ---
        this.bot.onText(/\/ayuda/, (msg) => {
            const chatId = msg.chat.id;
            const ayudaTexto = `🤖 *Asistente SSGE - Comandos disponibles:*\n\n` +
                               `🔹 /embalses - Lista todos los embalses activos en el sistema.\n` +
                               `🔹 /estado [nombre] - Muestra el nivel, volumen y caudales actuales de un embalse.\n` +
                               `🔹 /calidad [nombre] - Muestra los valores de los sensores de calidad del agua.\n` +
                               `🔹 /grafica [nombre] - Envía una imagen con la gráfica de las últimas 24h.\n` +
                               `🔹 /ayuda - Muestra este panel de ayuda.`;
            
            this.bot.sendMessage(chatId, ayudaTexto, { parse_mode: 'Markdown' });
        });

        // --- 2. COMANDO /embalses ---
        this.bot.onText(/\/embalses/, async (msg) => {
            const chatId = msg.chat.id;
            try {
                const embalses = await prisma.embalse.findMany({
                    where: { activo: true },
                    select: { nombre: true, capacidadHm3: true }
                });

                if (embalses.length === 0) {
                    return this.bot.sendMessage(chatId, '⚠️ No hay embalses activos registrados en el sistema.');
                }

                let lista = '💧 *Embalses registrados en el SSGE:*\n\n';
                embalses.forEach((e, index) => {
                    lista += `${index + 1}. *${e.nombre}* (Capacidad: ${e.capacidadHm3} hm³)\n`;
                });
                lista += `\nUsa /estado [nombre] para consultar los detalles de uno en concreto.`;

                this.bot.sendMessage(chatId, lista, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error('Error en comando /embalses:', error);
                this.bot.sendMessage(chatId, 'Error al consultar la lista de embalses.');
            }
        });

        // --- 3. COMANDO /estado [nombre] ---
        this.bot.onText(/\/estado (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const nombreBusqueda = match[1].trim();

            try {
                const embalse = await prisma.embalse.findFirst({
                    where: { 
                        activo: true,
                        nombre: { 
                            contains: nombreBusqueda, 
                            mode: 'insensitive' 
                        } 
                    }
                });

                if (!embalse) {
                    return this.bot.sendMessage(chatId, `No he encontrado ningún embalse que coincida con "${nombreBusqueda}". Usa /embalses para ver la lista.`);
                }

                const ultimaMedicion = await prisma.medicionHistorica.findFirst({
                    where: { embalseId: embalse.id },
                    orderBy: { timestamp: 'desc' }
                });

                if (!ultimaMedicion) {
                    return this.bot.sendMessage(chatId, `El embalse **${embalse.nombre}** existe, pero aún no tiene datos registrados.`, { parse_mode: 'Markdown' });
                }

                const capacidad = embalse.capacidadHm3;
                const volumen = ultimaMedicion.volumen;
                const porcentaje = capacidad > 0 ? ((volumen / capacidad) * 100).toFixed(1) : '--';
                const fechaFormat = new Date(ultimaMedicion.timestamp).toLocaleString('es-ES');

                const mensaje = `🌊 *Estado actual: ${embalse.nombre}*\n\n` +
                                `📊 *Llenado:* ${porcentaje}% (${volumen} hm³)\n` +
                                `📏 *Cota de agua:* ${ultimaMedicion.nivel} m.s.n.m.\n` +
                                `📥 *Aportación (Entrada):* ${ultimaMedicion.caudalEntrada} m³/s\n` +
                                `📤 *Desembalse (Salida):* ${ultimaMedicion.caudalSalida} m³/s\n\n` +
                                `_Última lectura: ${fechaFormat}_`;

                this.bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });

            } catch (error) {
                console.error('Error en comando /estado:', error);
                this.bot.sendMessage(chatId, 'Ha ocurrido un error interno al consultar la base de datos.');
            }
        });

        // --- 4. COMANDO /calidad [nombre] ---
        this.bot.onText(/\/calidad (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const nombreBusqueda = match[1].trim();

            try {
                const embalse = await prisma.embalse.findFirst({
                    where: { 
                        activo: true,
                        nombre: { 
                            contains: nombreBusqueda, 
                            mode: 'insensitive' 
                        } 
                    },
                    include: { sensores: true }
                });

                if (!embalse) {
                    return this.bot.sendMessage(chatId, `❌ No he encontrado ningún embalse que coincida con "${nombreBusqueda}".`);
                }

                if (!embalse.sensores || embalse.sensores.length === 0) {
                    return this.bot.sendMessage(chatId, `⚠️ El embalse **${embalse.nombre}** no tiene sensores de calidad configurados.`, { parse_mode: 'Markdown' });
                }

                let mensaje = `🔬 *Sensores de Calidad - ${embalse.nombre}*\n\n`;
                embalse.sensores.forEach((sensor) => {
                    let valorSimulado = '--';
                    let unidad = '';

                    if (sensor.tipo === 'Oxígeno') { valorSimulado = '8.2'; unidad = 'mg/L'; }
                    else if (sensor.tipo === 'Temperatura') { valorSimulado = '21.5'; unidad = '°C'; }
                    else if (sensor.tipo === 'Turbidez') { valorSimulado = '14.3'; unidad = 'NTU'; }

                    mensaje += `🔹 *${sensor.nombre || sensor.tipo}:* ${valorSimulado} ${unidad}\n`;
                });

                this.bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });

            } catch (error) {
                console.error('Error en comando /calidad:', error);
                this.bot.sendMessage(chatId, '❌ Error al consultar los sensores.');
            }
        });

        // --- COMANDO /grafica [nombre] ---
        this.bot.onText(/\/grafica (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const nombreBusqueda = match[1].trim();

            try {
                // 1. Buscar embalse activo
                const embalse = await prisma.embalse.findFirst({
                    where: { 
                        activo: true, 
                        nombre: { contains: nombreBusqueda, mode: 'insensitive' } 
                    }
                });

                if (!embalse) {
                    return this.bot.sendMessage(chatId, `❌ No he encontrado ningún embalse activo que coincida con "${nombreBusqueda}".`);
                }

                // 2. Calcular la fecha límite de hace 24 horas
                const fechaLimite = new Date();
                fechaLimite.setHours(fechaLimite.getHours() - 24);

                // 3. Obtener solo las mediciones de las últimas 24 horas ordenadas cronológicamente
                const historico = await prisma.medicionHistorica.findMany({
                    where: { 
                        embalseId: embalse.id,
                        timestamp: { gte: fechaLimite } // Filtro estricto últimas 24h
                    },
                    orderBy: { timestamp: 'asc' }
                });

                if (historico.length === 0) {
                    return this.bot.sendMessage(chatId, `⚠️ No hay registros de las últimas 24 horas para **${embalse.nombre}**.`, { parse_mode: 'Markdown' });
                }

                // 4. Preparar etiquetas (mostrando la hora:minuto para que tenga sentido en 24h) y datos
                const labels = historico.map(h => {
                    return new Date(h.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                });
                const datosVolumen = historico.map(h => h.volumen ?? 0);

                // 5. Construir la configuración de Chart.js para QuickChart
                const chartConfig = {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: `Volumen (hm³) - ${embalse.nombre}`,
                            data: datosVolumen,
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            fill: true,
                            tension: 0.3
                        }]
                    },
                    options: {
                        plugins: {
                            title: {
                                display: true,
                                text: `Evolución últimas 24h - ${embalse.nombre}`
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: true,
                                    text: 'Hora de la medición'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'Volumen (hm³)'
                                }
                            }
                        }
                    }
                };

                // 6. Generar la URL de la imagen PNG y enviarla a Telegram
                const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
                const imageUrl = `https://quickchart.io/chart?w=600&h=300&bg=white&c=${encodedConfig}`;

                await this.bot.sendPhoto(chatId, imageUrl, {
                    caption: `📊 *Evolución de las últimas 24h: ${embalse.nombre}*`,
                    parse_mode: 'Markdown'
                });

            } catch (error) {
                console.error('Error en comando /grafica:', error);
                this.bot.sendMessage(chatId, '❌ Error al generar la gráfica de las últimas 24 horas.');
            }
        });

        console.log('Servicio de Telegram iniciado. Escuchando comandos...');
    }
}

module.exports = TelegramService;