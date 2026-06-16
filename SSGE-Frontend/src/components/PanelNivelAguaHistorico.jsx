import React, { useEffect, useState } from 'react';
import { LineChart, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';

import "./styles/PanelNivelAguaHistorico.css";

function PanelNivelAguaHistorico({ embalseId, refreshToken = 0}) {
    const [datosHistoricos, setDatosHistoricos] = useState([]);
    const [rangoGrafica, setRangoGrafica] = useState('mes');

    const parseDateStr = (dateStr) => {
        if (!dateStr || !dateStr.includes('-')) return 0;
        const [datePart, timePart] = dateStr.split('-');
        const [dia, mes, anio] = datePart.split('/');
        const [hora, min] = timePart.split(':');
        return new Date(parseInt(anio) + 2000, parseInt(mes) - 1, parseInt(dia), parseInt(hora), parseInt(min), 0, 0).getTime();
    };

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
            if (idxPrimero >= 0) {
                usados.add(idxPrimero);
            }
            
            let idxSegundo = elegirCercano(items, 12, usados);
            if (idxSegundo >= 0 && items.length > 1) {
                idxSegundo = items.length - 1;
                if (usados.has(idxSegundo)) idxSegundo = 0;
            }

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
            const res = await fetch(`http://localhost:3000/api/mediciones?rango=${rango}&embalseId=${embalseId}`);
            if (res.ok) {
                const historial = await res.json();
                if (historial.length > 0) {
                    const puntos = historial.sort((a, b) => parseDateStr(a.timestamp) - parseDateStr(b.timestamp))
                    .map((d) => ({ 
                        timestamp: parseDateStr(d.timestamp),
                        volumen: parseFloat(d.volumen) || 0
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
    }, [rangoGrafica,embalseId, refreshToken]);

    return(
        <div className="historico-card" >
            <div className="historico-header">
                <h3 className="historico-title">Historial de Volumen de Agua</h3>
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
            <div className="historico-chart">
                <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={datosHistoricos}>
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
                        <YAxis
                            domain={dominioVolumenHistorico}
                            stroke="var(--muted)"
                            tick={{ fontSize: 'var(--tick-font-size)' }}
                            tickFormatter={(value) => `${value.toFixed(1)}`}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border-color)' }}
                            labelFormatter={(value) => new Date(value).toLocaleString('es-ES')}
                            formatter={(value) => [`${Number(value).toFixed(3)} hm³`, 'Volumen']}
                        />
                        <Line
                            type="monotone"
                            dataKey="volumen"
                            stroke="var(--line-stroke)"
                            strokeWidth="var(--line-width)"
                            dot={{ r: 'var(--dot-radius)', fill: 'var(--panel-bg)', stroke: 'var(--line-stroke)' }}
                            isAnimationActive={false}
                        />
                        </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default PanelNivelAguaHistorico;