import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowRight, ArrowLeft, Lock, Edit3, Maximize, Minimize, PlayCircle, 
  WifiOff, Trash2, Plus, MessageCircle, X, Cloud, Sun, CloudRain, 
  CloudLightning, Wind, Droplets, Thermometer, Music, Bot, Send,
  GripHorizontal, Bell, Waves, MapPin, ThermometerSun, ArrowUp, ArrowDown, ThumbsUp, Skull
} from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';

// --- CONFIG & CONSTANTS ---
const MARICA_COORDS = { lat: -22.9194, lon: -42.8186 };
const apiKey = ""; // The execution environment provides the key at runtime

// Initialize Firebase safely
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const isFirebaseConfigured = Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey;
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black p-10 text-center z-50 fixed inset-0">
          <p className="text-red-500 font-bold mb-4 text-2xl">Ocorreu um erro.</p>
          <p className="text-white/50 mb-6 font-mono text-sm">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} className="bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform">Recarregar Página</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- SERVICES ---

const fetchWeatherData = async (coords) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code,is_day&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FSao_Paulo`;
    const res = await fetch(url);
    const data = await res.json();
    
    return {
      temperature: data.current.temperature_2m,
      apparent_temperature: data.current.apparent_temperature,
      weathercode: data.current.weather_code,
      is_day: data.current.is_day,
      precipitation_probability: data.hourly?.precipitation_probability?.[new Date().getHours()] || 0,
      wind_speed: data.current.wind_speed_10m,
      relative_humidity_2m: data.current.relative_humidity_2m,
      daily: data.daily,
      hourly: data.hourly
    };
  } catch (error) {
    console.error("Erro ao buscar clima:", error);
    return null;
  }
};

const generateBeachReport = async (weatherData, location) => {
  if (!apiKey) return [{ title: "Status", text: "Assistente IA indisponível." }];
  
  const prompt = `Analise os seguintes dados climáticos para a praia em ${location}: Temperatura: ${weatherData.temperature}°C, Sensação Térmica: ${weatherData.apparent_temperature}°C, Vento: ${weatherData.wind_speed} km/h, Probabilidade de Chuva: ${weatherData.precipitation_probability}%. Código do tempo: ${weatherData.weathercode}. 
  Responda estritamente em formato JSON, um array de objetos com "title" e "text". Dê 2 dicas rápidas para quem quer ir à praia hoje.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" },
    systemInstruction: { parts: [{ text: "Você é um especialista em praias de Maricá." }] }
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return JSON.parse(text);
  } catch (err) {
    console.error("Gemini Error:", err);
  }
  return [{ title: "Condições", text: "Agradável para uma caminhada." }];
};

// --- COMPONENTS ---

