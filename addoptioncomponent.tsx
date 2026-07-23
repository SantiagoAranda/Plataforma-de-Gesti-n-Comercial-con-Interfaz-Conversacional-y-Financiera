import React, { useState } from 'react';
import { Minus, Plus, HelpCircle, Search } from 'lucide-react';

export default function App() {
  // State for the form fields
  const [recursoAsociado, setRecursoAsociado] = useState('ingrediente');
  const [busquedaInsumo, setBusquedaInsumo] = useState('');
  const [nombreVisible, setNombreVisible] = useState('');
  const [precio, setPrecio] = useState(0);
  const [cantidadConsume, setCantidadConsume] = useState(1);
  const [preseleccion, setPreseleccion] = useState(false);
  const [removible, setRemovible] = useState(true);

  // Custom colors from the prompt
  const colors = {
    venta: '#0b3f64', // Azul principal para textos, bordes, botón principal y checkbox
    costoBase: '#c80237', // Rojo para el botón de decrementar (-)
    gananciaBase: '#00963d', // Verde para el botón de incrementar (+)
    textoOscuro: '#000000', // Negro para todos los textos
    bordeClaro: '#e2e8f0', 
    fondoInputs: '#ffffff', 
    fondoSeccionGris: '#f8fafc'
  };

  const handleSave = (e) => {
    e.preventDefault();
    console.log({ recursoAsociado, busquedaInsumo, nombreVisible, precio, cantidadConsume, preseleccion, removible });
    // Handle save logic here
  };

  const handleCancel = () => {
    console.log('Cancel clicked');
    // Handle cancel logic here
  };

  const handleIncrementCantidad = () => {
    setCantidadConsume(prev => prev + 1);
  };

  const handleDecrementCantidad = () => {
    setCantidadConsume(prev => (prev > 1 ? prev - 1 : 1)); // Minimum 1 based on image
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-2 font-sans text-sm">
      
      {/* Main Container Card - Borde Azul Exterior y más estrecho */}
      <div 
        className="bg-white rounded-xl shadow-sm w-full max-w-[320px] overflow-hidden border-2"
        style={{ borderColor: colors.venta }}
      >
        
        {/* Header Section */}
        <div className="px-4 py-2.5 flex justify-between items-center border-b" style={{ borderColor: colors.bordeClaro }}>
          <h2 
            className="text-[10px] uppercase tracking-wide font-normal"
            style={{ color: colors.textoOscuro }}
          >
            + AÑADIR OPCIÓN
          </h2>
          <button 
            type="button"
            onClick={handleCancel}
            className="text-[10px] hover:opacity-80 transition-opacity focus:outline-none font-normal"
            style={{ color: colors.textoOscuro }}
          >
            Cancelar
          </button>
        </div>

        {/* Form Section */}
        <form className="px-4 py-3.5" onSubmit={handleSave}>
          
          {/* Recurso Asociado */}
          <div className="mb-2.5">
            <label 
              className="block text-[9px] uppercase mb-1 font-normal"
              style={{ color: colors.textoOscuro }}
            >
              RECURSO ASOCIADO
            </label>
            <div className="relative">
              <select
                value={recursoAsociado}
                onChange={(e) => setRecursoAsociado(e.target.value)}
                className="w-full px-2.5 py-1.5 border rounded-lg appearance-none focus:outline-none focus:ring-1 focus:ring-opacity-50 transition-shadow cursor-pointer text-[12px] font-normal"
                style={{ 
                  borderColor: colors.venta,
                  backgroundColor: colors.fondoInputs,
                  color: colors.textoOscuro
                }}
              >
                <option value="ingrediente">Ingrediente o insumo</option>
                <option value="ninguno">Sin recurso asociado</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5" style={{ color: colors.textoOscuro }}>
                <svg className="fill-current h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Insumo (Buscar Primero) */}
          <div className="mb-2.5">
            <label 
              className="block text-[9px] uppercase mb-1 font-normal"
              style={{ color: colors.textoOscuro }}
            >
              INSUMO (BUSCAR PRIMERO)
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-2.5" style={{ color: colors.textoOscuro, opacity: 0.5 }}>
                <Search size={14} />
              </div>
              <input
                type="text"
                placeholder="Buscar insumo..."
                value={busquedaInsumo}
                onChange={(e) => setBusquedaInsumo(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 transition-shadow placeholder-gray-400 text-[12px] font-normal"
                style={{ 
                  borderColor: colors.bordeClaro,
                  backgroundColor: colors.fondoInputs,
                  color: colors.textoOscuro
                }}
              />
            </div>
          </div>

          {/* Nombre Visible al Cliente */}
          <div className="mb-2.5">
            <label 
              className="block text-[9px] uppercase mb-1 font-normal"
              style={{ color: colors.textoOscuro }}
            >
              NOMBRE VISIBLE AL CLIENTE
            </label>
            <input
              type="text"
              placeholder="Queso Cheddar, Con hielo"
              value={nombreVisible}
              onChange={(e) => setNombreVisible(e.target.value)}
              className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 transition-shadow placeholder-gray-400 text-[12px] font-normal"
              style={{ 
                borderColor: colors.bordeClaro,
                backgroundColor: colors.fondoInputs,
                color: colors.textoOscuro
              }}
            />
          </div>

          {/* Precio de esta opción */}
          <div className="mb-1.5">
            <label 
              className="block text-[9px] uppercase mb-1 font-normal"
              style={{ color: colors.textoOscuro }}
            >
              PRECIO DE ESTA OPCIÓN
            </label>
            <input
              type="number"
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-1 transition-shadow text-[12px] font-normal"
              style={{ 
                borderColor: colors.bordeClaro,
                backgroundColor: colors.fondoInputs,
                color: colors.textoOscuro
              }}
              min="0"
            />
          </div>
          
          <p className="mb-3.5 text-[11px] font-normal" style={{ color: colors.textoOscuro }}>
            Incluido en el precio base.
          </p>

          {/* Cantidad y Unidad - Sin contenedor gris */}
          <div className="mb-3.5">
            <div className="flex gap-3">
              
              {/* Cantidad que consume */}
              <div className="flex-1">
                <label 
                  className="block text-[8px] uppercase mb-1 leading-tight font-normal"
                  style={{ color: colors.textoOscuro }}
                >
                  CANTIDAD QUE<br/>CONSUME
                </label>
                <div 
                  className="flex items-center border rounded-lg overflow-hidden transition-colors bg-white mt-1 h-7"
                  style={{ borderColor: colors.bordeClaro }}
                >
                  <button
                    type="button"
                    onClick={handleDecrementCantidad}
                    className="w-8 h-full flex items-center justify-center hover:bg-gray-50 focus:outline-none transition-colors"
                    style={{ color: colors.costoBase }}
                  >
                    <Minus size={12} strokeWidth={3} />
                  </button>
                  
                  <div className="flex-1 text-center text-[12px] font-normal" style={{ color: colors.textoOscuro }}>
                    {cantidadConsume}
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleIncrementCantidad}
                    className="w-8 h-full flex items-center justify-center hover:bg-gray-50 focus:outline-none transition-colors"
                    style={{ color: colors.gananciaBase }}
                  >
                    <Plus size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Unidad Base */}
              <div className="flex-1">
                <label 
                  className="block text-[8px] uppercase mb-1 leading-tight font-normal"
                  style={{ color: colors.textoOscuro }}
                >
                  UNIDAD BASE<br/>(INSUMO)
                </label>
                <div 
                  className="flex items-center px-2.5 border rounded-lg mt-1 h-7"
                  style={{ 
                    borderColor: colors.bordeClaro, 
                    backgroundColor: colors.fondoInputs, 
                    color: colors.textoOscuro,
                    opacity: 0.7
                  }}
                >
                  <span className="text-[12px] font-normal">—</span>
                </div>
              </div>

            </div>
          </div>

          {/* Checkboxes Row */}
          <div className="flex items-center gap-4 mb-4">
            
            {/* Preselección Checkbox */}
            <label className="flex items-center cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={preseleccion}
                  onChange={(e) => setPreseleccion(e.target.checked)}
                  className="sr-only"
                />
                <div 
                  className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
                    preseleccion ? 'border-transparent' : 'border-gray-400 bg-white group-hover:border-gray-500'
                  }`}
                  style={{ 
                    backgroundColor: preseleccion ? colors.venta : 'transparent' 
                  }}
                >
                  {preseleccion && (
                    <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 20 20">
                      <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
                    </svg>
                  )}
                </div>
              </div>
              <span className="ml-2 text-[11px] select-none font-normal" style={{ color: colors.textoOscuro }}>
                Preselección
              </span>
            </label>

            {/* Removible Checkbox */}
            <label className="flex items-center cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={removible}
                  onChange={(e) => setRemovible(e.target.checked)}
                  className="sr-only"
                />
                <div 
                  className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors ${
                    removible ? 'border-transparent' : 'border-gray-400 bg-white group-hover:border-gray-500'
                  }`}
                  style={{ 
                    backgroundColor: removible ? colors.venta : 'transparent' 
                  }}
                >
                  {removible && (
                    <svg className="w-2.5 h-2.5 text-white fill-current" viewBox="0 0 20 20">
                      <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
                    </svg>
                  )}
                </div>
              </div>
              <span className="ml-2 text-[11px] select-none font-normal" style={{ color: colors.textoOscuro }}>
                Removible
              </span>
            </label>

          </div>

          {/* Action Button */}
          <button
            type="submit"
            className="w-full py-2.5 text-[12px] rounded-lg text-white transition-opacity focus:outline-none hover:opacity-90 active:opacity-100 font-normal"
            style={{ 
              backgroundColor: colors.venta,
            }}
          >
            Guardar
          </button>
          
        </form>
      </div>
    </div>
  );
}