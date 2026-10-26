import React, { useState } from 'react';
import { 
  Maximize2, 
  Home, 
  Layers, 
  Sliders, 
  Sparkles, 
  Download, 
  RotateCcw, 
  Box, 
  CheckCircle, 
  AlertCircle,
  Cpu
} from 'lucide-react';

export default function App() {
  // Input parameters state
  const [dimensions, setDimensions] = useState({ width: 8, length: 10 });
  const [roomType, setRoomType] = useState('apartment');
  const [roomsCount, setRoomsCount] = useState(3);
  const [stylePreference, setStylePreference] = useState('modern');
  const [backendUrl, setBackendUrl] = useState('https://YOUR-HUGGINGFACE-SPACE.hf.space');

  // Request & Layout state
  const [isLoading, setIsLoading] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [error, setError] = useState(null);

  // Default Mock Generator (if backend API isn't connected yet)
  const generateMockLayout = () => {
    const w = parseFloat(dimensions.width);
    const l = parseFloat(dimensions.length);
    const scale = 25; // px per meter

    // Generate procedural layout coordinates relative to width/length
    return {
      dimensions: { width: w, length: l },
      svgWidth: w * scale,
      svgHeight: l * scale,
      rooms: [
        { id: 1, name: 'Soggiorno / Open Space', x: 0, y: 0, w: w * 0.6, h: l * 0.55, color: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6' },
        { id: 2, name: 'Cucina', x: w * 0.6, y: 0, w: w * 0.4, h: l * 0.4, color: 'rgba(16, 185, 129, 0.15)', border: '#10b981' },
        { id: 3, name: 'Camera da Letto', x: 0, y: l * 0.55, w: w * 0.55, h: l * 0.45, color: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6' },
        { id: 4, name: 'Bagno', x: w * 0.55, y: l * 0.4, w: w * 0.45, h: l * 0.3, color: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b' },
        { id: 5, name: 'Corridoio / Ingresso', x: w * 0.55, y: l * 0.7, w: w * 0.45, h: l * 0.3, color: 'rgba(107, 114, 128, 0.15)', border: '#6b7280' },
      ],
      furniture: [
        { name: 'Divano 3 Posti', x: w * 0.08, y: l * 0.1, type: 'sofa' },
        { name: 'Tavolo da Pranzo', x: w * 0.65, y: l * 0.1, type: 'table' },
        { name: 'Letto Matrimoniale', x: w * 0.1, y: l * 0.65, type: 'bed' },
        { name: 'Mobile Lavabo & WC', x: w * 0.6, y: l * 0.45, type: 'bath' }
      ]
    };
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Try fetching from the custom backend (Python HuggingFace / Render)
      const response = await fetch(`${backendUrl}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width: parseFloat(dimensions.width),
          length: parseFloat(dimensions.length),
          room_type: roomType,
          num_rooms: parseInt(roomsCount),
          style: stylePreference
        }),
      });

      if (!response.ok) {
        throw new Error(`Risposta del server: ${response.status}`);
      }

      const data = await response.json();
      setGeneratedPlan(data.layout || data);
    } catch (err) {
      console.warn('Impossibile connettersi al backend live. Utilizzo il simulatore locale:', err);
      // Fallback local visualizer so user can test the app interface immediately
      setTimeout(() => {
        setGeneratedPlan(generateMockLayout());
        setError('Nota: Utilizzo del motore locale di fallback. Sostituisci il link del Backend nelle impostazioni per collegare Hugging Face.');
      }, 800);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur px-6 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Home className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-wide text-white">AI FloorPlan Creator</h1>
            <p className="text-xs text-slate-400">Generatore automatico di piante e spazi</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700 text-xs text-slate-300">
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>Backend: Open-Source AI Ready</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Sidebar Controls */}
        <aside className="w-full lg:w-96 border-r border-slate-800 bg-slate-950/40 p-6 overflow-y-auto flex flex-col justify-between">
          <form onSubmit={handleGenerate} className="space-y-6">
            
            {/* Dimensions Section */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center mb-3">
                <Maximize2 className="w-4 h-4 mr-1.5" /> 1. Dimensioni Edificio / Stanza
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">Larghezza (m)</span>
                  <input
                    type="number"
                    min="3"
                    max="50"
                    step="0.5"
                    value={dimensions.width}
                    onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">Lunghezza (m)</span>
                  <input
                    type="number"
                    min="3"
                    max="50"
                    step="0.5"
                    value={dimensions.length}
                    onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 text-right">
                Superficie totale: <span className="text-slate-300 font-medium">{(dimensions.width * dimensions.length).toFixed(1)} m²</span>
              </div>
            </div>

            {/* Room Parameters */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-indigo-400 flex items-center mb-3">
                <Layers className="w-4 h-4 mr-1.5" /> 2. Requisiti di Spazio
              </label>
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">Tipo di Ambiente</span>
                  <select
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="apartment">Appartamento Completo</option>
                    <option value="open-space">Open Space / Loft</option>
                    <option value="office">Ufficio / Workspace</option>
                    <option value="single-room">Singola Stanza / Studio</option>
                  </select>
                </div>

                <div>
                  <span className="text-xs text-slate-400 mb-1 block">Numero di Vani Principali: {roomsCount}</span>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={roomsCount}
                    onChange={(e) => setRoomsCount(e.target.value)}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div>
                  <span className="text-xs text-slate-400 mb-1 block">Stile del Lay-out</span>
                  <select
                    value={stylePreference}
                    onChange={(e) => setStylePreference(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="modern">Moderno & Razionale</option>
                    <option value="minimal">Minimalista (Spazi Aperti)</option>
                    <option value="classic">Classico (Stanze Separate)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Backend URL Configuration */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center mb-2">
                <Sliders className="w-4 h-4 mr-1.5" /> URL Server AI (HuggingFace/Render)
              </label>
              <input
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="https://your-space.hf.space"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium py-3 rounded-lg flex items-center justify-center space-x-2 shadow-lg shadow-indigo-600/20 transition duration-200 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RotateCcw className="w-4 h-4 animate-spin" />
                  <span>Elaborazione Layout AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Genera Pianta Gratuita</span>
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </aside>

        {/* Canvas / Visualization Area */}
        <main className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-center relative overflow-hidden">
          
          {/* Blueprint Grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-40"></div>

          {generatedPlan ? (
            <div className="relative z-10 flex flex-col items-center max-w-full max-h-full">
              {/* Header Bar */}
              <div className="mb-4 flex items-center space-x-4">
                <div className="bg-slate-900/80 backdrop-blur border border-slate-800 px-4 py-2 rounded-lg text-xs text-slate-300 flex items-center space-x-3">
                  <span className="flex items-center text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Pianta Ottimizzata
                  </span>
                  <span>|</span>
                  <span>Dim: {generatedPlan.dimensions.width}m x {generatedPlan.dimensions.length}m</span>
                </div>
              </div>

              {/* Interactive Floor Plan Viewer */}
              <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-6 shadow-2xl overflow-auto max-w-full">
                <svg
                  width={Math.max(generatedPlan.svgWidth + 40, 320)}
                  height={Math.max(generatedPlan.svgHeight + 40, 320)}
                  className="bg-slate-950 rounded border border-slate-800"
                >
                  <g transform="translate(20, 20)">
                    {/* Outer Perimeter */}
                    <rect
                      x="0"
                      y="0"
                      width={generatedPlan.svgWidth}
                      height={generatedPlan.svgHeight}
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="6"
                      rx="4"
                    />

                    {/* Rooms */}
                    {generatedPlan.rooms.map((room) => {
                      const scale = generatedPlan.svgWidth / generatedPlan.dimensions.width;
                      const rx = room.x * scale;
                      const ry = room.y * scale;
                      const rw = room.w * scale;
                      const rh = room.h * scale;

                      return (
                        <g key={room.id} className="transition-all hover:opacity-90">
                          <rect
                            x={rx}
                            y={ry}
                            width={rw}
                            height={rh}
                            fill={room.color}
                            stroke={room.border}
                            strokeWidth="2"
                            strokeDasharray="4 2"
                          />
                          <text
                            x={rx + rw / 2}
                            y={ry + rh / 2}
                            fill="#f8fafc"
                            fontSize="11"
                            fontWeight="600"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="select-none"
                          >
                            {room.name}
                          </text>
                        </g>
                      );
                    })}

                    {/* Furniture / Icons Mock representation */}
                    {generatedPlan.furniture && generatedPlan.furniture.map((item, idx) => {
                      const scale = generatedPlan.svgWidth / generatedPlan.dimensions.width;
                      return (
                        <g key={idx} transform={`translate(${item.x * scale}, ${item.y * scale})`}>
                          <circle r="4" fill="#38bdf8" />
                          <text x="8" y="4" fill="#94a3b8" fontSize="9">{item.name}</text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {/* Action Toolbar */}
              <div className="mt-4 flex space-x-3">
                <button
                  onClick={() => alert('Download SVG/JSON pronto!')}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Esporta CAD / SVG</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="relative z-10 text-center max-w-sm p-8 bg-slate-900/50 backdrop-blur border border-slate-800 rounded-xl">
              <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Box className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1">Nessuna pianta generata</h3>
              <p className="text-xs text-slate-400">
                Imposta le dimensioni della stanza o dell'edificio nel pannello laterale e clicca su "Genera Pianta".
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}