// 1. Resizable & Draggable Widget
const ResizableWidget = ({ width, height, position, locked, isSelected, onSelect, onResize, onPositionChange, children }) => {
  const widgetRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const handlePointerDownDrag = (e) => {
    if (locked) return;
    setIsDragging(true);
    setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerDownResize = (e) => {
    if (locked) return;
    setIsResizing(true);
    setStartPos({ x: e.clientX, y: e.clientY, w: width, h: height });
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (isDragging) {
        onPositionChange(e.clientX - startPos.x, e.clientY - startPos.y);
      } else if (isResizing) {
        const newWidth = Math.max(150, startPos.w + (e.clientX - startPos.x));
        const newHeight = Math.max(100, startPos.h + (e.clientY - startPos.y));
        onResize(newWidth, newHeight);
      }
    };

    const handlePointerUp = (e) => {
      setIsDragging(false);
      setIsResizing(false);
      if (e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId);
    };

    if (isDragging || isResizing) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, isResizing, startPos, onPositionChange, onResize]);

  return (
    <div 
      ref={widgetRef}
      onPointerDown={(e) => {
        if (!locked) {
          onSelect();
          e.stopPropagation();
        }
      }}
      className={`absolute flex flex-col transition-shadow duration-200 ease-linear
        ${isSelected && !locked ? 'z-50 shadow-[0_0_20px_rgba(234,179,8,0.2)] rounded-[3rem]' : 'z-10'}
      `}
      style={{ 
        width: `${width}px`, 
        height: `${height}px`, 
        transform: `translate(${position.x}px, ${position.y}px)`,
        left: 0, 
        top: 0,
        touchAction: 'none'
      }}
    >
      <div className="w-full h-full relative flex flex-col rounded-[3rem]">
        
        {!locked && isSelected && (
          <div 
            className="w-full h-8 bg-yellow-500/20 rounded-t-[3rem] cursor-move flex items-center justify-center flex-shrink-0 backdrop-blur-md"
            onPointerDown={handlePointerDownDrag}
          >
            <GripHorizontal size={16} className="text-yellow-500/80" />
          </div>
        )}
        
        <div className={`flex-1 overflow-hidden relative w-full h-full ${!locked && isSelected ? 'rounded-b-[3rem]' : 'rounded-[3rem]'}`}>
          {children}
          
          {!locked && isSelected && (
            <div className="absolute inset-0 border-2 border-dashed border-yellow-400/60 rounded-b-[3rem] pointer-events-none" />
          )}
        </div>

        {!locked && isSelected && (
          <div 
            className="absolute bottom-0 right-0 w-8 h-8 rounded-br-[3rem] cursor-se-resize flex items-end justify-end p-2 z-50"
            onPointerDown={handlePointerDownResize}
          >
            <div className="w-3 h-3 rounded-full bg-yellow-500 shadow-sm" />
          </div>
        )}

      </div>
    </div>
  );
};


// 2. Clock Widget
const ClockWidget = ({ currentTime, greeting, width = 300 }) => {
  const timeSize = Math.max(width / 3.8, 32); 
  const greetingSize = Math.max(width / 22, 10); 
  
  return (
    <div className="flex flex-col items-start justify-center h-full w-full px-8 animate-fade-in drop-shadow-lg bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5">
      <div 
        className="font-light tracking-wide opacity-80 uppercase text-yellow-400 leading-none mb-1" 
        style={{ fontSize: `${greetingSize}px` }}
      >
        {greeting}
      </div>
      <div 
        className="font-bold tracking-tighter text-white leading-none" 
        style={{ fontSize: `${timeSize}px` }}
      >
        {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div 
        className="opacity-50 uppercase tracking-[0.2em] mt-1 text-white" 
        style={{ fontSize: `${Math.max(width / 30, 9)}px` }}
      >
        Brasília
      </div>
    </div>
  );
};

// 3. Weather Widget 
const getWeatherIcon = (code) => {
  if (code <= 1) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "☁️";
  if (code <= 67) return "🌧️";
  return "⛈️";
};

const WeatherWidget = ({ weather, locationName, beachReport, width = 300 }) => {
  const [slideIndex, setSlideIndex] = useState(0);

  const slides = [
    { type: 'location', content: locationName },
    ...(beachReport && beachReport.length > 0 ? beachReport.map(item => ({ type: 'report', title: item.title, text: item.text })) : [])
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5000); 
    return () => clearInterval(interval);
  }, [slides.length]);

  const currentSlide = slides[slideIndex];
  const temp = weather?.temperature ? Math.round(Number(weather.temperature)) : '--';

  return (
    <div className="animate-float flex flex-col w-full h-full bg-black/70 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
       <div className="flex justify-between items-start mb-6 border-b border-white/10 pb-6 shrink-0">
          <div className="font-bold leading-none tracking-tighter text-white" style={{ fontSize: `${Math.max(40, Math.min(120, width/3.5))}px` }}>
             {temp}°
          </div>
          <div style={{ fontSize: `${Math.max(40, Math.min(100, width/3.5))}px`, lineHeight: 1 }}>
             {getWeatherIcon(weather?.weathercode || 0)}
          </div>
       </div>
       
       <div className="flex-1 flex flex-col items-center justify-center text-center relative w-full h-full overflow-hidden">
          {currentSlide.type === 'location' ? (
            <div className="animate-fade-in w-full">
              <MapPin className="text-yellow-400 mx-auto mb-3" size={32} />
              <p className="text-xl md:text-2xl uppercase tracking-widest text-yellow-400 font-bold">{currentSlide.content}</p>
              <p className="text-sm md:text-base font-light text-white/50 mt-2 tracking-wider">
                Vento: {weather?.wind_speed || 0} km/h • Sensação: {weather?.apparent_temperature ? Math.round(weather.apparent_temperature) : '--'}°
              </p>
            </div>
          ) : (
            <div key={slideIndex} className="animate-fade-in w-full px-2">
              <Droplets className="text-blue-400 mx-auto mb-3" size={28} />
              <p className="text-sm md:text-base font-bold text-blue-300 uppercase tracking-widest mb-2">{currentSlide.title}</p>
              <p className="text-sm md:text-base text-white/80 font-light leading-relaxed line-clamp-3 md:line-clamp-4">{currentSlide.text}</p>
            </div>
          )}
       </div>
    </div>
  );
};

