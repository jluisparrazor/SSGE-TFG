import React, {useEffect, useRef, useState, useLayoutEffect} from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Dam, Eye, Gauge, Thermometer, Wind, X, CheckCircle} from "lucide-react";
import "./styles/AniadirEmbalse.css";
import AppHeader from "./components/AppHeader.jsx";
import AppFooter from "./components/AppFooter.jsx";
import EmbalseInfografia from "./components/EmbalseInfografia.jsx";
import { apiFetch } from "./lib/api";

const CATALOGO_SAIH_BASE = {
  E41_CANALES: {
    id_punto: '241',
    sensores: [
      { nombre_sensor: 'NIVEL EMBALSE (m.s.n.m) E41_106', id_sensor: 'E41_106,1,5950,43,1,m.s.n.m' },
      { nombre_sensor: 'VOLUMEN EMBALSADO (hm3) E41_302', id_sensor: 'E41_302,1,5952,45,1,hm3' },
      { nombre_sensor: 'PRECIPITACION (l/m2) E41_202', id_sensor: 'E41_202,1,5953,3,2,l/m2' },
      { nombre_sensor: 'TEMPERATURA (C) E41_401', id_sensor: 'E41_401,1,5954,6,4,C' },
      { nombre_sensor: 'APORTACION AL EMBALSE (m3/s) E41_211', id_sensor: 'E41_211,1,5955,10,3,m3/s' },
      { nombre_sensor: 'CAUDAL DESEMBALSADO (m3/s) E41_212', id_sensor: 'E41_212,1,5956,10,3,m3/s' }
    ]
  }
};

