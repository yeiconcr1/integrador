import { useState, useEffect } from 'react'
import { apiFetch, uploadDataFile, executeDataScript } from '../api'

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
        <div className="flex flex-col gap-4 overflow-auto h-full p-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {scripts.map(s => (
                    <div key={s.id} className="ebs-form-region bg-white flex flex-col">
                        <div className="ebs-form-region-header !bg-[#f8f8f8] !text-[#1a3a5c] border-b border-[#ccc]">
                            {s.title}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-3">
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                                {s.description}
                            </p>

                            <div className="flex flex-col gap-1 mt-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tight">Archivos Requeridos:</span>
                                {s.files.map(f => (
                                    <div key={f} className="flex flex-col gap-1 mb-2">
                                        <div className="flex items-center gap-2 text-[11px]">
                                            <div className={`w-2 h-2 rounded-full ${fileStatus[f] ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                            <span className={fileStatus[f] ? 'text-gray-700' : 'text-red-600 font-semibold'}>{f}</span>
                                            {fileStatus[f] && <span className="text-[9px] text-green-600 font-bold ml-auto">LISTO</span>}
                                        </div>
                                        <label className="flex items-center gap-1 cursor-pointer group">
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept=".txt,.csv"
                                                onChange={(e) => handleFileUpload(e, f)}
                                                disabled={uploading !== null}
                                            />
                                            <div className={`text-[10px] px-2 py-0.5 rounded border border-[#ccc] bg-[#f0f0f0] group-hover:bg-white transition-colors flex items-center gap-1 ${uploading === f ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                {uploading === f ? (
                                                    <div className="w-2 h-2 border-2 border-gray-400 border-t-blue-600 rounded-full animate-spin"></div>
                                                ) : (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 8l-4-4m0 0L8 8m4-4v12" strokeWidth="2" /></svg>
                                                )}
                                                {fileStatus[f] ? 'Actualizar Archivo' : 'Cargar Archivo'}
                                            </div>
                                        </label>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-auto pt-4 flex flex-col gap-2 relative">
                                <button
                                    onClick={() => runScript(s.id, s.title)}
                                    disabled={loading || executing === s.id}
                                    className={`w-full py-2.5 rounded-md font-semibold text-[12px] transition-all shadow-sm ${executing === s.id
                                            ? 'bg-blue-300 text-white cursor-wait'
                                            : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-[0.98]'
                                        }`}
                                >
                                    {executing === s.id ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Ejecutando...
                                        </span>
                                    ) : (
                                        'Ejecutar Proceso'
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