// 4.1 Reminder Item Sub-component
const ReminderItem = ({ reminder, onDelete }) => (
  <div className="group bg-white/5 p-5 rounded-3xl border border-white/10 flex justify-between items-center transition-all hover:bg-white/10 hover:border-white/20">
    <div className="flex flex-col gap-1">
      <p className="text-base font-medium text-white/90">{reminder.text}</p>
      <span className="text-xs tracking-widest text-yellow-500/80 font-bold uppercase">{reminder.time}</span>
    </div>
    <button
      onClick={() => onDelete(reminder.id)}
      className="opacity-0 group-hover:opacity-100 p-3 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-all"
    >
      <Trash2 size={18} />
    </button>
  </div>
);

// 4. Reminders Widget
const RemindersWidget = ({ reminders, onAdd, onDelete }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) { 
      onAdd(text); 
      setText(''); 
      setIsAdding(false); 
    }
  };

  return (
    <div className="w-full h-full bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-6 shadow-2xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 text-yellow-400">
          <Bell size={24} />
          <span className="font-bold tracking-[0.3em] text-sm uppercase">Lembretes</span>
        </div>
        <button onClick={() => setIsAdding(!isAdding)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white">
          {isAdding ? <X size={20} /> : <Plus size={20} />}
        </button>
      </div>
      
      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 animate-fade-in shrink-0">
          <input 
            autoFocus 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="O que lembrar?" 
            className="w-full bg-black/60 border-2 border-yellow-500/50 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-yellow-400 transition-colors" 
          />
        </form>
      )}
      
      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-4">
        {reminders.length === 0 && !isAdding ? (
          <p className="text-white/30 text-sm text-center mt-10">Tudo limpo por aqui.</p>
        ) : (
          reminders.map((r) => <ReminderItem key={r.id} reminder={r} onDelete={onDelete} />)
        )}
      </div>
    </div>
  );
};

// 5. Chat Modal
const ChatModal = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Olá! Sou a IA do seu protetor de tela inteligente. Como posso ajudar em Maricá hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const payload = {
      contents: [{ parts: [{ text: userMsg }] }],
      systemInstruction: { parts: [{ text: "Você é um assistente virtual de um protetor de tela inteligente localizado em Maricá, RJ. Seja conciso e educado." }] }
    };

    let attempt = 0;
    while (attempt < 5) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar isso.";
        setMessages(prev => [...prev, { role: 'assistant', text }]);
        break;
      } catch (err) {
        attempt++;
        if (attempt >= 5) {
          setMessages(prev => [...prev, { role: 'assistant', text: "Erro de conexão. Tente novamente." }]);
        }
        await new Promise(r => setTimeout(r, 1000 * attempt)); 
      }
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-10">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg h-[600px] rounded-[3rem] relative z-[61] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
        
        <div className="flex justify-between items-center p-6 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-500 p-2 rounded-full"><Bot size={20} className="text-black"/></div>
            <h3 className="font-bold">Assistente Inteligente</h3>
          </div>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white rounded-full"><X size={20}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-3xl text-sm ${msg.role === 'user' ? 'bg-yellow-500 text-black rounded-tr-md' : 'bg-slate-800 text-white rounded-tl-md'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 p-4 rounded-3xl rounded-tl-md flex gap-2">
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce"/>
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}/>
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{animationDelay:'0.4s'}}/>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-slate-800 border-t border-slate-700">
          <div className="relative">
            <input 
              value={input} onChange={(e)=>setInput(e.target.value)} 
              placeholder="Pergunte à IA..."
              className="w-full bg-slate-900 text-white rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button type="submit" disabled={loading} className="absolute right-3 top-3 p-2 bg-yellow-500 text-black rounded-xl disabled:opacity-50">
              <Send size={18}/>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// 6. Background Music Player
