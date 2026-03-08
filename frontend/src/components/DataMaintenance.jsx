import { useState, useEffect, useRef } from 'react'
import { apiFetch, uploadDataFile, executeDataScript, downloadResultFile } from '../api'

// cargar lista de scripts desde la configuración compartida
import scripts from '../config/dataMaintenance.json'

export default function DataMaintenance({ showToast }) {
    const [fileStatus, setFileStatus] = useState({})
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState({})
    const [executing, setExecuting] = useState(null)
    const [uploading, setUploading] = useState(null)
    const [confirmModal, setConfirmModal] = useState(null) // { id, label }
    const modalRef = useRef(null)

    useEffect(() => {
        checkStatus()
    }, [])

    const checkStatus = async () => {
        try {
            const data = await apiFetch('/admin/data/status')
            setFileStatus(data.files || {})
        } catch (err) {
            console.error('Error checking status:', err)
        }
    }

    const handleFileUpload = async (e, expectedName) => {
        const file = e.target.files[0]
        if (!file) return

        setUploading(expectedName)
        setResults(prev => ({
            ...prev,
            [expectedName + '_upload']: {
                status: 'running',
                message: `Cargando archivo ${expectedName}...`,
                output: `> [${new Date().toLocaleTimeString()}] Iniciando carga de archivo: ${file.name}`
            }
        }))
        try {
            await uploadDataFile(file, expectedName)
            await checkStatus()
            setResults(prev => ({
                ...prev,
                [expectedName + '_upload']: {
                    status: 'success',
                    message: `Archivo ${expectedName} actualizado.`,
                    output: `> [${new Date().toLocaleTimeString()}] Archivo ${file.name} subido correctamente.`
                }
            }))
            showToast(`Archivo ${expectedName} cargado con éxito`, 'success')
        } catch (err) {
            console.error('Upload error:', err)
            setResults(prev => ({
                ...prev,
                [expectedName + '_upload']: {
                    status: 'error',
                    message: `Error: ${err.message}`,
                    output: `> [${new Date().toLocaleTimeString()}] Error: ${err.message}`
                }
            }))
            showToast(`Error de carga: ${err.message}`, 'error')
        } finally {
            setUploading(null)
            e.target.value = null
        }
    }

    const triggerScript = (scriptId, label) => {
        setConfirmModal({ id: scriptId, label })
        modalRef.current?.showModal()
    }

    const handleConfirmRun = () => {
        if (!confirmModal) return
        const { id, label } = confirmModal
        modalRef.current?.close()
        runScript(id, label)
    }

    const runScript = async (scriptId, label) => {

        setExecuting(scriptId)
        setLoading(true)
        setResults(prev => ({ ...prev, [scriptId]: { status: 'running', message: 'Procesando rutina...' } }))

        try {
            const data = await executeDataScript(scriptId)
            setResults(prev => ({
                ...prev,
                [scriptId]: { status: 'success', message: data.message, output: data.output }
            }))
            showToast(`Rutina "${label}" completada con éxito`, 'success')
        } catch (err) {
            setResults(prev => ({
                ...prev,
                [scriptId]: { status: 'error', message: err.message }
            }))
            showToast(`Error en la rutina: ${err.message}`, 'error')
        } finally {
            setLoading(false)
            setExecuting(null)
            checkStatus()
            setConfirmModal(null)
        }
    }

    return (
        <div className="flex flex-col gap-6 overflow-auto h-full p-2 lg:p-4 bg-[#e8ecf1]">
            <div className="ebs-form-region overflow-hidden flex flex-col mb-2">
                <div className="ebs-form-region-header text-sm py-2 px-3 flex items-center justify-between shadow-sm">
                    <span>Módulo de Integración Oracle EBS - Mantenimiento</span>
                </div>
                <div className="p-4 bg-white border-b-2 border-[#c9930a]">
                    <p className="text-sm text-gray-700 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Panel de control unificado para ingesta de artículos, extracción de grafos y transformación Mepal BOM.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {scripts.map(s => (
                    <div key={s.id} className="ebs-form-region flex flex-col h-full bg-[#fcfcfd]">
                        <div className="ebs-form-region-header flex items-center justify-between border-b border-[#3a5a8a]">
                            <span className="font-semibold tracking-wide flex items-center gap-2">
                                {s.id === 'ingest-master' && '📁'}
                                {s.id === 'ingest-bom' && '📊'}
                                {s.id === 'transform-bom' && '⚙️'}
                                {s.title}
                            </span>
                        </div>

                        <div className="p-5 flex-1 flex flex-col">
                            <p className="text-xs text-gray-600 mb-6 border-b border-gray-200 pb-3 leading-relaxed">
                                {s.description}
                            </p>

                            <div className="flex flex-col gap-3 flex-1">
                                {s.files.length > 0 && <span className="ebs-label block mb-1 text-[#1a3a5c]">ARCHIVOS ORIGEN</span>}
                                {s.files.map(f => (
                                    <div key={f} className="flex flex-col gap-2 bg-[#f4f7fa] border border-[#d1d9e2] p-3 rounded-sm shadow-sm relative">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-sm border ${fileStatus[f] ? 'bg-[#4a9c5a] border-[#2a6a3a]' : 'bg-[#d94f4f] border-[#922]'}`}></div>
                                                <span className={`text-[12px] font-bold font-mono tracking-tight ${fileStatus[f] ? 'text-gray-800' : 'text-red-700'}`}>{f}</span>
                                            </div>
                                            {fileStatus[f] ? (
                                                <span className="text-[10px] font-bold text-[#3a7c4a] bg-[#e6f4ea] px-2 py-0.5 rounded border border-[#b7e1c1]">DETECTADO</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-[#c53030] bg-[#fff5f5] px-2 py-0.5 rounded border border-[#feb2b2]">FALTANTE</span>
                                            )}
                                        </div>

                                        <label className="flex items-center justify-center gap-2 cursor-pointer mt-1">
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept=".txt,.csv"
                                                onChange={(e) => handleFileUpload(e, f)}
                                                disabled={uploading !== null}
                                            />
                                            <div className={`ebs-btn w-full text-center flex justify-center items-center py-1.5 transition-opacity ${uploading === f ? 'opacity-50 pointer-events-none' : ''}`}>
                                                {uploading === f ? (
                                                    <span className="text-gray-600 flex items-center gap-2">
                                                        <div className="w-3 h-3 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin"></div>
                                                        SUBIENDO...
                                                    </span>
                                                ) : (
                                                    <span>{fileStatus[f] ? 'REEMPLAZAR ARCHIVO' : 'SUBIR ARCHIVO'}</span>
                                                )}
                                            </div>
                                        </label>
                                    </div>
                                ))}

                                {s.outputFile && (
                                    <div className="mt-2">
                                        <span className="ebs-label block mb-1 text-[#1a3a5c]">ARCHIVO RESULTADO</span>
                                        <div className={`flex items-center justify-between bg-white border border-dashed ${fileStatus[s.outputFile] ? 'border-[#4a9c5a] bg-[#f0f9f1]' : 'border-gray-300'} p-3 rounded-sm`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2.5 h-2.5 rounded-sm border ${fileStatus[s.outputFile] ? 'bg-[#4a9c5a] border-[#2a6a3a]' : 'bg-gray-300 border-gray-400'}`}></div>
                                                <span className="text-[12px] font-mono text-gray-700">{s.outputFile}</span>
                                            </div>
                                            {fileStatus[s.outputFile] ? (
                                                <span className="text-[10px] font-bold text-[#3a7c4a]">GENERADO</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-gray-400">PENDIENTE</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 mt-auto border-t border-gray-200 flex flex-col gap-2">
                                {s.outputFile && fileStatus[s.outputFile] && (
                                    <button
                                        onClick={() => downloadResultFile(s.outputFile)}
                                        className="ebs-btn-success w-full py-2 flex items-center justify-center font-bold tracking-wide shadow-sm"
                                    >
                                        📥 DESCARGAR RESULTADO CSV
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => triggerScript(s.id, s.title)}
                                    disabled={loading || executing === s.id}
                                    className={`ebs-btn-primary w-full py-2 flex items-center justify-center font-bold tracking-wide shadow-sm disabled:opacity-60 disabled:cursor-not-allowed`}
                                >
                                    {executing === s.id ? (
                                        <span className="flex items-center gap-2">
                                            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                                            PROCESANDO...
                                        </span>
                                    ) : (
                                        'EJECUTAR RUTINA'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Confirmación de Rutina */}
            <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle p-0 backdrop:bg-black/40">
                <div className="modal-box p-0 border border-[#b0bec5] shadow-2xl rounded-sm overflow-hidden min-w-[450px]">
                    <div style={{ background: 'linear-gradient(180deg, #4a6fa5 0%, #3a5a8a 100%)', padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" strokeWidth="2.5" /></svg>
                        Confirmar ejecución de rutina
                    </div>
                    <div style={{ background: '#f7f8fa', padding: '16px' }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>¿Ejecutar esta rutina de mantenimiento?</p>
                        {confirmModal && (
                            <div className="mt-3 space-y-3">
                                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, padding: '10px 12px' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1a3a5c', background: '#e0e7ff', padding: '2px 6px', borderRadius: 2 }}>RUTINA</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{confirmModal.label}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                                        Esta acción procesará los archivos maestros cargados y actualizará la base de datos técnica.
                                        Puede tardar varios minutos dependiendo del volumen de datos.
                                    </p>
                                </div>
                                <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 p-2 border border-amber-200 rounded-sm">
                                    <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2" /></svg>
                                    Asegúrate de que los archivos origen estén actualizados antes de proceder.
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ background: 'linear-gradient(180deg, #dfe6ed, #c8d1db)', borderTop: '1px solid #a0aec0', padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button onClick={() => { modalRef.current?.close(); setConfirmModal(null) }} className="ebs-btn bg-white">
                            Cancelar
                        </button>
                        <button onClick={handleConfirmRun} className="ebs-btn ebs-btn-primary">
                            Continuar y Ejecutar
                        </button>
                    </div>
                </div>
            </dialog>
        </div>
    )
}
