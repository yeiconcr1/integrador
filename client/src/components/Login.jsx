import React, { useState } from 'react';
import { login } from '../api';

export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email || !password) {
            setError('Por favor, ingresa tu correo y contraseña');
            return;
        }

        setLoading(true);
        try {
            const user = await login(email, password);
            onLogin(user);
        } catch (err) {
            setError(err.message || 'Credenciales incorrectas');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
            {/* Fondo de decoración abstracto tipo 'corporativo Mepal' */}
            <div className="absolute top-0 left-0 w-full h-96 bg-[#162744] overflow-hidden -skew-y-3 origin-top-left shadow-2xl z-0">
                {/* Elementos geométricos sutiles */}
                <div className="absolute top-[-50px] right-[-100px] w-96 h-96 bg-white/5 rounded-full blur-3xl"></div>
                <div className="absolute bottom-[-100px] left-[10%] w-64 h-64 bg-[#38bdf8]/10 rounded-full blur-2xl"></div>
            </div>

            <div className="relative z-10 w-full max-w-md">
                {/* Contenedor principal de la tarjeta */}
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden border border-slate-100">

                    {/* Cabecera de la tarjeta con Logo */}
                    <div className="pt-10 pb-6 px-10 text-center">
                        {/* Se usa el logo normal sin invertir, ya que ahora el fondo es blanco */}
                        <img
                            src="/logo-carvajal.png"
                            alt="Carvajal Espacios"
                            className="h-12 mx-auto mb-6 object-contain"
                            style={{ filter: 'brightness(0) saturate(100%) invert(20%) sepia(50%) saturate(1514%) hue-rotate(190deg) brightness(96%) contrast(92%)' }}
                        />
                        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                            Integrador de Pedidos
                        </h2>

                    </div>

                    {/* Formulario */}
                    <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-6">
                        {error && (
                            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm font-medium border border-red-100 flex items-center gap-2 animate-pulse">
                                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeWidth="2" /></svg>
                                {error}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Correo Electrónico
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#162744]/20 focus:border-[#162744] transition-all font-medium"
                                    placeholder="correo@ejemplo.com"
                                    autoComplete="email"
                                    autoFocus
                                />
                                <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="2" /></svg>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Contraseña
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#162744]/20 focus:border-[#162744] transition-all font-medium"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2" /></svg>
                            </div>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-[#162744] hover:bg-[#0f1b2e] text-white py-3 px-4 rounded-lg font-bold tracking-wide transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-70 shadow-lg shadow-[#162744]/20"
                            >
                                {loading ? (
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <>
                                        Iniciar Sesión
                                        <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" strokeWidth="2.5" /></svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Pie de página sutil bajo la tarjeta */}
                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-xs font-medium tracking-wide">
                        &copy; {new Date().getFullYear()} Carvajal Espacios - Mepal. Todos los derechos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
}
