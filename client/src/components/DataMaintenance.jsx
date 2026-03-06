import { useState, useEffect } from 'react'
import { apiFetch, uploadDataFile, executeDataScript, downloadResultFile } from '../api'

// cargar lista de scripts desde la configuración compartida
import scripts from '../config/dataMaintenance.json'

export default function DataMaintenance({ showToast }) {
    const [fileStatus, setFileStatus] = useState({})
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState({})
    const [executing, setExecuting] = useState(null) // 'master', 'bom', 'transform'
    const [uploading, setUploading] = useState(null) // fileName being uploaded

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
            // Refrescar estado inmediatamente
            await checkStatus()
            setResults(prev => ({
                ...prev,
                [expectedName + '_upload']: {
                    status: 'success',
                    message: `Archivo ${expectedName} subido correctamente. Ahora puedes cargar el siguiente archivo si corresponde.`,
                    output: `> [${new Date().toLocaleTimeString()}] Archivo ${file.name} subido correctamente.\n> Esperando el siguiente archivo o proceso...`
                }
            }))
            // alert eliminado: solo feedback visual en consola
        } catch (err) {
            console.error('Upload error:', err)
            setResults(prev => ({
                ...prev,
                [expectedName + '_upload']: {
                    status: 'error',
                    message: `Error al subir archivo: ${err.message}`,
                    output: `> [${new Date().toLocaleTimeString()}] Error al subir archivo: ${err.message}`
                }
            }))
            // alert eliminado: solo feedback visual en consola
        } finally {
            setUploading(null)
            e.target.value = null // Reset input
        }
    }

    const runScript = async (scriptId, label) => {
        if (!window.confirm(`¿Estás seguro de iniciar el proceso: ${label}?`)) return

        setExecuting(scriptId)
        setLoading(true)
        setResults(prev => ({ ...prev, [scriptId]: { status: 'running', message: 'Ejecutando...' } }))

        try {
            const data = await executeDataScript(scriptId)
            setResults(prev => ({
                ...prev,
                [scriptId]: { status: 'success', message: data.message, output: data.output }
            }))
        } catch (err) {
            setResults(prev => ({
                ...prev,
                [scriptId]: { status: 'error', message: err.message }
            }))
        } finally {
            setLoading(false)
            setExecuting(null)
            checkStatus() // Refresh file status
        }
    }


    return (
        <div className="flex flex-col gap-6 overflow-auto h-full p-2 lg:p-4 bg-[#e8ecf1]">
            <div className="ebs-form-region overflow-hidden flex flex-col mb-2">
                <div className="ebs-form-region-header text-sm py-2 px-3 flex items-center justify-between shadow-sm">
                    <span>Módulo de Integración Oracle EBS - Mantenimiento</span>
                </div>
                <div className="p-4 bg-white border-b-2 border-[#c9930a]">
                    <p className="text-sm text-gray-700 font-medium">Panel de control unificado para ingesta de artículos, extracción de grafos y transformación Mepal BOM.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {scripts.map(s => (
                    <div key={s.id} className="ebs-form-region flex flex-col h-full bg-[#fcfcfd]">
                        <div className="ebs-form-region-header flex items-center justify-between border-b border-[#3a5a8a]">
                            <span className="font-semibold tracking-wide flex items-center gap-2">
                                {s.id === 'master' && '📁'}
                                {s.id === 'bom' && '📊'}
                                {s.id === 'transform' && '⚙️'}
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
                                {s.files.length === 0 && (
                                    <div className="bg-[#f8f9fa] border border-[#e5e7eb] p-3 rounded-sm text-center italic text-xs text-gray-500 shadow-inner">
                                        Generación puramente en memoria.
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 mt-auto border-t border-gray-200 flex flex-col gap-2">
                                {s.outputFile && fileStatus[s.outputFile] && (
                                    <button
                                        onClick={() => downloadResultFile(s.outputFile)}
                                        className="ebs-btn w-full py-2 flex items-center justify-center font-bold tracking-wide shadow-sm border-[#3a5a8a] text-[#3a5a8a] hover:bg-[#ebf0f7]"
                                    >
                                        📥 DESCARGAR RESULTADO CSV
                                    </button>
                                )}
                                <button
                                    onClick={() => runScript(s.id, s.title)}
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
        </div>
    )
}
