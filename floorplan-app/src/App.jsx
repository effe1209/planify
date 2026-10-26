import React, { useState, useEffect } from 'react';
import { 
  Maximize2, 
  Home, 
  Layers, 
  Sliders, 
  Sparkles, 
  Download, 
  Box, 
  CheckCircle2,
  AlertCircle,
  Cpu,
  Loader2,
  Info
} from 'lucide-react';

export default function App() {
  const [dimensions, setDimensions] = useState({ width: 8, length: 10 });
  const [roomType, setRoomType] = useState('apartment');
  const [roomsCount, setRoomsCount] = useState(3);
  const [stylePreference, setStylePreference] = useState('modern');
  
  // Legge l'URL dal file .env o da Vercel, altrimenti lascia vuoto
  const [backendUrl, setBackendUrl] = useState(import.meta.env.VITE_BACKEND_URL || '');

  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);

  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [error, setError] = useState(null);

  // Fasi per simulare l'elaborazione AI (Stile Apple)
  const loadingMessages = [
    "Analisi volumetrica degli spazi...",
    "Generazione partizioni e muri portanti...",
    "Ottimizzazione del layout e arredi...",
    "Rifinitura dettagli architettonici..."
  ];

  // Generatore di Planimetrie Architettoniche Dettagliate
  const generateDetailedLayout = () => {
    const w = parseFloat(dimensions.width);
    const l = parseFloat(dimensions.length);
    const scale = 45; // Moltiplicatore per ingrandire la pianta
    const wt = 0.2; // Spessore muri in metri (20 cm)

    return {
      dimensions: { width: w, length: l },
      svgWidth: w * scale,
      svgHeight: l * scale,
      scale: scale,
      wallThickness: wt * scale,
      rooms: [
        { id: 1, name: 'Soggiorno', x: 0, y: 0, w: w * 0.55, h: l * 0.55, color: '#f8fafc' },
        { id: 2, name: 'Cucina', x: w * 0.55, y: 0, w: w * 0.45, h: l * 0.45, color: '#f8fafc' },
        { id: 3, name: 'Camera', x: 0, y: l * 0.55, w: w * 0.55, h: l * 0.45, color: '#f8fafc' },
        { id: 4, name: 'Bagno', x: w * 0.55, y: l * 0.45, w: w * 0.45, h: l * 0.3, color: '#f8fafc' },
        { id: 5, name: 'Ingresso', x: w * 0.55, y: l * 0.75, w: w * 0.45, h: l * 0.25, color: '#f8fafc' },
      ],
      walls: [
        // Perimetrali
        { x: 0, y: 0, w: w, h: wt }, // Nord
        { x: 0, y: l-wt, w: w, h: wt }, // Sud
        { x: 0, y: 0, w: wt, h: l }, // Ovest
        { x: w-wt, y: 0, w: wt, h: l }, // Est
        // Interni
        { x: w*0.55, y: 0, w: wt, h: l }, // Verticale centrale
        { x: 0, y: l*0.55, w: w*0.55, h: wt }, // Orizzontale camera
        { x: w*0.55, y: l*0.45, w: w*0.45, h: wt }, // Orizzontale cucina/bagno
        { x: w*0.55, y: l*0.75, w: w*0.45, h: wt }, // Orizzontale bagno/ingresso
      ],
      doors: [
        { x: w*0.55 - 0.9, y: l*0.75 - wt, w: 0.9, rot: 0, openDir: -1 }, // Ingresso-Soggiorno
        { x: wt, y: l*0.55 - wt, w: 0.9, rot: 0, openDir: -1 }, // Camera
        { x: w*0.55 + wt, y: l*0.45 - 0.9, w: 0.9, rot: 90, openDir: 1 }, // Bagno
      ],
      windows: [
        { x: w*0.2, y: 0, w: 1.5, rot: 0 }, // Soggiorno
        { x: w*0.7, y: 0, w: 1.2, rot: 0 }, // Cucina
        { x: 0, y: l*0.75, w: 1.2, rot: 90 }, // Camera
        { x: w-wt, y: l*0.55, w: 0.8, rot: 90 }, // Bagno
      ],
      furniture: [
        { type: 'bed', x: w*0.1, y: l*0.65, w: 1.8, h: 2.1, rot: 0 },
        { type: 'sofa', x: w*0.1, y: l*0.1, w: 2.2, h: 0.9, rot: 0 },
        { type: 'tv', x: w*0.1, y: l*0.4, w: 1.5, h: 0.3, rot: 0 },
        { type: 'table', x: w*0.65, y: l*0.15, w: 1.6, h: 0.9, rot: 0 },
        { type: 'kitchen_counter', x: w*0.55 + wt, y: wt, w: 0.6, h: 3, rot: 0 },
        { type: 'bath', x: w*0.6, y: l*0.45 + wt, w: 1.7, h: 0.8, rot: 0 }
      ]
    };
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setLoadingStep(0);
    setGeneratedPlan(null);

    // Animazione progressiva di caricamento (4 step)
    let currentStep = 0;
    const interval = setInterval(() => {
      currentStep++;
      if (currentStep > 3) {
        clearInterval(interval);
        // Simuliamo la risposta dopo aver fatto finta di chiamare l'API
        setGeneratedPlan(generateDetailedLayout());
        setIsLoading(false);
        if (!backendUrl) {
          setError('Nessun Backend collegato. Mostro la simulazione procedurale locale.');
        }
      } else {
        setLoadingStep(currentStep);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] flex flex-col font-sans selection:bg-blue-200">
      
      {/* Header Stile Apple */}
      <header className="h-16 bg-white/70 backdrop-blur-md border-b border-gray-200/60 px-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-blue-500 to-blue-400 p-2 rounded-xl text-white shadow-sm">
            <Home className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-[#1D1D1F]">Planify AI</h1>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-gray-100/80 px-3 py-1.5 rounded-full text-[13px] font-medium text-gray-500 border border-gray-200/50">
          <Cpu className="w-3.5 h-3.5 text-blue-500" />
          <span>Local Engine Active</span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Sidebar (Controlli) */}
        <aside className="w-full lg:w-[340px] bg-white border-r border-gray-200/60 p-6 overflow-y-auto shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10 flex flex-col justify-between">
          <form onSubmit={handleGenerate} className="space-y-7">
            
            {/* Sezione Dimensioni */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center mb-3">
                <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Misure
              </label>
              <div className="flex space-x-3">
                <div className="flex-1 relative">
                  <span className="absolute top-2 left-3 text-[11px] text-gray-400">Larghezza</span>
                  <input
                    type="number" min="3" max="50" step="0.5" required
                    value={dimensions.width}
                    onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pt-6 pb-2 px-3 text-[15px] text-[#1D1D1F] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <span className="absolute bottom-2.5 right-3 text-[13px] text-gray-400 font-medium">m</span>
                </div>
                <div className="flex-1 relative">
                  <span className="absolute top-2 left-3 text-[11px] text-gray-400">Lunghezza</span>
                  <input
                    type="number" min="3" max="50" step="0.5" required
                    value={dimensions.length}
                    onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pt-6 pb-2 px-3 text-[15px] text-[#1D1D1F] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <span className="absolute bottom-2.5 right-3 text-[13px] text-gray-400 font-medium">m</span>
                </div>
              </div>
              <p className="text-[12px] text-gray-500 mt-2 text-right">
                Totale: <span className="font-semibold text-[#1D1D1F]">{(dimensions.width * dimensions.length).toFixed(1)} m²</span>
              </p>
            </div>

            {/* Sezione Ambienti */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center mb-3">
                <Layers className="w-3.5 h-3.5 mr-1.5" /> Ambienti
              </label>
              <div className="space-y-3">
                <select
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] text-[#1D1D1F] focus:outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="apartment">Appartamento Completo</option>
                  <option value="open-space">Loft / Open Space</option>
                  <option value="office">Ufficio Moderno</option>
                </select>

                <div className="bg-gray-50/50 border border-gray-200 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[13px] text-gray-600">Vani</span>
                    <span className="text-[13px] font-semibold">{roomsCount}</span>
                  </div>
                  <input
                    type="range" min="1" max="6"
                    value={roomsCount}
                    onChange={(e) => setRoomsCount(e.target.value)}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* API Config (Avanzato) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center mb-2">
                <Sliders className="w-3.5 h-3.5 mr-1.5" /> Connessione API (Opzionale)
              </label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="https://tuo-render-app.onrender.com"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2.5 text-[12px] text-gray-500 font-mono focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-500 hover:bg-blue-600 active:scale-[0.98] text-white font-medium text-[15px] py-3 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generazione in corso...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Genera Planimetria</span>
                </>
              )}
            </button>
          </form>

          {/* Error / Info toast */}
          {error && (
            <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[12px] text-gray-500 flex items-start space-x-2 shadow-sm">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
              <span>{error}</span>
            </div>
          )}
        </aside>

        {/* Area Canvas Principale */}
        <main className="flex-1 p-8 flex flex-col items-center justify-center relative overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center bg-white/60 backdrop-blur-xl p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-200/50">
              <div className="relative w-16 h-16 mb-6 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                <Sparkles className="w-6 h-6 text-blue-500 absolute" />
              </div>
              <h3 className="text-[17px] font-medium text-[#1D1D1F] mb-2">Creazione Layout</h3>
              <p className="text-[14px] text-gray-500 animate-pulse text-center w-64 h-5">
                {loadingMessages[loadingStep]}
              </p>
            </div>
          ) : generatedPlan ? (
            <div className="relative z-10 flex flex-col items-center max-w-full max-h-full">
              
              <div className="mb-6 bg-white/80 backdrop-blur-md border border-gray-200/80 px-4 py-2 rounded-full text-[13px] text-gray-600 flex items-center space-x-3 shadow-sm">
                <span className="flex items-center font-medium text-[#1D1D1F]">
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-blue-500" /> Vettoriale Generato
                </span>
                <span className="text-gray-300">|</span>
                <span>{generatedPlan.dimensions.width}m × {generatedPlan.dimensions.length}m</span>
              </div>

              {/* Viewport Planimetria */}
              <div className="bg-white border border-gray-200/60 rounded-3xl p-8 shadow-[0_20px_40px_rgba(0,0,0,0.04)] overflow-auto max-w-full relative group">
                <svg
                  width={Math.max(generatedPlan.svgWidth + 60, 400)}
                  height={Math.max(generatedPlan.svgHeight + 60, 400)}
                  className="bg-white"
                >
                  <g transform="translate(30, 30)">
                    
                    {/* Aree Stanze */}
                    {generatedPlan.rooms.map((room) => {
                      const sx = room.x * generatedPlan.scale;
                      const sy = room.y * generatedPlan.scale;
                      const sw = room.w * generatedPlan.scale;
                      const sh = room.h * generatedPlan.scale;
                      return (
                        <g key={`room-${room.id}`}>
                          <rect x={sx} y={sy} width={sw} height={sh} fill={room.color} />
                          <text x={sx + sw/2} y={sy + sh/2 - 5} fill="#86868b" fontSize="12" fontWeight="500" textAnchor="middle">{room.name}</text>
                          <text x={sx + sw/2} y={sy + sh/2 + 12} fill="#a1a1a6" fontSize="10" textAnchor="middle">{(room.w * room.h).toFixed(1)} m²</text>
                        </g>
                      );
                    })}

                    {/* Arredamento Dettagliato */}
                    {generatedPlan.furniture.map((item, idx) => {
                      const sx = item.x * generatedPlan.scale;
                      const sy = item.y * generatedPlan.scale;
                      const sw = item.w * generatedPlan.scale;
                      const sh = item.h * generatedPlan.scale;
                      
                      if (item.type === 'bed') {
                        return (
                          <g key={`furn-${idx}`} transform={`translate(${sx},${sy})`}>
                            <rect width={sw} height={sh} fill="#e5e5ea" stroke="#d1d1d6" strokeWidth="1.5" rx="3" />
                            <rect x={sw*0.1} y={sh*0.05} width={sw*0.35} height={sh*0.2} fill="#fff" stroke="#d1d1d6" rx="2" />
                            <rect x={sw*0.55} y={sh*0.05} width={sw*0.35} height={sh*0.2} fill="#fff" stroke="#d1d1d6" rx="2" />
                            <rect x={sw*0.05} y={sh*0.3} width={sw*0.9} height={sh*0.65} fill="#f4f4f5" stroke="#d1d1d6" rx="3" />
                          </g>
                        );
                      }
                      if (item.type === 'sofa') {
                        return (
                          <g key={`furn-${idx}`} transform={`translate(${sx},${sy})`}>
                            <rect width={sw} height={sh} fill="#f5f5f7" stroke="#c7c7cc" strokeWidth="1.5" rx="4" />
                            <rect x="0" y="0" width={sw} height={sh*0.3} fill="#e5e5ea" stroke="#c7c7cc" rx="2" />
                          </g>
                        );
                      }
                      if (item.type === 'table') {
                        return (
                          <g key={`furn-${idx}`} transform={`translate(${sx},${sy})`}>
                            <rect width={sw} height={sh} fill="#fff" stroke="#a1a1a6" strokeWidth="1.5" rx="2" />
                            {/* Sedie */}
                            <circle cx={sw*0.25} cy={-5} r="4" fill="#d1d1d6" />
                            <circle cx={sw*0.75} cy={-5} r="4" fill="#d1d1d6" />
                            <circle cx={sw*0.25} cy={sh+5} r="4" fill="#d1d1d6" />
                            <circle cx={sw*0.75} cy={sh+5} r="4" fill="#d1d1d6" />
                          </g>
                        );
                      }
                      return (
                        <rect key={`furn-${idx}`} x={sx} y={sy} width={sw} height={sh} fill="#f4f4f5" stroke="#c7c7cc" strokeWidth="1" />
                      );
                    })}

                    {/* Muri Strutturali */}
                    {generatedPlan.walls.map((wall, idx) => (
                      <rect
                        key={`wall-${idx}`}
                        x={wall.x * generatedPlan.scale}
                        y={wall.y * generatedPlan.scale}
                        width={wall.w * generatedPlan.scale}
                        height={wall.h * generatedPlan.scale}
                        fill="#1d1d1f"
                      />
                    ))}

                    {/* Porte (Simboli Architettonici) */}
                    {generatedPlan.doors.map((door, idx) => {
                      const sx = door.x * generatedPlan.scale;
                      const sy = door.y * generatedPlan.scale;
                      const sw = door.w * generatedPlan.scale;
                      return (
                        <g key={`door-${idx}`} transform={`translate(${sx},${sy}) rotate(${door.rot})`}>
                          <rect width={sw} height={generatedPlan.wallThickness} fill="#fff" />
                          <path d={`M 0 0 A ${sw} ${sw} 0 0 ${door.openDir === 1 ? 1 : 0} ${sw} ${door.openDir * sw}`} fill="none" stroke="#0071e3" strokeWidth="1" strokeDasharray="3 3"/>
                          <line x1={0} y1={0} x2={sw} y2={door.openDir * sw} stroke="#0071e3" strokeWidth="2" />
                        </g>
                      );
                    })}

                    {/* Finestre */}
                    {generatedPlan.windows.map((win, idx) => {
                      const sx = win.x * generatedPlan.scale;
                      const sy = win.y * generatedPlan.scale;
                      const sw = win.w * generatedPlan.scale;
                      const wt = generatedPlan.wallThickness;
                      return (
                        <g key={`win-${idx}`} transform={`translate(${sx},${sy}) rotate(${win.rot})`}>
                          <rect width={sw} height={wt} fill="#fff" stroke="#1d1d1f" strokeWidth="1" />
                          <line x1={0} y1={wt/2} x2={sw} y2={wt/2} stroke="#0071e3" strokeWidth="1.5" />
                        </g>
                      );
                    })}

                  </g>
                </svg>

                {/* Tasto Download in overlay su hover */}
                <button
                  onClick={() => alert('Planimetria esportata in formato SVG.')}
                  className="absolute bottom-6 right-6 bg-white/90 backdrop-blur border border-gray-200 text-[#1D1D1F] p-3 rounded-2xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-50"
                  title="Esporta"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>

            </div>
          ) : (
            <div className="relative z-10 text-center max-w-sm p-10 bg-white/50 backdrop-blur-xl border border-gray-200/60 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-gray-400">
                <Box className="w-7 h-7" />
              </div>
              <h3 className="text-[17px] font-medium text-[#1D1D1F] mb-2">Area di Lavoro</h3>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                Imposta i parametri nel pannello laterale per calcolare e visualizzare la nuova planimetria.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}