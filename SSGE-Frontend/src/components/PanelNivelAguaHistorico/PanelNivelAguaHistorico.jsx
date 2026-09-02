import React, { useEffect, useState } from 'react';
import { LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';
import { Eye, EyeOff } from 'lucide-react';

import "./PanelNivelAguaHistorico.css";
import { parseDateToMs } from '../../utils/fechas.js';
import { apiFetch } from '../../lib/api';

function PanelNivelAguaHistorico({ embalseId, refreshToken = 0}) {
    const [datosHistoricos, setDatosHistoricos] = useState([]);
    const [rangoGrafica, setRangoGrafica] = useState('mes');
    
    // Estado para controlar qué métricas se muestran en la gráfica
    const [visibilidadGrafica, setVisibilidadGrafica] = useState({
        volumen: true,
        caudalEntrada: false,
        caudalSalida: false,
    });

    const reducirMuestrasMensuales = (puntos) => {
        const porDia = new Map();

        puntos.forEach((punto) => {
            const fecha = new Date(punto.timestamp);
            const key = `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
            if (!porDia.has(key)) porDia.set(key, []);
            porDia.get(key).push(punto);
        });

        const elegirCercano = (items, horaObjetivo, usados) => {
            let mejorIndice = -1;
            let mejorDiferencia = Number.POSITIVE_INFINITY;

            for (let i = 0; i < items.length; i++) {
                if (usados.has(i)) continue;
                const fecha = new Date(items[i].timestamp);
                const horaDecimal = fecha.getHours() + fecha.getMinutes() / 60;
                const distancia = Math.abs(horaDecimal - horaObjetivo);
                if (distancia < mejorDiferencia) {
                    mejorDiferencia = distancia;
                    mejorIndice = i;
                }
            }
            return mejorIndice;
        };

        const filtrados = [];

        porDia.forEach((items) => {
            items.sort((a, b) => a.timestamp - b.timestamp);
            const usados = new Set();

            const idxPrimero = elegirCercano(items, 0, usados);
            if (idxPrimero >= 0) usados.add(idxPrimero);
            
            const idxSegundo = elegirCercano(items, 12, usados);
            if (idxSegundo >= 0) usados.add(idxSegundo);

            const seleccion = [];
            if (idxPrimero >= 0) seleccion.push(items[idxPrimero]);
            if (idxSegundo >= 0 && idxSegundo !== idxPrimero) seleccion.push(items[idxSegundo]);

            seleccion.sort((a, b) => a.timestamp - b.timestamp);
            filtrados.push(...seleccion);
        });
        return filtrados.sort((a, b) => a.timestamp - b.timestamp);
    };

    const cargarDatosHistoricos = async (rango) => {
        if (!embalseId){
            setDatosHistoricos([]);
            return;
        }
        
        try {
            const res = await apiFetch(`/api/mediciones?rango=${rango}&embalseId=${embalseId}`);
            if (res.ok) {
                const historial = await res.json();
                if (historial.length > 0) {
                    const puntos = historial.sort((a, b) => parseDateToMs(a.timestamp) - parseDateToMs(b.timestamp))
                    .map((d) => ({ 
                        timestamp: parseDateToMs(d.timestamp),
                        volumen: parseFloat(d.volumen) || 0,
                        caudalEntrada: parseFloat(d.caudalEntrada) || 0,
                        caudalSalida: parseFloat(d.caudalSalida) || 0,
                    }));

                    const datosParaGrafica = rango === 'mes' ? reducirMuestrasMensuales(puntos) : puntos;
                    setDatosHistoricos(datosParaGrafica);
                } else {
                    setDatosHistoricos([]);
                }
            } else {
                console.error('Error al obtener datos históricos:', res.statusText);
                setDatosHistoricos([]);
            }

        } catch (error) {
            console.error('Error al cargar datos históricos:', error);
            setDatosHistoricos([]);
        }
    };

    const volumenesHistoricos = datosHistoricos.map(d => d.volumen).filter((n) => Number.isFinite(n));
    let dominioVolumenHistorico = ['auto', 'auto'];

    if (volumenesHistoricos.length > 0) {
        const maxVolumen = Math.max(...volumenesHistoricos);
        const minVolumen = Math.min(...volumenesHistoricos);
        const rangoReal = maxVolumen - minVolumen;
        
        const factorMargen = rangoGrafica === 'dia' ? 0.1 : 0.15;
        const margenMinimo = rangoGrafica === 'dia' ? 0.03 : 0.5;
        const ventanaMinima = rangoGrafica === 'dia' ? 0.3 : 4;
        const margen = Math.max(margenMinimo, rangoReal * factorMargen);

        let minDominio = Math.max(0, minVolumen - margen);
        let maxDominio = maxVolumen + margen;
        
        if (maxDominio - minDominio < ventanaMinima) {
            const centro = (maxVolumen + minVolumen) / 2;
            const mitadVentana = ventanaMinima / 2;
            minDominio = Math.max(0, centro - mitadVentana);
            maxDominio = centro + mitadVentana;
        }
        
        dominioVolumenHistorico = [
            Number(minDominio.toFixed(2)),
            Number(maxDominio.toFixed(2))
        ];
    }

    useEffect(() => {
        cargarDatosHistoricos(rangoGrafica);

        const interval = setInterval(() => {
            cargarDatosHistoricos(rangoGrafica);
        }, 15000);
        
        return () => clearInterval(interval);
    }, [rangoGrafica, embalseId, refreshToken]);

    return(
        <div className="historico-card" >
            <div className="historico-header">
                <h3 className="historico-title">Historial del Embalse</h3>
                <div className="historico-actions">
                    {[
                        { id: 'dia', label: 'Últimas 24 Horas' },
                        { id: 'mes', label: 'Último Mes' }
                    ].map((opcion) => (              
                        <button
                            key={opcion.id}
                            className={`historico-btn ${rangoGrafica === opcion.id ? 'active' : ''}`}
                            onClick={() => setRangoGrafica(opcion.id)}
                        >
                            {opcion.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Fila de Toggles para elegir qué métricas ver */}
            <div className="simulacion-toggles-container" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                <button
                    type="button"
                    onClick={() => setVisibilidadGrafica(prev => ({ ...prev, volumen: !prev.volumen }))}
                    className={`historico-toggle-btn btn-historico-volumen ${visibilidadGrafica.volumen ? 'activo' : ''}`}
                >
                    {visibilidadGrafica.volumen ? <Eye size={15} /> : <EyeOff size={15} />}
                    Volumen (hm³)
                </button>

                <button
                    type="button"
                    onClick={() => setVisibilidadGrafica(prev => ({ ...prev, caudalEntrada: !prev.caudalEntrada }))}
                    className={`historico-toggle-btn btn-historico-entrada ${visibilidadGrafica.caudalEntrada ? 'activo' : ''}`}
                >
                    {visibilidadGrafica.caudalEntrada ? <Eye size={15} /> : <EyeOff size={15} />}
                    Caudal Entrada (m³/s)
                </button>

                <button
                    type="button"
                    onClick={() => setVisibilidadGrafica(prev => ({ ...prev, caudalSalida: !prev.caudalSalida }))}
                    className={`historico-toggle-btn btn-historico-salida ${visibilidadGrafica.caudalSalida ? 'activo' : ''}`}
                >
                    {visibilidadGrafica.caudalSalida ? <Eye size={15} /> : <EyeOff size={15} />}
                    Caudal Salida (m³/s)
                </button>
            </div>

           <div className="historico-chart" style={{ padding: '0.25rem 0.5rem' }}>
                <ResponsiveContainer width="100%" height={260} key={JSON.stringify(visibilidadGrafica)}>
                    <LineChart data={datosHistoricos} margin={{ top: 10, right: -20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                        <XAxis
                            dataKey="timestamp"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            stroke="var(--muted)"
                            tickCount={rangoGrafica === 'mes' ? 4 : 8}
                            minTickGap={rangoGrafica === 'mes' ? 48 : 20}
                            interval="preserveStartEnd"
                            tick={{ fontSize: 'var(--tick-font-size)' }}
                            tickFormatter={(value) => {
                                const fecha = new Date(value);
                                if (rangoGrafica === 'dia') {
                                    return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                                }
                                return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
                            }}
                        />
                        
                        {/* Eje Y Izquierdo para Volumen */}
                        <YAxis
                            yAxisId="left"
                            domain={dominioVolumenHistorico}
                            stroke="var(--muted)"
                            tick={{ fontSize: 'var(--tick-font-size)' }}
                            tickFormatter={(value) => (Number.isFinite(value) ? value.toFixed(1) : '')}
                        />

                        {/* Eje Y Derecho para Caudales */}
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="var(--muted)"
                            tick={{ fontSize: 'var(--tick-font-size)' }}
                            tickFormatter={(value) => (Number.isFinite(value) ? value.toFixed(2) : '')}
                        />

                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border-color)', borderRadius: '8px', color: '#e2e8f0' }}
                            labelFormatter={(value) => new Date(value).toLocaleString('es-ES')}
                            formatter={(value, name) => {
                                if (name.includes('Volumen')) return [`${Number(value).toFixed(3)} hm³`, name];
                                return [`${Number(value).toFixed(2)} m³/s`, name];
                            }}
                        />

                        {visibilidadGrafica.volumen && (
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="volumen"
                                name="Volumen"
                                stroke="#22d3ee"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}

                        {visibilidadGrafica.caudalEntrada && (
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="caudalEntrada"
                                name="Caudal Entrada"
                                stroke="#4ade80"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}

                        {visibilidadGrafica.caudalSalida && (
                            <Line
                                yAxisId="right"
                                type="stepAfter"
                                dataKey="caudalSalida"
                                name="Caudal Salida"
                                stroke="#fca5a5"
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default PanelNivelAguaHistorico;