function AniadirEmbalse({vistaActiva = "aniadir", onCambiarVista}) {
    const [menuAbierto, setMenuAbierto] = useState(false);

    const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);

    const toggleMenuUsuario = () => {
        setMenuUsuarioAbierto((prev) => !prev);
    };

    const [formData, setFormData] = useState({
        nombre: "",
        capacidadTotal: "",
        cotaSuperior: "",
        cotaInferior: "",
        saihEstacion: "",
        saihSenales: [],
        numeroCompuertas: 2,
        compuertas: [
            {id: 1, altura: "850", maximoCaudal: ""},
            {id: 2, altura: "830", maximoCaudal: ""}
        ],
        sensores: [
            { id: 1, tipo: 'Oxígeno', nombre: 'Sensor de Oxígeno', altura: '' },
        ]
    });

    const [modalExito, setModalExito] = useState(false);
    const [catalogoSaih, setCatalogoSaih] = useState(CATALOGO_SAIH_BASE);
    const [guardando, setGuardando] = useState(false);
    const [mensajeEstado, setMensajeEstado] = useState("");
    const [errorEstado, setErrorEstado] = useState("");
    const [altoPanelDatos, setAltoPanelDatos] = useState(null);
    const [compuertasTocadas, setCompuertasTocadas] = useState(new Set());
    const [sensoresAlturaTocadas, setSensoresAlturaTocadas] = useState(new Set());
    const menuRef = useRef(null);
    const panelDatosRef = useRef(null);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const embalseIdEditar = searchParams.get('id');
    const modoEdicion = !!embalseIdEditar;
    const redirected = useRef(false);

    useEffect(() => {
        if (!modoEdicion) return;

        const cargarEmbalse = async () => {
            try {
            const res = await apiFetch(`/api/embalses/${embalseIdEditar}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo cargar el embalse');
            }

            setFormData({
                nombre: data.nombre || '',
                capacidadTotal: String(data.capacidadHm3 ?? ''),
                cotaSuperior: String(data.cotaMaximaM ?? ''),
                cotaInferior: String(data.cotaMinimaM ?? ''),
                saihEstacion: data.saihEstacionCodigo || '',
                saihSenales: (data.senalesAsignadas || []).map((x) => ({
                id_sensor: x.senal?.codigo,
                nombre_sensor: x.alias || x.senal?.nombre || x.senal?.codigo,
                })),
                numeroCompuertas: (data.compuertas || []).length || 0,
                compuertas: (data.compuertas || []).map((c, i) => ({
                id: i + 1,
                altura: String(c.cotaTomaM ?? ''),
                maximoCaudal: String(c.caudalSalidaActual ?? ''),
                })),
                sensores: (data.sensores || []).map((s, i) => ({
                id: i + 1,
                tipo: s.tipo,
                nombre: `Sensor de ${s.tipo}`,
                altura: String(s.valorActual ?? ''),
                })),
            });
            } catch (error) {
            setErrorEstado(error.message || 'Error cargando embalse');
            }
        };

        cargarEmbalse();
    }, [modoEdicion, embalseIdEditar]);

    useEffect(() => {
        if (mensajeEstado && modoEdicion && !redirected.current) {
            redirected.current = true;
            const timer = setTimeout(() => {
                navigate('/configuracion-embalse');
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [mensajeEstado, modoEdicion, navigate]);

    useEffect(() => {
        const cargarCatalogoSaih = async () => {
            try {
                const resp= await fetch('/diccionario_saih.json');
                if (!resp.ok) return console.error("Error al cargar catálogo SAIH:", resp.statusText);
                const data = await resp.json();

                if (data && typeof data === 'object') {
                    setCatalogoSaih(data);
                }
            } catch (error) {
                console.error("Error al cargar catálogo SAIH:", error);
            }
        };
        
        cargarCatalogoSaih();
    }, []);

    useEffect(() => {
        if (modalExito) {
            const timer = setTimeout(() => {
                setModalExito(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [modalExito]);

    useEffect(() => {
        setMenuAbierto(false);
    }, [vistaActiva]);

    // Mantener la altura de las columnas sincronizada
    useLayoutEffect(() => {
        if (!panelDatosRef.current || typeof ResizeObserver === 'undefined') return;

        const actualizarAlto = () => {
        if (!panelDatosRef.current) return;
        setAltoPanelDatos(Math.ceil(panelDatosRef.current.offsetHeight));
        };

        const observer = new ResizeObserver(() => {
        actualizarAlto();
        });

        actualizarAlto();
        observer.observe(panelDatosRef.current);
        window.addEventListener('resize', actualizarAlto);

        return () => {
        observer.disconnect();
        window.removeEventListener('resize', actualizarAlto);
        };
    }, []);

    //Lógica para cambiar el número de compuertas dinamicamente
    const handleNumCompuertasChange = (e) => {
        const num = parseInt(e.target.value) || 0;
        let nuevasCompuertas = [...formData.compuertas];

        if (num > nuevasCompuertas.length) {
            for (let i = nuevasCompuertas.length + 1; i <= num; i++) {
                nuevasCompuertas.push({ id: i, altura: "", maximoCaudal: "" });
            }
        } else if (num < nuevasCompuertas.length) {
            nuevasCompuertas = nuevasCompuertas.slice(0, num);
        }

        setFormData({ ...formData, numeroCompuertas: num, compuertas: nuevasCompuertas });
    };

    // Lógica para actualizar campos simples (nombre, capacidad, etc.)
    const handleCampoSimpleChange = (campo, valor) => {
        setFormData((prev) => ({ ...prev, [campo]: valor }));
    };

    // Lógica para actualizar campos específicos de cada compuerta
    const handleCambioCompuerta = (compuertaId, campo, valor) => {
        setFormData((prev) => ({
            ...prev,
            compuertas: prev.compuertas.map((c) =>
                c.id === compuertaId ? { ...c, [campo]: valor } : c
            )
        }));
    }

    // Lógica para actualizar campos específicos de cada sensor
    const handleCambioSensor = (sensorId, campo, valor) => {
        setFormData((prev) => ({
            ...prev,
            sensores: prev.sensores.map((s) => {
                if (s.id !== sensorId) return s;

                if (campo === 'tipo') {
                    return {
                        ...s,
                        tipo: valor,
                        nombre: construirNombreSensor(valor, prev.sensores, sensorId)
                    };
                }

                return { ...s, [campo]: valor };
            })
        }));
    };

    const handleBlurCompuerta = (compuertaId) => {
        setCompuertasTocadas((prev) => new Set([...prev, compuertaId]));
    };

    const handleBlurSensor = (sensorId) => {
        setSensoresAlturaTocadas((prev) => new Set([...prev, sensorId]));
    };

    const handleCambioSaihEstacion = (estacion) => {
        setFormData((prev) => ({
            ...prev,
            saihEstacion: estacion,
            saihSenales: []
        }));
    };

    const handleGuardarEmbalse = async () => {
        setGuardando(true);
        setMensajeEstado("");
        setErrorEstado("");

        try {
            const payload = {
                nombre: formData.nombre.trim(),
                capacidadHm3: parseNumero(formData.capacidadTotal, null),
                cotaMaximaM: parseNumero(formData.cotaSuperior, null),
                cotaMinimaM: parseNumero(formData.cotaInferior, null),
                saihEstacionCodigo: formData.saihEstacion || null,
                saihIdPunto: estacionActiva?.id_punto || null,
                sensores: formData.sensores.map((sensor) => ({
                    tipo: sensor.tipo,
                    valorActual: parseNumero(sensor.altura, 0)
                })),
                compuertas: formData.compuertas.map((compuerta, indice) => ({
                    nombre: `Compuerta ${indice + 1}`,
                    cotaTomaM: parseNumero(compuerta.altura, null),
                    estadoAperturaPorcentaje: 0,
                    caudalSalidaActual: parseNumero(compuerta.maximoCaudal, 0)
                })),
                senalesAsignadas: formData.saihSenales.map((senal) => ({
                    codigo : senal.id_sensor,
                    nombre: senal.nombre_sensor
                }))
            };

            if (!payload.nombre) {
                throw new Error("El nombre del embalse es obligatorio");
            }

            if (!Number.isFinite(payload.capacidadHm3) || !Number.isFinite(payload.cotaMaximaM) || !Number.isFinite(payload.cotaMinimaM)) {
                throw new Error('Debes completar capacidad y cotas con valores válidos');
            }

            if (payload.cotaMinimaM >= payload.cotaMaximaM) {
                throw new Error('La cota inferior debe ser menor que la cota superior');
            }

            const url = modoEdicion
                ? `/api/embalses/${embalseIdEditar}`
                : '/api/embalses';
            
            const metodo = modoEdicion ? 'PUT' : 'POST';

            const respuesta = await apiFetch(url, {
                method: metodo,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(data?.message || 'Error al guardar el embalse');
            }

            if (modoEdicion) {
                setMensajeEstado("Embalse actualizado correctamente");
            } else {
                setMensajeEstado("Embalse guardado correctamente");
                setFormData({
                    nombre: "",
                    capacidadTotal: "",
                    cotaSuperior: "",
                    cotaInferior: "",
                    saihEstacion: "",
                    saihSenales: [],
                    numeroCompuertas: 2,
                    compuertas: [
                        {id: 1, altura: "850", maximoCaudal: ""},
                        {id: 2, altura: "830", maximoCaudal: ""}
                    ],
                    sensores: [
                        { id: 1, tipo: 'Oxígeno', nombre: 'Sensor de Oxígeno', altura: '' },
                    ]
                });
            }
        } catch (error) {
            setErrorEstado(error.message || "Error al guardar el embalse");
        } finally {
            setGuardando(false);
        }
    };

    const toggleSenalSaih = (senal) => {
        setFormData((prev) => {
            const existe = prev.saihSenales.some((s) => s.id_sensor === senal.id_sensor);
            if (existe) {
                return {
                    ...prev,
                    saihSenales: prev.saihSenales.filter((s) => s.id_sensor !== senal.id_sensor)
                };
            }
            return {
                ...prev,
                saihSenales: [
                    ...prev.saihSenales,
                    {
                        id_sensor: senal.id_sensor,
                        nombre_sensor: senal.nombre_sensor
                    }
                ]
            };
        });
    };

    const validarCota = (valor) => {
        if (valor === null || valor === undefined || valor === '') return null; 
        const cotaMin = parseNumero(formData.cotaInferior, 900);
        const cotaMax = parseNumero(formData.cotaSuperior, 960);
        const altura = parseNumero(valor, null);
        if (altura === null) return null;
        if (altura < cotaMin || altura > cotaMax) {
        return `Debe estar entre ${cotaMin} y ${cotaMax}`;
        }
        return null;
    };
  
    const parseNumero = (valor, fallback = 0) => {
        if (valor === null || valor === undefined || valor === '') return fallback;
        const n = parseFloat(String(valor).replace(',', '.'));
        return Number.isFinite(n) ? n : fallback;
    };

    const estacionActiva = formData.saihEstacion ? catalogoSaih[formData.saihEstacion] : null;
    const sensoresSaihDisponibles = estacionActiva?.sensores || [];
    const estacionesSaihDisponibles = Object.keys(catalogoSaih)
        .filter((codigo) => /^E.+_.+/.test(codigo))
        .sort((a, b) => a.localeCompare(b));
       
    /* Bloque de Lógica para Sensores */

    const SENSOR_OPTIONS = [
        { tipo: 'Oxígeno', nombre: 'Sensor de Oxígeno' },
        { tipo: 'Temperatura', nombre: 'Sensor de Temperatura' },
        { tipo: 'Turbidez', nombre: 'Sensor de Turbidez' }
    ];

    const getSensorIcon = (tipo) => {
        if (!tipo) return <Gauge size={18} />;
        if (tipo.includes('Oxígeno')) return <Wind size={18} />;
        if (tipo.includes('Temperatura')) return <Thermometer size={18} />;
        if (tipo.includes('Turbidez')) return <Eye size={18} />;
        return <Gauge size={18} />;
    };

    const construirNombreSensor = (tipo) => {
        return `Sensor de ${tipo}`;
    };

    // Lógica para añadir un nuevo sensor
    const anadirSensor = () => {
        const nuevoId = formData.sensores.length + 1;
        const inicial = SENSOR_OPTIONS[0];

        setFormData({
            ...formData,
            sensores: [
                ...formData.sensores,
                {
                    id: nuevoId,
                    tipo: inicial.tipo,
                    nombre: inicial.nombre,
                    altura: ''
                }
            ]
        });
    };

    const handleEliminarSensor = (sensorId) => {
        setFormData((prev) => ({
            ...prev,
            sensores: prev.sensores.filter((s) => s.id !== sensorId)
        }));
    };

    /* Bloque de lógica para Infografía */
    const capacidadPreview = parseNumero(formData.capacidadTotal, 0);
    const cotaMaxPreview = parseNumero(formData.cotaSuperior, 960);
    const cotaMinPreview = parseNumero(formData.cotaInferior, 800);
    const volumenPreview = capacidadPreview > 0 ? Number((capacidadPreview * 0.55).toFixed(2)) : 0;
    const nivelDefault = cotaMinPreview + (cotaMaxPreview - cotaMinPreview) / 2;
    const nivelPreview = nivelDefault;
    const caudalEntradaPreview = 8;
    // Calcular caudal de salida sumando caudales máximos de compuertas (con defaultde 2.5 m³/s por compuerta si no están especificados)
    const caudalSalidaPreview = formData.compuertas.reduce((total, compuerta) => {
        const caudal = parseNumero(compuerta.maximoCaudal, 2.5);
        return total + caudal;
    }, 0);
    const porcentajePreview = capacidadPreview > 0 ? Math.min(100, Math.max(0, Number(((volumenPreview / capacidadPreview) * 100).toFixed(1)))) : 0;

    const datoPreview = {
        porcentaje: porcentajePreview,
        volumen: volumenPreview,
        nivel: nivelPreview,
        temperatura: 0,
        precipitacion: 0,
        caudalEntrada: caudalEntradaPreview,
        caudalSalida: caudalSalidaPreview,
        timestamp: '--/--/-- --:--',
        cotaMaximaM: cotaMaxPreview,
        cotaMinimaM: cotaMinPreview
    };


    return (
        <div className='App'>
            <AppHeader />
                {/* Modal de éxito */}
                {modalExito && (
                    <div className="modal-overlay" onClick={() => setModalExito(false)}>
                        <div className="modal-contenido" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-icono">
                                <CheckCircle size={56}  className="modal-check-icon"/>
                            </div>
                            <h2 className="modal-titulo">¡Embalse guardado!</h2>
                            <p className="modal-texto">El embalse se ha creado correctamente en el sistema.</p>
                            <button className="modal-boton" onClick={() => setModalExito(false)}>
                                Continuar
                            </button>
                        </div>
                    </div>
                )}

                <main >
                    <div className="main-superior">
                        <h2 className="main-h2">
                            {modoEdicion ? 'Editar embalse' : 'Añadir embalse'}
                        </h2>
                        <div className="embalse-selector-wrap">
                            <button disabled={guardando} onClick={handleGuardarEmbalse} className="btn-guardar">
                                {guardando ? 'Guardando...' : 'Guardar Embalse'}
                            </button>
                        </div>
                    </div>
                    {mensajeEstado && (
                        <div className="mensaje-estado">
                            {mensajeEstado}
                        </div>
                    )}
                    {errorEstado && (
                        <div className="error-estado">
                            {errorEstado}
                        </div>
                    )}

                    <div className="aniadirEmbalse-grid">

                        {/* Card de Datos del Embalse */}
                        <div className="form-card" ref={panelDatosRef}>
                            <h3 className="form-card-title">Datos del Embalse</h3>

                            <div className="form-card-content">
                                <div className="form-card-campo">
                                    <span className="form-card-label">Nombre del Embalse</span>
                                    <input type="text" value={formData.nombre} onChange={(e) => handleCampoSimpleChange('nombre', e.target.value)} placeholder="Ej: Embalse de Canales" className="form-card-input"/>
                                </div>
                                <div className="form-card-campo">
                                    <span className="form-card-label">Capacidad Total (hm³)</span>
                                    <input type="number" value={formData.capacidadTotal} onChange={(e) => handleCampoSimpleChange('capacidadTotal', e.target.value)} placeholder="Ej: 300" className="form-card-input"/>
                                </div>
                                <div className="form-card-campo">
                                    <span className="form-card-label">Cota Superior (m.s.n.m)</span>
                                    <input type="number" value={formData.cotaSuperior} onChange={(e) => handleCampoSimpleChange('cotaSuperior', e.target.value)} placeholder="Ej: 960" className="form-card-input"/>
                                </div>
                                <div className="form-card-campo">
                                    <span className="form-card-label">Cota Inferior (m.s.n.m)</span>
                                    <input type="number" value={formData.cotaInferior} onChange={(e) => handleCampoSimpleChange('cotaInferior', e.target.value)} placeholder="Ej: 800" className="form-card-input"/>
                                </div>
                                <div className="form-card-campo">
                                    <span className="form-card-label">Número de Compuertas</span>
                                    <input type="number" min="1" max="8" value={formData.numeroCompuertas} onChange={handleNumCompuertasChange} className="form-card-input"/>
                                </div>

                                {/* Listado de Compuertas Dinámicas */}

                                <div className="compuertas-grid">
                                    {formData.compuertas.map((compuerta) => (
                                        <div key={compuerta.id} className="form-card-campo compuerta-campo">
                                            {/* Icono de Compuerta */}
                                            <div className="compuerta-header">
                                                <div className="compuerta-icon">
                                                    < Dam size={18} className="compuerta-icon-svg"/>
                                                </div>
                                                <h4 className="compuerta-title">Compuerta Nº{compuerta.id}</h4>
                                            </div>
                                            <div className="compuerta-contenido">

                                                
                                                <div className="compuerta-inputs">
                                                    <div className="compuerta-input">
                                                        <span className="form-card-label">Cota Compuerta (m.s.n.m):</span>
                                                        {(() => {
                                                            const error = validarCota(compuerta.altura);
                                                            const mostrarError = compuertasTocadas.has(compuerta.id) && error;
                                                            return (
                                                                <input
                                                                    type="number"
                                                                    value={compuerta.altura}
                                                                    onChange={(e) => handleCambioCompuerta(compuerta.id, 'altura', e.target.value)}
                                                                    onBlur={() => handleBlurCompuerta(compuerta.id)}
                                                                    min={cotaMinPreview}
                                                                    max={cotaMaxPreview}
                                                                    placeholder="960"
                                                                    className={`form-card-input ${mostrarError ? "input-error" : ""}`}
                                                                />
                                                            );
                                                        })()}
                                                        {(() => {
                                                            const error = validarCota(compuerta.altura);
                                                            const mostrarError = compuertasTocadas.has(compuerta.id) && error;
                                                            return mostrarError ? (
                                                            <span className="anadir-embalse-error-text">{error}</span>
                                                            ) : null;
                                                        })()}
                                                    </div>

                                                    <div className="compuerta-input">
                                                        <span className="form-card-label">Máximo Caudal (m³/s):</span>
                                                        <input
                                                            type="number"
                                                            value={compuerta.maximoCaudal}
                                                            onChange={(e) => handleCambioCompuerta(compuerta.id, 'maximoCaudal', e.target.value)}
                                                            placeholder="Ej: 50"
                                                            className="form-card-input"
                                                        />
                                                    </div>
                                                      
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Card de Configuración SAIH */}
                        <div
                        className="PanelSaih-card"
                        style={{
                            height: altoPanelDatos ? `${altoPanelDatos}px` : "auto",
                            maxHeight: altoPanelDatos ? `${altoPanelDatos}px` : "none"
                        }}
                        >
                            <h3 className="PanelSaih-title">Configuración SAIH</h3>
                            <div className="PanelSaih-selector">
                                <span className="form-card-label">Selecciona Estación SAIH:</span>
                                <select 
                                    value={formData.saihEstacion}
                                    onChange={(e) => handleCambioSaihEstacion(e.target.value)}
                                    className="form-card-input"
                                >
                                    <option value="">Selecciona una estación</option>
                                    {estacionesSaihDisponibles.map((codigo) => (
                                        <option key={codigo} value={codigo}>
                                            {codigo}
                                        </option>
                                    ))}
                                </select>
                                
                                

                                {estacionActiva && (
                                <div className="PanelSaih-meta">
                                    <p className="PanelSaih-estacion-info">
                                    Punto SAIH: {estacionActiva.id_punto} | Señales disponibles: {sensoresSaihDisponibles.length}
                                    </p>

                                    <div className="PanelSaih-counter">
                                    <span className="PanelSaih-counter-label">Seleccionas</span>
                                    <span className="PanelSaih-counter-number">
                                        {formData.saihSenales.length}/ {sensoresSaihDisponibles.length}
                                    </span>
                                    </div>
                                </div>
                                )}

                                {estacionActiva && (
                                    <div className="PanelSaih-list">
                                        <div className="PanelSaih-senales">
                                            {sensoresSaihDisponibles.map((senal) => {
                                                const seleccionada = formData.saihSenales.some((s) => s.id_sensor === senal.id_sensor);
                                                return (
                                                    <div 
                                                        key={senal.id_sensor}
                                                        className={"PanelSaih-senal-item " + (seleccionada ? 'PanelSaih-senal-item-selected' : '')}
                                                    >
                                                        <div className="PanelSaih-senal-content">
                                                            <span className="PanelSaih-senal-nombre">{senal.nombre_sensor}</span>

                                                            <button
                                                                type="button"
                                                                onClick={() => toggleSenalSaih(senal)}
                                                                className={"PanelSaih-senal-btn " + (seleccionada ? 'PanelSaih-senal-btn-selected' : '')}
                                                            >
                                                                {seleccionada ? 'Seleccionada' : 'Seleccionar'}
                                                            </button>
                                                        </div>
                                                        
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Card de Sensores */}
                        <div className="Sensores-card">
                            <div className="Sensores-header">
                                <h3 className="Sensores-title">Sensores</h3>
                                <button onClick={anadirSensor} className="Sensores-btn">
                                    Agregar Sensor
                                </button>
                            </div>

                            <div className="Sensores-list">
                                {formData.sensores.map((sensor) => {
                                    return (
                                        <div key={sensor.id} className="Sensor-item">
                                            <div className="Sensor-icon">
                                                {getSensorIcon(sensor.tipo)}
                                            </div>

                                            <div className="Sensor-delete-btn-wrapper">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEliminarSensor(sensor.id)}
                                                    className="Sensor-delete-btn"
                                                    title="Eliminar sensor"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>

                                            <div className="Sensor-contenido">
                                                <select
                                                    className="Sensor-name-select"
                                                    value={sensor.nombre}
                                                    onChange={(e) => {
                                                        const selected = SENSOR_OPTIONS.find((o) => o.nombre === e.target.value);
                                                        if (!selected) return;
                                                        handleCambioSensor(sensor.id, 'tipo', selected.tipo);
                                                        handleCambioSensor(sensor.id, 'nombre', selected.nombre);
                                                    }}
                                                    aria-label={`Nombre sensor ${sensor.id}`}
                                                >
                                                    {SENSOR_OPTIONS.map((o) => (
                                                    <option key={o.tipo} value={o.nombre}>
                                                        {o.nombre}
                                                    </option>
                                                    ))}
                                                </select>

                                                <div className="Sensor-field">
                                                    <span className="form-card-label">Cota Sensor (m.s.n.m):</span>
                                                    {(() => {
                                                        const error = validarCota(sensor.altura);
                                                        const mostrarError = sensoresAlturaTocadas.has(sensor.id) && error;
                                                        return (
                                                            <input
                                                                type="number"
                                                                value={sensor.altura}
                                                                onChange={(e) => handleCambioSensor(sensor.id, 'altura', e.target.value)}
                                                                onBlur={() => handleBlurSensor(sensor.id)}
                                                                min={cotaMinPreview}
                                                                max={cotaMaxPreview}
                                                                placeholder="930"
                                                                className={`form-card-input ${mostrarError ? "input-error" : ""}`}
                                                            />
                                                        );
                                                    })()}
                                                    {(() => {
                                                        const error = validarCota(sensor.altura);
                                                        const mostrarError = sensoresAlturaTocadas.has(sensor.id) && error;
                                                        return mostrarError ? (
                                                        <span className="anadir-embalse-error-text">{error}</span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        {/* Card para la vista del nuevo embalse */}
                        <div className="Infografia-card">
                            <EmbalseInfografia
                                embalseNombre={formData.nombre?.trim() || "Nombre del Embalse"}
                                datoActual={datoPreview}
                                compuertas={formData.compuertas}
                            />
                        </div>

                        {/* BOTÓN GUARDAR INFERIOR */}
                        <div className="anadir-embalse-footer-btn">
                            <button disabled={guardando} onClick={handleGuardarEmbalse}  className="btn-guardar-footer">
                                {guardando ? 'Guardando...' : 'Guardar Embalse'}
                            </button>
                        </div>
                        

                    </div>
                </main>
            <AppFooter />
        </div>
    );

}

export default AniadirEmbalse;