const BackgroundMusic = ({ isPlaying }) => {
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (isPlaying && audioRef.current && !isMuted) {
      audioRef.current.play().catch(e => console.log("Autoplay bloqueado:", e));
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying, isMuted]);

  return (
    <div className="absolute top-8 right-8 z-50 flex items-center gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
      <audio ref={audioRef} loop src="https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3" />
      <div className="flex items-center gap-2">
        <Music size={16} className={!isMuted ? "text-yellow-400 animate-pulse" : "text-white/40"} />
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">Lofi Radio</span>
      </div>
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className={`w-10 h-6 rounded-full relative transition-colors ${!isMuted ? 'bg-yellow-500' : 'bg-white/20'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${!isMuted ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

const App = () => {
  const [user, setUser] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [beachReport, setBeachReport] = useState([{title: 'Carregando', text: 'Gerando relatório...'}]);
  const [reminders, setReminders] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasStarted, setHasStarted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLayoutLocked, setIsLayoutLocked] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  const [selectedWidget, setSelectedWidget] = useState(null);
  
  const [widgets, setWidgets] = useState({
    clock: { width: 400, height: 160, x: 0, y: 0 },
    reminders: { width: 350, height: 600, x: 0, y: 0 }, 
    weather: { width: 350, height: 600, x: 0, y: 0 }, 
    date: { width: 400, height: 300, x: 0, y: 0 }, 
    prev: { width: 190, height: 100, x: 0, y: 0 },
    next: { width: 190, height: 100, x: 0, y: 0 },
  });

  const updateWidget = (key, updates) => {
    setWidgets(prev => ({ ...prev, [key]: { ...prev[key], ...updates } }));
  };

  const recalculateLayout = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isLandscape = w > h;
    const padding = Math.min(20, w * 0.02);
    
    if (isLandscape) {
      // Landscape layout (Desktop, Tablet Landscape, Mobile Landscape)
      const sideColumnWidth = Math.max(220, Math.floor(w * 0.25)); 
      const centerColumnWidth = w - (sideColumnWidth * 2) - (padding * 4);
      const clockHeight = Math.min(160, h * 0.25);
      const footerHeight = Math.min(100, h * 0.15);
      const dateHeight = h - clockHeight - footerHeight - (padding * 4);
      
      setWidgets({
        reminders: { width: sideColumnWidth, height: h - (padding * 2), x: padding, y: padding },
        weather: { width: sideColumnWidth, height: h - (padding * 2), x: w - sideColumnWidth - padding, y: padding },
        clock: { width: centerColumnWidth, height: clockHeight, x: sideColumnWidth + (padding * 2), y: padding },
        date: { width: centerColumnWidth, height: Math.max(100, dateHeight), x: sideColumnWidth + (padding * 2), y: padding + clockHeight + padding },
        prev: { width: (centerColumnWidth / 2) - (padding / 2), height: footerHeight, x: sideColumnWidth + (padding * 2), y: h - footerHeight - padding },
        next: { width: (centerColumnWidth / 2) - (padding / 2), height: footerHeight, x: sideColumnWidth + (padding * 2) + (centerColumnWidth / 2) + (padding / 2), y: h - footerHeight - padding }
      });
    } else {
      // Portrait layout (Mobile Portrait, Tablet Portrait)
      const widgetWidth = w - (padding * 2);
      const clockHeight = 140;
      const weatherHeight = 300;
      const dateHeight = 200;
      const remindersHeight = 400;
      
      setWidgets(prev => ({
        ...prev,
        clock: { width: widgetWidth, height: clockHeight, x: padding, y: padding },
        weather: { width: widgetWidth, height: weatherHeight, x: padding, y: padding + clockHeight + padding },
        date: { width: widgetWidth, height: dateHeight, x: padding, y: padding + clockHeight + weatherHeight + (padding * 2) },
        reminders: { width: widgetWidth, height: remindersHeight, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + (padding * 3) },
        prev: { width: (widgetWidth / 2) - (padding / 2), height: 80, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + remindersHeight + (padding * 4) },
        next: { width: (widgetWidth / 2) - (padding / 2), height: 80, x: padding + (widgetWidth / 2) + (padding / 2), y: padding + clockHeight + weatherHeight + dateHeight + remindersHeight + (padding * 4) }
      }));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', recalculateLayout);
    recalculateLayout();
    return () => window.removeEventListener('resize', recalculateLayout);
  }, [recalculateLayout]);

  useEffect(() => {
    const handleStatusChange = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);
    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, []);

  // Firebase Auth Setup
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Firebase Auth Error:", e);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Fetch Reminders from Firestore
  useEffect(() => {
    if (!user || !db) return;
    const remindersRef = collection(db, 'artifacts', appId, 'users', user.uid, 'smart_home_reminders');
    
    const unsubscribe = onSnapshot(remindersRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetched.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setReminders(fetched);
    }, (error) => {
      console.error("Firestore Error:", error);
    });
    
    return () => unsubscribe();
  }, [user]);

  const loadData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const data = await fetchWeatherData(MARICA_COORDS);
      if (data) {
        setWeather(data);
        const report = await generateBeachReport(data, 'Maricá');
        if (report && report.length > 0) setBeachReport(report);
      }
    } catch (e) { console.error("Erro no ciclo de dados:", e); }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 300000); // 5 mins
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLayoutLocked) setSelectedWidget(null);
  }, [isLayoutLocked]);

  const addReminder = async (text) => {
    if (db && isOnline && user) {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'smart_home_reminders'), {
        text, 
        type: 'info', 
        createdAt: serverTimestamp(),
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
    } else {
      setReminders(prev => [{
        id: Date.now().toString(),
        text,
        type: 'info',
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }, ...prev]);
    }
  };

  const deleteReminder = async (id) => {
    if (db && isOnline && user) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'smart_home_reminders', id));
    } else {
      setReminders(prev => prev.filter(r => r.id !== id));
    }
  };

  const getBackgroundStyle = () => {
    const code = weather?.weathercode || 0;
    let imageId = '1507525428034-b723cf961d3e'; 
    if (code >= 51 && code <= 67) imageId = '1515694346937-94d85e41e6f0'; 
    if (code >= 95) imageId = '1605727216801-e27ce1d0cc28'; 
    return { 
      backgroundImage: `linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url("https://images.unsplash.com/photo-${imageId}?q=80&w=1920&auto=format&fit=crop")`,
      backgroundSize: 'cover', 
      backgroundPosition: 'center',
      transition: 'background-image 1s ease-in-out'
    };
  };

  const startApp = async () => {
    const elem = document.documentElement;
    const requestFS = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
    if (requestFS) {
      try { await requestFS.call(elem); setIsFullscreen(true); } catch (e) { console.warn("Fullscreen negado:", e); }
    }
    setTimeout(recalculateLayout, 100);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { startApp(); } 
    else if (document.exitFullscreen) { document.exitFullscreen().then(() => setIsFullscreen(false)); }
  };

  const getDateInfo = (d) => ({
    day: d.getDate(),
    weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).toUpperCase().replace('.', '')
  });

  const today = getDateInfo(currentTime);
  const yesterday = getDateInfo(new Date(new Date().setDate(currentTime.getDate() - 1)));
  const tomorrow = getDateInfo(new Date(new Date().setDate(currentTime.getDate() + 1)));

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@200;300;400;500;600;700&display=swap');
    .font-oswald { font-family: 'Oswald', sans-serif; }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    .animate-fade-in { animation: fadeIn 0.8s ease-out; }
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    .animate-float { animation: float 6s ease-in-out infinite; }
  `;

  const isRaining = weather?.weathercode >= 51 && weather?.weathercode <= 67;

  return (
    <ErrorBoundary>
      <style>{globalStyles}</style>
      <main 
        className="w-full h-screen overflow-hidden relative select-none text-white bg-black font-oswald" 
        style={getBackgroundStyle()}
        onPointerDown={() => {
          if (!isLayoutLocked) setSelectedWidget(null);
        }}
      >
        
        {isRaining && (
          <div className="fixed inset-0 z-0 pointer-events-none opacity-40 mix-blend-screen">
            {Array.from({length: 50}).map((_, i) => (
              <div 
                key={i} 
                className="absolute w-[2px] h-[60px] bg-gradient-to-b from-transparent to-white/60"
                style={{
                  left: `${Math.random() * 100}vw`,
                  top: `-100px`,
                  animation: `drop ${0.5 + Math.random()}s linear infinite`,
                  animationDelay: `${Math.random() * 2}s`
                }}
              />
            ))}
            <style>{`@keyframes drop { 0% { transform: translateY(0); } 100% { transform: translateY(110vh); } }`}</style>
          </div>
        )}

        <BackgroundMusic isPlaying={hasStarted} />
        <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        
        {!isOnline && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
               <div className="bg-red-500/90 text-white px-6 py-2 rounded-full backdrop-blur-md flex items-center gap-3 shadow-2xl border border-red-400/50">
                   <WifiOff size={20} className="animate-pulse" />
                   <span className="font-bold uppercase tracking-widest text-sm">Offline</span>
               </div>
            </div>
        )}

        <section className="absolute inset-0 z-10" style={{ pointerEvents: isLayoutLocked ? 'none' : 'auto' }}>
          
          <ResizableWidget width={widgets.clock.width} height={widgets.clock.height} locked={isLayoutLocked} position={{ x: widgets.clock.x, y: widgets.clock.y }} isSelected={selectedWidget === 'clock'} onSelect={() => setSelectedWidget('clock')} onResize={(w, h) => updateWidget('clock', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('clock', { x, y })}>
            <ClockWidget currentTime={currentTime} greeting={currentTime.getHours() < 12 ? 'Bom dia' : currentTime.getHours() < 18 ? 'Boa tarde' : 'Boa noite'} width={widgets.clock.width} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.reminders.width} height={widgets.reminders.height} locked={isLayoutLocked} position={{ x: widgets.reminders.x, y: widgets.reminders.y }} isSelected={selectedWidget === 'reminders'} onSelect={() => setSelectedWidget('reminders')} onResize={(w, h) => updateWidget('reminders', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('reminders', { x, y })}>
            <RemindersWidget reminders={reminders} onAdd={addReminder} onDelete={deleteReminder} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.weather.width} height={widgets.weather.height} locked={isLayoutLocked} position={{ x: widgets.weather.x, y: widgets.weather.y }} isSelected={selectedWidget === 'weather'} onSelect={() => setSelectedWidget('weather')} onResize={(w, h) => updateWidget('weather', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('weather', { x, y })}>
            <WeatherWidget weather={weather} locationName="Maricá - RJ" beachReport={beachReport} width={widgets.weather.width} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.date.width} height={widgets.date.height} locked={isLayoutLocked} position={{ x: widgets.date.x, y: widgets.date.y }} isSelected={selectedWidget === 'date'} onSelect={() => setSelectedWidget('date')} onResize={(w, h) => updateWidget('date', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('date', { x, y })}>
            <div className="flex flex-col items-center justify-center h-full text-center drop-shadow-2xl animate-fade-in bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
              <span className="font-bold opacity-70 text-yellow-400 tracking-[0.4em]" style={{ fontSize: `${Math.min(30, widgets.date.width / 14)}px` }}>HOJE</span>
              <span className="font-bold leading-none my-2 text-white" style={{ fontSize: `${Math.min(widgets.date.height * 0.5, widgets.date.width / 1.6)}px` }}>{today.day}</span>
              <span className="font-light uppercase tracking-[0.3em] text-white/80" style={{ fontSize: `${Math.min(40, widgets.date.width / 10)}px` }}>{today.weekday}</span>
            </div>
          </ResizableWidget>

          <ResizableWidget width={widgets.prev.width} height={widgets.prev.height} locked={isLayoutLocked} position={{ x: widgets.prev.x, y: widgets.prev.y }} isSelected={selectedWidget === 'prev'} onSelect={() => setSelectedWidget('prev')} onResize={(w, h) => updateWidget('prev', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('prev', { x, y })}>
            <div className="flex items-center gap-4 opacity-50 p-4 h-full bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
                <ArrowLeft size={Math.min(40, widgets.prev.width / 6)} />
                <div className="text-left">
                  <span className="block uppercase tracking-widest text-yellow-400 font-bold" style={{ fontSize: `${Math.min(16, widgets.prev.width / 10)}px` }}>Ontem</span>
                  <span className="font-bold block" style={{ fontSize: `${Math.min(50, widgets.prev.width / 4)}px` }}>{yesterday.day}</span>
                </div>
            </div>
          </ResizableWidget>
          
          <ResizableWidget width={widgets.next.width} height={widgets.next.height} locked={isLayoutLocked} position={{ x: widgets.next.x, y: widgets.next.y }} isSelected={selectedWidget === 'next'} onSelect={() => setSelectedWidget('next')} onResize={(w, h) => updateWidget('next', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('next', { x, y })}>
            <div className="flex items-center gap-4 justify-end opacity-50 p-4 h-full bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
                <div className="text-right">
                  <span className="block uppercase tracking-widest text-yellow-400 font-bold" style={{ fontSize: `${Math.min(16, widgets.next.width / 10)}px` }}>Amanhã</span>
                  <span className="font-bold block" style={{ fontSize: `${Math.min(50, widgets.next.width / 4)}px` }}>{tomorrow.day}</span>
                </div>
                <ArrowRight size={Math.min(40, widgets.next.width / 6)} />
            </div>
          </ResizableWidget>
          
        </section>

        <div 
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[55] flex gap-4 bg-black/50 backdrop-blur-xl p-3 rounded-full border border-white/10"
          onPointerDown={(e) => e.stopPropagation()} 
        >
          <button onClick={() => setIsChatOpen(true)} className="p-4 rounded-full border-2 bg-yellow-500 border-yellow-400 text-black hover:scale-110 transition-transform shadow-lg shadow-yellow-500/20">
             <MessageCircle size={24}/>
          </button>
          <div className="w-px h-12 bg-white/20 self-center mx-2" />
          <button onClick={toggleFullscreen} className="p-4 rounded-full border-2 bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
             {isFullscreen ? <Minimize size={24}/> : <Maximize size={24}/>}
          </button>
          <button onClick={() => setIsLayoutLocked(!isLayoutLocked)} className={`p-4 rounded-full border-2 transition-all ${isLayoutLocked ? 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10' : 'bg-blue-500 text-white border-blue-400 scale-110 shadow-lg shadow-blue-500/20'}`}>
            {isLayoutLocked ? <Lock size={24}/> : <Edit3 size={24}/>}
          </button>
        </div>
      </main>
    </ErrorBoundary>
  );
};

export default App;

