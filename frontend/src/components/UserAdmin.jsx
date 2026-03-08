import { useState, useEffect, useRef } from 'react'

const ADMIN_EMAIL = 'admin@omega.com';
import { fetchUsuarios, createUsuario, updateUsuario, deleteUsuario } from '../api'
import DataMaintenance from './DataMaintenance'

export default function UserAdmin() {
    const [activeTab, setActiveTab] = useState('users') // 'users' or 'data'
    const [usuarios, setUsuarios] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingUser, setEditingUser] = useState(null)
    const [deleteConfirm, setDeleteConfirm] = useState(null) // { id, email }
    const deleteRef = useRef(null)

    // Form state
    const [email, setEmail] = useState('')
    const [nombre, setNombre] = useState('')
    const [password, setPassword] = useState('')
    const [rol, setRol] = useState('disenador')
    const [formError, setFormError] = useState('')

    useEffect(() => {
        if (activeTab === 'users') loadUsuarios()
    }, [activeTab])

    const loadUsuarios = async () => {
        try {
            setLoading(true)
            const data = await fetchUsuarios()
            setUsuarios(data)
            setError(null)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const openModal = (user = null) => {
        setFormError('')
        if (user) {
            setEditingUser(user)
            setEmail(user.email)
            setNombre(user.nombre)
            setPassword('') // Don't show existing password
            setRol(user.rol)
        } else {
            setEditingUser(null)
            setEmail('')
            setNombre('')
            setPassword('')
            setRol('disenador')
        }
        setModalOpen(true)
    }

    const closeModal = () => {
        setModalOpen(false)
        setEditingUser(null)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setFormError('')

        if (!email || !nombre) {
            setFormError('Email y nombre son obligatorios')
            return
        }
        if (!editingUser && !password) {
            setFormError('La contraseña es obligatoria para usuarios nuevos')
            return
        }

        try {
            if (editingUser) {
                const data = { email, nombre, rol }
                if (password) data.password = password // Only update password if provided
                await updateUsuario(editingUser.id, data)
            } else {
                await createUsuario({ email, password, nombre, rol })
            }
            closeModal()
            loadUsuarios()
        } catch (err) {
            setFormError(err.message)
        }
    }

    const handleDelete = (id, userEmail) => {
        setDeleteConfirm({ id, email: userEmail })
        deleteRef.current?.showModal()
    }

    const confirmDelete = async () => {
        if (!deleteConfirm) return
        try {
            await deleteUsuario(deleteConfirm.id)
            setDeleteConfirm(null)
            deleteRef.current?.close()
            loadUsuarios()
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <div className="p-4 flex flex-col gap-3 max-w-5xl mx-auto w-full h-full overflow-hidden">

            {/* EBS Style Tabs */}
            <div className="flex items-end gap-1 px-1 border-b border-[#a0a0a0]">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-1.5 text-[11px] font-bold rounded-t-[2px] border-x border-t transition-all ${activeTab === 'users'
                        ? 'bg-[#1a3a5c] text-white border-[#1a3a5c] shadow-[0_-2px_4px_rgba(0,0,0,0.1)]'
                        : 'bg-[#e1e1e1] text-[#666] border-[#a0a0a0] hover:bg-[#d5d5d5]'
                        }`}
                >
                    GESTIÓN DE USUARIOS
                </button>
                <button
                    onClick={() => setActiveTab('data')}
                    className={`px-4 py-1.5 text-[11px] font-bold rounded-t-[2px] border-x border-t transition-all ${activeTab === 'data'
                        ? 'bg-[#1a3a5c] text-white border-[#1a3a5c] shadow-[0_-2px_4px_rgba(0,0,0,0.1)]'
                        : 'bg-[#e1e1e1] text-[#666] border-[#a0a0a0] hover:bg-[#d5d5d5]'
                        }`}
                >
                    MANTENIMIENTO DE DATOS
                </button>
            </div>

            {/* Oracle EBS Form Region */}
            <div className="ebs-form-region flex-1 flex flex-col overflow-hidden">
                {activeTab === 'users' ? (
                    <>
                        <div className="ebs-form-region-header flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeWidth="2" /></svg>
                                Administración de Usuarios
                            </div>
                            <button onClick={() => openModal()} className="ebs-btn ebs-btn-primary flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" d="M12 5v14M5 12h14" strokeWidth="2.5" /></svg>
                                Nuevo Usuario
                            </button>
                        </div>

                        {error && (
                            <div className="p-2 m-3 bg-red-100 border border-red-300 text-red-700 text-[11px] font-semibold flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2" /></svg>
                                {error}
                            </div>
                        )}

                        <div className="flex-1 overflow-auto bg-white p-3">
                            {loading && usuarios.length === 0 ? (
                                <div className="p-4 text-[11px] font-semibold text-gray-500">Cargando usuarios...</div>
                            ) : (
                                <table className="ebs-table w-full">
                                    <thead>
                                        <tr>
                                            <th>Nombre Completo</th>
                                            <th>Correo Electrónico</th>
                                            <th>Rol</th>
                                            <th className="text-center w-24">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {usuarios.map(user => (
                                            <tr key={user.id}>
                                                <td className="font-semibold text-[#1a3a5c]">{user.nombre}</td>
                                                <td>{user.email}</td>
                                                <td>
                                                    <span className={`inline-block px-1.5 py-0.5 rounded-[2px] border ${user.rol === 'admin' ? 'bg-[#162744]/10 text-[#162744] border-[#162744]/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'} font-bold`}>
                                                        {user.rol === 'admin' ? 'Administrador' : 'Diseñador'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <button onClick={() => openModal(user)} className="text-[#3a5a8a] hover:bg-[#d5def0] p-1 rounded transition-colors" title="Editar">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" strokeWidth="2" /></svg>
                                                        </button>
                                                        <button onClick={() => handleDelete(user.id, user.email)} disabled={user.email === ADMIN_EMAIL} className="text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent p-1 rounded transition-colors" title="Eliminar">
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeWidth="2" /></svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {usuarios.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan="4" className="text-center py-8 text-gray-500 font-semibold">No hay usuarios registrados.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="ebs-form-region-header flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeWidth="2" /></svg>
                                Mantenimiento del Sistema de Datos
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden p-3 bg-white">
                            <DataMaintenance />
                        </div>
                    </>
                )}
            </div>

            {/* Modal Formulario (Estilo EBS Dialog) */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-[#f0f0f0] border border-[#a0a0a0] shadow-[0_4px_12px_rgba(0,0,0,0.3)] w-[380px] flex flex-col">

                        <div className="bg-[#1a3a5c] text-white px-3 py-1.5 flex justify-between items-center cursor-default">
                            <span className="text-[11px] font-bold tracking-wide">
                                {editingUser ? 'EDITAR USUARIO' : 'NUEVO USUARIO'}
                            </span>
                            <button onClick={closeModal} className="hover:bg-white/20 p-0.5 rounded transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" strokeWidth="2" /></svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-3 flex flex-col gap-3">
                            {formError && (
                                <div className="bg-red-100 border border-red-300 text-red-700 px-2 py-1 text-[10px] font-bold">
                                    {formError}
                                </div>
                            )}

                            <div className="flex flex-col gap-1">
                                <label className="ebs-label">Nombre Completo <span className="text-red-500">*</span></label>
                                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="ebs-input" placeholder="Ej. Juan Pérez" />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="ebs-label">Correo Electrónico <span className="text-red-500">*</span></label>
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={editingUser && editingUser.email === ADMIN_EMAIL} className="ebs-input disabled:bg-gray-200" placeholder="correo@ejemplo.com" />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="ebs-label">
                                    Contraseña {!editingUser && <span className="text-red-500">*</span>}
                                </label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="ebs-input" placeholder={editingUser ? '(Dejar en blanco para no cambiar)' : '••••••••'} />
                            </div>

                            <div className="flex flex-col gap-1">
                                <label className="ebs-label">Rol <span className="text-red-500">*</span></label>
                                <select value={rol} onChange={e => setRol(e.target.value)} disabled={editingUser && editingUser.email === ADMIN_EMAIL} className="ebs-input disabled:bg-gray-200">
                                    <option value="disenador">Diseñador</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            <div style={{ background: 'linear-gradient(180deg, #dfe6ed, #c8d1db)', borderTop: '1px solid #a0aec0', padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                <button type="button" onClick={closeModal} className="ebs-btn bg-white">Cancelar</button>
                                <button type="submit" className="ebs-btn ebs-btn-primary">Guardar Usuario</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Eliminación */}
            <dialog ref={deleteRef} style={{ border: 'none', background: 'transparent' }} className="p-0 backdrop:bg-black/40">
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4 pointer-events-none">
                    <div className="modal-box p-0 border border-[#b0bec5] shadow-2xl rounded-sm overflow-hidden min-w-[380px] pointer-events-auto">
                        <div style={{ background: 'linear-gradient(180deg, #4a6fa5 0%, #3a5a8a 100%)', padding: '6px 12px', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" strokeWidth="2.5" /></svg>
                            Confirmar eliminación
                        </div>
                        <div style={{ background: '#f7f8fa', padding: '16px' }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0 }}>¿Eliminar este usuario?</p>
                            {deleteConfirm && (
                                <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>
                                    Se eliminará permanentemente la cuenta de <strong>{deleteConfirm.email}</strong>. Esta acción no se puede deshacer.
                                </p>
                            )}
                        </div>
                        <div style={{ background: 'linear-gradient(180deg, #dfe6ed, #c8d1db)', borderTop: '1px solid #a0aec0', padding: '10px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button onClick={() => { deleteRef.current?.close(); setDeleteConfirm(null) }} className="ebs-btn">
                                Cancelar
                            </button>
                            <button onClick={confirmDelete} className="ebs-btn ebs-btn-danger">
                                Eliminar Usuario
                            </button>
                        </div>
                    </div>
                </div>
            </dialog>
        </div>
    )
}
