import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowRight, ArrowLeft, Lock, Edit3, Maximize, Minimize, PlayCircle, 
  WifiOff, Trash2, Plus, MessageCircle, X, Cloud, Sun, CloudRain, 
  CloudLightning, Wind, Droplets, Thermometer, Music, Bot, Send,
  GripHorizontal, Bell, Waves, MapPin, ThermometerSun, ArrowUp, ArrowDown, ThumbsUp, Skull,
  AlertTriangle, Info, CheckCircle, Navigation, Clock, Newspaper, Globe,
  TrendingUp, AlertCircle, RefreshCcw, Sparkles, Volume2, Image as ImageIcon, Loader2
} from 'lucide-react';

// --- GLOBAL DECLARATIONS ---
declare global {
  var __firebase_config: string | undefined;
  var __app_id: string | undefined;
  var __initial_auth_token: string | undefined;
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  }
}

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';

import { GoogleGenAI, Type } from "@google/genai";

// --- CONFIG & CONSTANTS ---
const MARICA_COORDS = { lat: -22.9194, lon: -42.8186 };
const apiKey = process.env.GEMINI_API_KEY; // The execution environment provides the key at runtime
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Initialize Firebase safely
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const isFirebaseConfigured = Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey;
const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- ERROR BOUNDARY ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
class ErrorBoundary extends React.Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black p-10 text-center z-50 fixed inset-0">
          <p className="text-red-500 font-bold mb-4 text-2xl">Ocorreu um erro.</p>
          <p className="text-white/50 mb-6 font-mono text-sm">{(this.state as any).error?.message}</p>
          <button onClick={() => window.location.reload()} className="bg-yellow-500 text-black px-6 py-3 rounded-xl font-bold hover:scale-105 transition-transform">Recarregar Página</button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- SERVICES ---

const fetchWeatherData = async (coords: { lat: number, lon: number }) => {
  try {
    // 1. Fetch Weather Forecast (including UV Index and Sunrise/Sunset)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,is_day,wind_speed_10m,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,sunrise,sunset&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    // 2. Fetch Marine Data (Wave height, water temperature)
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${coords.lat}&longitude=${coords.lon}&current=wave_height,wave_direction,wave_period,swell_wave_height,water_temperature&timezone=auto`;
    const marineRes = await fetch(marineUrl);
    const marineData = await marineRes.json();
    
    let weatherCode = weatherData.current.weather_code;
    const isRainingNow = (weatherData.current.precipitation > 0 || weatherData.current.rain > 0 || weatherData.current.showers > 0);
    
    if (isRainingNow && weatherCode < 50) {
      weatherCode = 61; 
    }

    return {
      temperature: weatherData.current.temperature_2m,
      apparent_temperature: weatherData.current.apparent_temperature,
      weathercode: weatherCode,
      is_day: weatherData.current.is_day,
      precipitation: weatherData.current.precipitation,
      precipitation_probability: weatherData.daily?.precipitation_probability_max?.[0] || 0,
      wind_speed: weatherData.current.wind_speed_10m,
      relative_humidity: weatherData.current.relative_humidity_2m,
      uv_index: weatherData.current.uv_index,
      uv_max: weatherData.daily?.uv_index_max?.[0] || 0,
      temp_max: weatherData.daily?.temperature_2m_max?.[0] || 0,
      temp_min: weatherData.daily?.temperature_2m_min?.[0] || 0,
      sunrise: weatherData.daily?.sunrise?.[0],
      sunset: weatherData.daily?.sunset?.[0],
      utc_offset_seconds: weatherData.utc_offset_seconds,
      
      // Marine Data
      wave_height: marineData.current?.wave_height || 0,
      water_temp: marineData.current?.water_temperature || 0,
      wave_period: marineData.current?.wave_period || 0,
      
      daily: weatherData.daily,
      hourly: weatherData.hourly
    };
  } catch (error) {
    console.error("Erro ao buscar clima:", error);
    return null;
  }
};

const generateBeachReport = async (weatherData: any, location: string) => {
  if (!ai) return [{ title: "Status", text: "Assistente IA indisponível." }];
  
  const prompt = `Analise os seguintes dados climáticos para a praia em ${location}: Temperatura: ${weatherData.temperature}°C, Sensação Térmica: ${weatherData.apparent_temperature}°C, Vento: ${weatherData.wind_speed} km/h, Probabilidade de Chuva: ${weatherData.precipitation_probability}%. Código do tempo: ${weatherData.weathercode}. 
  Responda estritamente em formato JSON, um array de objetos com "title" e "text". Dê 2 dicas rápidas para quem quer ir à praia hoje.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "Você é um especialista em praias de Maricá."
      }
    });
    
    const text = response.text;
    if (text) return JSON.parse(text);
  } catch (err) {
    console.error("Gemini Error:", err);
  }
  return [{ title: "Condições", text: "Agradável para uma caminhada." }];
};

const fetchNews = async () => {
  const fallbackNews = [
    { source: "Globo Esporte", headline: "Flamengo finaliza preparação para o clássico", summary: "O técnico Leonardo Jardim definiu a escalação titular após o último treino tático no Ninho do Urubu.", category: "Esportes", imageUrl: "https://picsum.photos/seed/flamengo1/800/600", time: "5 min" },
    { source: "Bahia Notícias", headline: "Bahia treina em dois turnos visando o Nordestão", summary: "A comissão técnica foca na parte física e finalizações para o próximo confronto decisivo na Fonte Nova.", category: "Esportes", imageUrl: "https://picsum.photos/seed/bahia1/800/600", time: "8 min" },
    { source: "G1 Política", headline: "Câmara vota projeto de reforma tributária 2026", summary: "A sessão deste domingo promete debates intensos sobre as novas alíquotas para o setor de serviços.", category: "Política", imageUrl: "https://picsum.photos/seed/politica1/800/600", time: "12 min" },
    { source: "TechCrunch", headline: "Novos recursos de IA Generativa chegam aos smartphones", summary: "A atualização de Março de 2026 traz modelos de linguagem ultrarrápidos integrados ao hardware.", category: "Tecnologia", imageUrl: "https://picsum.photos/seed/tech1/800/600", time: "15 min" },
    { source: "CNN Brasil", headline: "Mercado financeiro reage a novos dados econômicos", summary: "O Ibovespa opera em estabilidade neste início de semana com foco nas decisões do Banco Central.", category: "Economia", imageUrl: "https://picsum.photos/seed/econ1/800/600", time: "20 min" },
    { source: "UOL Esporte", headline: "Flamengo monitora mercado europeu para reforços", summary: "O clube estuda propostas para a janela de meio de ano visando fortalecer o elenco para o Mundial.", category: "Esportes", imageUrl: "https://picsum.photos/seed/flamengo2/800/600", time: "22 min" },
    { source: "Folha", headline: "Bahia confirma venda de ingressos para a Copa do Brasil", summary: "A torcida tricolor esgota os primeiros lotes para o jogo de volta na Arena Fonte Nova.", category: "Esportes", imageUrl: "https://picsum.photos/seed/bahia2/800/600", time: "25 min" },
    { source: "The Verge", headline: "Realidade Aumentada atinge novo patamar em 2026", summary: "Novos dispositivos leves prometem substituir os smartphones em tarefas do dia a dia até 2028.", category: "Tecnologia", imageUrl: "https://picsum.photos/seed/tech2/800/600", time: "30 min" },
    { source: "Estadão", headline: "Agronegócio brasileiro bate recorde de exportação", summary: "Os números do primeiro trimestre de 2026 superam as expectativas mais otimistas do setor.", category: "Economia", imageUrl: "https://picsum.photos/seed/econ2/800/600", time: "35 min" },
    { source: "BBC Brasil", headline: "Expedição na Antártida revela dados sobre o clima", summary: "Pesquisadores brasileiros participam de missão internacional para estudar o derretimento de geleiras.", category: "Ciência", imageUrl: "https://picsum.photos/seed/ciencia1/800/600", time: "40 min" },
    { source: "Globo.com", headline: "Flamengo: Elenco foca na recuperação física", summary: "Após a sequência de jogos em Março, os titulares realizam trabalhos regenerativos na academia.", category: "Esportes", imageUrl: "https://picsum.photos/seed/flamengo3/800/600", time: "45 min" },
    { source: "Bahia Notícias", headline: "Bahia projeta temporada de títulos com novo elenco", summary: "A diretoria destaca a evolução do projeto e a integração com a base para os próximos desafios.", category: "Esportes", imageUrl: "https://picsum.photos/seed/bahia3/800/600", time: "50 min" },
    { source: "Reuters", headline: "Acordos globais buscam estabilidade energética", summary: "Líderes mundiais se reúnem para discutir a transição para fontes renováveis até 2030.", category: "Mundo", imageUrl: "https://picsum.photos/seed/mundo1/800/600", time: "55 min" },
    { source: "Wired", headline: "Exploração de Marte entra em nova fase tripulada", summary: "As agências espaciais confirmam os preparativos para a primeira base permanente no planeta vermelho.", category: "Ciência", imageUrl: "https://picsum.photos/seed/ciencia2/800/600", time: "1h" },
    { source: "Exame", headline: "Startups brasileiras atraem investimentos bilionários", summary: "O cenário de inovação em 2026 mostra maturidade e foco em soluções de sustentabilidade.", category: "Economia", imageUrl: "https://picsum.photos/seed/econ3/800/600", time: "1h 5min" },
    { source: "Globo Esporte", headline: "Flamengo: Novas joias da base ganham espaço", summary: "O treinador Leonardo Jardim integra três jovens talentos ao elenco principal para a disputa do Brasileirão.", category: "Esportes", imageUrl: "https://picsum.photos/seed/flamengo4/800/600", time: "1h 10min" },
    { source: "Bahia Notícias", headline: "Bahia: Arena Fonte Nova terá melhorias tecnológicas", summary: "O projeto inclui conectividade total e novas experiências imersivas para os torcedores.", category: "Esportes", imageUrl: "https://picsum.photos/seed/bahia4/800/600", time: "1h 15min" },
    { source: "Gizmodo", headline: "Computação Quântica se torna acessível via nuvem", summary: "Empresas começam a utilizar o poder de processamento quântico para otimização logística.", category: "Ciência", imageUrl: "https://picsum.photos/seed/ciencia3/800/600", time: "1h 20min" },
    { source: "Valor Econômico", headline: "Brasil se consolida como hub de tecnologia verde", summary: "Investimentos em hidrogênio verde colocam o país na vanguarda da economia de baixo carbono.", category: "Economia", imageUrl: "https://picsum.photos/seed/econ4/800/600", time: "1h 25min" },
    { source: "O Globo", headline: "Educação Digital: Novas diretrizes para 2026", summary: "O Ministério da Educação implementa currículo focado em alfabetização em IA e programação.", category: "Tecnologia", imageUrl: "https://picsum.photos/seed/tech3/800/600", time: "1h 30min" }
  ];

  if (!ai) return fallbackNews;
  
  const topics = [
    "Política Brasil e Mundo (Últimos 15 min)",
    "Tecnologia e Inovação (Últimos 15 min)",
    "Esportes: Flamengo com técnico Leonardo Jardim (Últimos 15 min)",
    "Esportes: Bahia (Últimos 15 min)",
    "Economia e Mercado (Últimos 15 min)",
    "Ciência e Espaço (Últimos 15 min)",
    "Cultura e Entretenimento (Últimos 15 min)",
    "Saúde e Bem-estar (Últimos 15 min)"
  ];

  const fetchBatch = async (batchTopics: string[]) => {
    const now = "2026-03-15T10:00:00Z"; // Hardcoded to March 15, 2026 as requested
    const prompt = `Aja como um robô de notícias ultra-rápido (estilo Breaking News / Twitter). 
    DATA E HORA ATUAL: ${now}. 
    ESTAMOS NO ANO DE 2026. NÃO TRAGA NOTÍCIAS DE ANOS ANTERIORES.
    Sua missão é buscar as notícias mais RECENTES (preferencialmente dos últimos 15 a 30 minutos DE HOJE, 15 DE MARÇO DE 2026) sobre estes temas: ${batchTopics.join(", ")}.
    Utilize o Google News para garantir que as notícias são de AGORA.
    Traga exatamente 15 notícias impactantes por lote.
    Cada notícia deve ter:
    1. Manchete curta e urgente.
    2. Um "spoiler" ou breve explicação (2 frases) que resuma o fato principal.
    3. Uma URL de imagem real e representativa.
    
    Retorne APENAS um array JSON no formato:
    [{"source": "Google News", "headline": "Título", "summary": "Breve explicação/spoiler", "category": "Tema", "imageUrl": "URL", "time": "há X min"}]
    Não use Markdown. Apenas o JSON puro.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: "Você é um agregador de notícias de elite. Prioridade máxima: FRESCO (Breaking News). Se não houver notícias de 15 min atrás, pegue as de 1 hora, mas nunca notícias de dias atrás. O técnico do Flamengo é Leonardo Jardim."
        }
      });
      
      if (response.text) {
        const news = cleanAndParseJSON(response.text);
        return news || [];
      }
    } catch (error) {
      console.error("Erro na busca de notícias (Batch):", error);
    }
    return [];
  };

  const cleanAndParseJSON = (text: string) => {
    try {
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        const jsonStr = text.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => ({
            ...item,
            imageUrl: item.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(item.headline)}/800/600`,
            summary: item.summary || item.headline
          }));
        }
      }
    } catch (e) {
      console.error("Erro ao processar JSON de notícias:", e);
    }
    return null;
  };

  const batch1 = await fetchBatch(topics.slice(0, 4));
  const batch2 = await fetchBatch(topics.slice(4));
  
  const allNews = [...batch1, ...batch2];

  if (allNews.length >= 20) {
    return allNews.slice(0, 20);
  }

  return fallbackNews;
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
const ClockWidget = ({ currentTime, greeting, width = 300, height = 150 }) => {
  const timeSize = Math.min(width / 3.8, height / 2.5); 
  const greetingSize = Math.min(width / 15, height / 8); 
  const locationSize = Math.min(width / 20, height / 10);
  
  return (
    <div className="flex flex-col items-center justify-center h-full w-full px-4 animate-fade-in drop-shadow-lg bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5 overflow-hidden">
      <div 
        className="font-light tracking-wide opacity-80 uppercase text-yellow-400 leading-none mb-2 text-center" 
        style={{ fontSize: `${Math.max(greetingSize, 10)}px` }}
      >
        {greeting}
      </div>
      <div 
        className="font-bold tracking-tighter text-white leading-none text-center" 
        style={{ fontSize: `${Math.max(timeSize, 32)}px` }}
      >
        {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div 
        className="opacity-50 uppercase tracking-[0.2em] mt-2 text-white text-center" 
        style={{ fontSize: `${Math.max(locationSize, 9)}px` }}
      >
        Maricá - RJ
      </div>
    </div>
  );
};

// 3. Weather Widget 
const getWeatherIcon = (code: number) => {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95) return "⛈️";
  if (code >= 71 && code <= 77) return "❄️";
  return "☁️";
};

const WeatherWidget = ({ weather, locationName, beachReport, width = 300, onRefresh }) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const slides = [
    { type: 'main', title: 'Agora' },
    { type: 'marine', title: 'Condições do Mar' },
    { type: 'details', title: 'Detalhes' },
    ...(beachReport && beachReport.length > 0 ? beachReport.map(item => ({ type: 'report', title: item.title, text: item.text })) : [])
  ];

  useEffect(() => {
    setIsUpdating(true);
    setLastUpdated(new Date());
    const timer = setTimeout(() => setIsUpdating(false), 800);
    return () => clearTimeout(timer);
  }, [weather]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, 8000); 
    return () => clearInterval(interval);
  }, [slides.length]);

  const currentSlide = slides[slideIndex];
  const temp = weather?.temperature ? Math.round(Number(weather.temperature)) : '--';

  // Logic for beach flag based on wave height
  const getBeachFlag = (waveHeight: number) => {
    if (waveHeight > 2.0) return { color: 'bg-red-600', text: 'Vermelha', icon: <AlertTriangle size={16} /> };
    if (waveHeight > 1.2) return { color: 'bg-yellow-500', text: 'Amarela', icon: <Info size={16} /> };
    return { color: 'bg-green-500', text: 'Verde', icon: <CheckCircle size={16} /> };
  };

  const flag = getBeachFlag(weather?.wave_height || 0);

  return (
    <div className={`animate-float flex flex-col w-full h-full bg-black/70 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden transition-all duration-700 ${isUpdating ? 'scale-[1.02] bg-white/10' : 'scale-100'}`}>
       <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-4 shrink-0">
          <div className="flex flex-col">
            <div key={temp} className="animate-fade-in font-bold leading-none tracking-tighter text-white" style={{ fontSize: `${Math.max(40, Math.min(100, width/3.5))}px` }}>
               {temp}°
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-bold uppercase tracking-widest text-white/40">{locationName}</span>
              <div className={`px-2 py-0.5 rounded-full ${flag.color} text-[10px] font-bold text-white flex items-center gap-1 uppercase`}>
                {flag.text}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div key={weather?.weathercode} className="animate-fade-in" style={{ fontSize: `${Math.max(40, Math.min(80, width/3.5))}px`, lineHeight: 1 }}>
               {getWeatherIcon(weather?.weathercode || 0)}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white/50 hover:text-white"
              title="Atualizar clima"
            >
              <Bot size={16} className={isUpdating ? 'animate-spin' : ''} />
            </button>
          </div>
       </div>
       
       <div className="flex-1 flex flex-col relative w-full h-full overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
             <div className="h-[2px] flex-1 bg-yellow-400/30"></div>
             <span className="text-[10px] uppercase tracking-[0.3em] text-yellow-400 font-bold whitespace-nowrap">{currentSlide.title}</span>
             <div className="h-[2px] flex-1 bg-yellow-400/30"></div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">
            {currentSlide.type === 'main' && (
              <div className="animate-fade-in grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <Wind className="text-blue-400 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Vento</span>
                  <span className="text-sm font-bold">{weather?.wind_speed} km/h</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <Droplets className="text-blue-300 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Chuva</span>
                  <span className="text-sm font-bold">{weather?.precipitation_probability}%</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <Thermometer className="text-orange-400 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Sensação</span>
                  <span className="text-sm font-bold">{Math.round(weather?.apparent_temperature || 0)}°</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <Sun className="text-yellow-400 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">UV</span>
                  <span className="text-sm font-bold">{weather?.uv_index?.toFixed(1)}</span>
                </div>
              </div>
            )}

            {currentSlide.type === 'marine' && (
              <div className="animate-fade-in grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <Waves className="text-blue-400 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Ondas</span>
                  <span className="text-sm font-bold">{weather?.wave_height?.toFixed(1)}m</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <Thermometer className="text-blue-300 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Água</span>
                  <span className="text-sm font-bold">{weather?.water_temp?.toFixed(1)}°C</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <Clock className="text-blue-200 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Período</span>
                  <span className="text-sm font-bold">{weather?.wave_period}s</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                  <Navigation className="text-blue-100 mb-1" size={18} />
                  <span className="text-[10px] uppercase text-white/40 font-bold">Bandeira</span>
                  <span className="text-sm font-bold">{flag.text}</span>
                </div>
              </div>
            )}

            {currentSlide.type === 'details' && (
              <div className="animate-fade-in space-y-3">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="text-red-400" size={14} />
                    <span className="text-[10px] uppercase text-white/40 font-bold">Máxima</span>
                  </div>
                  <span className="text-sm font-bold">{Math.round(weather?.temp_max || 0)}°C</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="text-blue-400" size={14} />
                    <span className="text-[10px] uppercase text-white/40 font-bold">Mínima</span>
                  </div>
                  <span className="text-sm font-bold">{Math.round(weather?.temp_min || 0)}°C</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <CloudRain className="text-blue-300" size={14} />
                    <span className="text-[10px] uppercase text-white/40 font-bold">Precipitação</span>
                  </div>
                  <span className="text-sm font-bold">{weather?.precipitation}mm</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Sun className="text-yellow-400" size={14} />
                    <span className="text-[10px] uppercase text-white/40 font-bold">UV Máx</span>
                  </div>
                  <span className="text-sm font-bold">{weather?.uv_max?.toFixed(1)}</span>
                </div>
              </div>
            )}

            {currentSlide.type === 'report' && (
              <div key={currentSlide.title} className="animate-fade-in w-full px-2">
                <p className="text-sm md:text-base text-white/80 font-light leading-relaxed">{currentSlide.text}</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center shrink-0">
             <div className="flex gap-1">
                {slides.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === slideIndex ? 'w-4 bg-yellow-400' : 'w-1 bg-white/20'}`}></div>
                ))}
             </div>
             <span className="text-[9px] font-light text-white/30 tracking-widest uppercase">
                Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
             </span>
          </div>
       </div>
    </div>
  );
};

// 4. News Widget
const NewsWidget = ({ news: initialNews, onRefresh }) => {
  const [news, setNews] = useState(initialNews || []);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(!initialNews || initialNews.length === 0);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Estados para Imagem e IA
  const [newsImages, setNewsImages] = useState({}); // Cache de imagens: { index: base64Url }
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef(null);

  // Sync with props
  useEffect(() => {
    if (initialNews && initialNews.length > 0) {
      setNews(initialNews);
      setLoading(false);
    }
  }, [initialNews]);

  // Função para Gerar Imagem com Imagen 4.0
  const generateImageForNews = async (index, title) => {
    if (newsImages[index] || isGeneratingImage || !ai) return;

    setIsGeneratingImage(true);
    try {
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: `Professional cinematic news photography, high resolution, realistic, related to: ${title}. News broadcast style, dramatic lighting.`,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9',
        },
      });

      if (response.generatedImages && response.generatedImages[0]) {
        const base64Data = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64Data}`;
        setNewsImages(prev => ({ ...prev, [index]: imageUrl }));
      }
    } catch (err) {
      console.error("Erro ao gerar imagem:", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Busca de Notícias (Gemini + Google Search)
  const fetchNewsInternal = async () => {
    setLoading(true);
    setError(null);
    setNewsImages({}); 
    
    if (!ai) {
      // Use global fetchNews which has fallback
      const fallback = await fetchNews();
      setNews(fallback);
      setLoading(false);
      return;
    }
    
    try {
      const now = "2026-03-15"; // Hardcoded to March 15, 2026
      const prompt = `Liste as 20 notícias mais importantes e RECENTES de hoje (${now}) no Brasil e no mundo. O técnico do Flamengo é Leonardo Jardim.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: "Você é um portal de notícias de elite. Retorne APENAS um JSON: {\"articles\": [{\"title\": \"...\", \"summary\": \"...\", \"source\": \"...\", \"category\": \"...\", \"isBreaking\": boolean}]}. Traga 20 notícias.",
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text);

      if (data.articles && data.articles.length > 0) {
        setNews(data.articles);
        setLastUpdated(new Date());
        setCurrentIdx(0);
        generateImageForNews(0, data.articles[0].title);
      }
      
      // Call onRefresh prop if provided to update parent state
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      console.error("Erro ao buscar notícias:", err);
      setError("Não foi possível carregar o feed de notícias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (news[currentIdx]) {
      generateImageForNews(currentIdx, news[currentIdx].title);
    }
  }, [currentIdx, news]);

  const analyzeContext = async () => {
    if (!currentNews || isAnalyzing || !ai) return;
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const prompt = `Explique brevemente por que esta notícia é importante e dê 3 pontos de contexto: "${currentNews.title}". Considere que estamos em 15 de Março de 2026.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      setAnalysis(response.text || "Contexto não disponível.");
    } catch (err) {
      setAnalysis("Erro ao gerar análise.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const playNewsAudio = async () => {
    if (!currentNews || isSpeaking || !ai) return;
    setIsSpeaking(true);
    try {
      const textToSpeak = `Destaque: ${currentNews.title}. Resumo: ${currentNews.summary}.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: textToSpeak }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        }
      });
      
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBlob = pcmToWav(base64Audio, 24000);
        const url = URL.createObjectURL(audioBlob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.error("Erro no áudio:", err);
      setIsSpeaking(false);
    }
  };

  const pcmToWav = (base64Pcm, sampleRate) => {
    const pcmBuffer = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0)).buffer;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmBuffer.byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcmBuffer.byteLength, true);
    return new Blob([wavHeader, pcmBuffer], { type: 'audio/wav' });
  };

  useEffect(() => {
    if (news.length === 0) {
      fetchNewsInternal();
    }
    const interval = setInterval(fetchNewsInternal, 20 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (news.length === 0 || isAnalyzing || isSpeaking || isGeneratingImage) return;
    const rotate = setInterval(() => {
      setAnalysis(null);
      setCurrentIdx((prev) => (prev + 1) % news.length);
    }, 15000);
    return () => clearInterval(rotate);
  }, [news, isAnalyzing, isSpeaking, isGeneratingImage]);

  const currentNews = news[currentIdx];
  const currentImageUrl = newsImages[currentIdx];

  if (loading && news.length === 0) {
    return (
      <div className="w-full h-full bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 shadow-2xl flex flex-col items-center justify-center text-center">
        <Loader2 size={40} className="text-red-600 animate-spin mb-4" />
        <p className="text-white/40 text-sm uppercase tracking-widest animate-pulse">Sintonizando Satélites...</p>
      </div>
    );
  }

  if (error && news.length === 0) {
    return (
      <div className="w-full h-full bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 shadow-2xl flex flex-col items-center justify-center text-center">
        <AlertTriangle size={40} className="text-red-500 mb-4" />
        <p className="text-white/60 text-sm mb-4">{error}</p>
        <button onClick={fetchNewsInternal} className="bg-red-700 hover:bg-red-600 px-6 py-2 rounded-full font-bold transition-all text-xs uppercase">Tentar Novamente</button>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden relative group">
      <audio ref={audioRef} hidden />
      
      {/* Background Cinematic Image */}
      {currentImageUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-40">
          <img 
            src={currentImageUrl} 
            alt="News background" 
            className="w-full h-full object-cover animate-ken-burns"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 text-white font-black px-2 py-0.5 italic text-[10px] rounded">LIVE NEWS 24/7</div>
            <div className="hidden sm:flex items-center gap-2 text-white/40 text-[8px] font-bold uppercase tracking-widest">
              <Globe size={12} className="animate-pulse" /> Global Signal
            </div>
          </div>
          <button onClick={() => { onRefresh?.(); fetchNewsInternal(); }} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white/50">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Content */}
        {currentNews && (
          <div className="flex-1 flex flex-col justify-end">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-600/80 text-[8px] font-black uppercase px-2 py-0.5 rounded">{currentNews.category}</span>
              {currentNews.isBreaking && (
                <span className="bg-red-600 animate-pulse text-[8px] font-black uppercase px-2 py-0.5 rounded">Urgente</span>
              )}
            </div>

            <h2 className="text-lg md:text-xl font-black text-white leading-tight mb-2 tracking-tight line-clamp-2 uppercase italic">
              {currentNews.title}
            </h2>

            {analysis ? (
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-3 rounded-xl mb-3 relative animate-in fade-in slide-in-from-bottom-2">
                <button onClick={() => setAnalysis(null)} className="absolute top-2 right-2 text-white/30 hover:text-white"><X size={14}/></button>
                <div className="text-purple-400 text-[8px] font-bold uppercase mb-1 flex items-center gap-1">
                  <Sparkles size={10} /> Análise IA
                </div>
                <p className="text-[10px] text-slate-200 font-light leading-relaxed line-clamp-3">{analysis}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-light mb-4 italic leading-relaxed line-clamp-2">
                "{currentNews.summary}"
              </p>
            )}

            <div className="flex gap-2 mb-4">
              <button onClick={analyzeContext} disabled={isAnalyzing} className="flex-1 bg-purple-700/60 hover:bg-purple-600 backdrop-blur-md text-[8px] font-black uppercase py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />} Contexto
              </button>
              <button onClick={playNewsAudio} disabled={isSpeaking} className="flex-1 bg-emerald-700/60 hover:bg-emerald-600 backdrop-blur-md text-[8px] font-black uppercase py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                {isSpeaking ? <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" /> : <Volume2 size={10} />} Ouvir
              </button>
            </div>

            <div className="flex items-center gap-3 text-[8px] font-bold text-slate-500 uppercase tracking-widest">
              <Newspaper size={12} className="text-red-600" />
              <span className="truncate">FONTE: {currentNews.source}</span>
              <div className="h-px flex-grow bg-white/10" />
              <span className="shrink-0">{currentIdx + 1} / {news.length}</span>
            </div>
          </div>
        )}

        {/* Footer Ticker */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center overflow-hidden shrink-0">
          <div className="whitespace-nowrap animate-ticker flex items-center gap-8 font-bold text-[9px] text-white/30 uppercase">
            {news.length > 0 ? [...news, ...news].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-red-700 font-black">•</span>
                <span>{item.title}</span>
              </div>
            )) : <span className="opacity-50">Sintonizando feed global...</span>}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker { animation: ticker 60s linear infinite; }
        
        @keyframes ken-burns {
          0% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.1) translate(-1%, -1%); }
          100% { transform: scale(1) translate(0, 0); }
        }
        .animate-ken-burns {
          animation: ken-burns 30s ease-in-out infinite;
        }
      `}</style>
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

  const handleSend = async (e: any) => {
    e.preventDefault();
    if (!input.trim() || loading || !ai) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    let attempt = 0;
    while (attempt < 5) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: userMsg,
          config: {
            systemInstruction: "Você é um assistente virtual de um protetor de tela inteligente localizado em Maricá, RJ. Seja conciso e educado."
          }
        });
        
        const text = response.text || "Desculpe, não consegui processar isso.";
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

// 6. Radio Player (JB FM)
const RadioPlayer: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayingRadio, setIsPlayingRadio] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted && isPlayingRadio && audioRef.current) {
        audioRef.current.play().catch(e => console.log("Ainda bloqueado:", e));
        setHasInteracted(true);
      }
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [hasInteracted, isPlayingRadio]);

  useEffect(() => {
    if (isPlaying && isPlayingRadio && audioRef.current) {
      audioRef.current.play().catch(e => console.log("Autoplay bloqueado:", e));
    } else if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying, isPlayingRadio]);

  return (
    <div className="absolute top-8 right-8 z-50 flex items-center gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
      <audio ref={audioRef} src="https://playerservices.streamtheworld.com/api/livestream-redirect/JBFMAAC.aac" />
      <div className="flex items-center gap-2">
        <Music size={16} className={isPlayingRadio ? "text-yellow-400 animate-pulse" : "text-white/40"} />
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">JB FM 99.9</span>
      </div>
      <button 
        onClick={() => setIsPlayingRadio(!isPlayingRadio)}
        className={`w-10 h-6 rounded-full relative transition-colors ${isPlayingRadio ? 'bg-yellow-500' : 'bg-white/20'}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isPlayingRadio ? 'translate-x-5' : 'translate-x-1'}`} />
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
  const [news, setNews] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasStarted, setHasStarted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLayoutLocked, setIsLayoutLocked] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [userCoords, setUserCoords] = useState(MARICA_COORDS);
  const [locationName, setLocationName] = useState("Maricá - RJ");
  
  const [selectedWidget, setSelectedWidget] = useState(null);
  
  const [widgets, setWidgets] = useState({
    clock: { width: 400, height: 160, x: 0, y: 0 },
    news: { width: 350, height: 600, x: 0, y: 0 }, 
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
        news: { width: sideColumnWidth, height: h - (padding * 2), x: padding, y: padding },
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
      const newsHeight = 400;
      
      setWidgets(prev => ({
        ...prev,
        clock: { width: widgetWidth, height: clockHeight, x: padding, y: padding },
        weather: { width: widgetWidth, height: weatherHeight, x: padding, y: padding + clockHeight + padding },
        date: { width: widgetWidth, height: dateHeight, x: padding, y: padding + clockHeight + weatherHeight + (padding * 2) },
        news: { width: widgetWidth, height: newsHeight, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + (padding * 3) },
        prev: { width: (widgetWidth / 2) - (padding / 2), height: 80, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + newsHeight + (padding * 4) },
        next: { width: (widgetWidth / 2) - (padding / 2), height: 80, x: padding + (widgetWidth / 2) + (padding / 2), y: padding + clockHeight + weatherHeight + dateHeight + newsHeight + (padding * 4) }
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

  const loadData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const weatherData = await fetchWeatherData(userCoords);
      if (weatherData) {
        setWeather(weatherData);
        const report = await generateBeachReport(weatherData, locationName);
        if (report && report.length > 0) setBeachReport(report);
      }
      
      const newsData = await fetchNews();
      if (newsData && newsData.length > 0) setNews(newsData);
    } catch (e) { console.error("Erro no ciclo de dados:", e); }
  }, [userCoords, locationName]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = { lat: position.coords.latitude, lon: position.coords.longitude };
          setUserCoords(coords);
          // Simple check to see if we are in Maricá or not
          const dist = Math.sqrt(Math.pow(coords.lat - MARICA_COORDS.lat, 2) + Math.pow(coords.lon - MARICA_COORDS.lon, 2));
          if (dist > 0.1) {
            setLocationName("Minha Localização");
          } else {
            setLocationName("Maricá - RJ");
          }
        },
        (error) => console.log("Erro ao obter localização:", error),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 600000); // 10 mins
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isLayoutLocked) setSelectedWidget(null);
  }, [isLayoutLocked]);

  const getBackgroundStyle = () => {
    const code = weather?.weathercode ?? 0;
    const isDay = weather ? weather.is_day !== 0 : true;
    
    // Accurate local time calculation for the location
    const now = currentTime.getTime();
    const browserOffset = currentTime.getTimezoneOffset() * 60000;
    const utcTime = now + browserOffset;
    const locationOffset = (weather?.utc_offset_seconds || 0) * 1000;
    const locationTime = new Date(utcTime + locationOffset);
    
    const sunriseStr = weather?.sunrise; // e.g. "2026-03-12T06:12"
    const sunsetStr = weather?.sunset;
    
    let timeOfDay = isDay ? 'day' : 'night';
    
    if (sunriseStr && sunsetStr) {
      // Parse strings as local time of the location
      const [sDate, sTime] = sunriseStr.split('T');
      const [srH, srM] = sTime.split(':').map(Number);
      const [ssDate, ssTime] = sunsetStr.split('T');
      const [ssH, ssM] = ssTime.split(':').map(Number);
      
      const locH = locationTime.getHours();
      const locM = locationTime.getMinutes();
      const locTotalMin = locH * 60 + locM;
      const srTotalMin = srH * 60 + srM;
      const ssTotalMin = ssH * 60 + ssM;
      
      // 1 hour window for sunrise/sunset
      if (Math.abs(locTotalMin - srTotalMin) <= 60) timeOfDay = 'sunrise';
      else if (Math.abs(locTotalMin - ssTotalMin) <= 60) timeOfDay = 'sunset';
    }

    let imageId = '';
    
    if (timeOfDay === 'sunrise') {
      imageId = '1500382017468-9049fed747ef'; // Dawn beach
    } else if (timeOfDay === 'sunset') {
      imageId = '1495616191278-27c00009767f'; // Sunset ocean
    } else if (timeOfDay === 'night') {
      if (code >= 50) imageId = '1515694346937-94d85e41e6f0'; // Rainy night
      else if (code >= 1) imageId = '1536152470836-b943b246224c'; // Cloudy night
      else imageId = '1506318137071-a8e063b4bec0'; // Clear night
    } else {
      // Day time
      if (code >= 95) imageId = '1605727216801-e27ce1d0cc28'; // Storm
      else if (code >= 50) imageId = '1515694346937-94d85e41e6f0'; // Rain
      else if (code >= 3) imageId = '1483728642387-6c3bdd6c93e5'; // Overcast
      else if (code >= 1) imageId = '1534088568595-a066f410cbda'; // Partly Cloudy
      else imageId = '1507525428034-b723cf961d3e'; // Sunny Beach
    }

    const imageUrl = `https://images.unsplash.com/photo-${imageId}?q=80&w=2560&auto=format&fit=crop`;

    return { 
      backgroundImage: `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.4)), url("${imageUrl}")`,
      backgroundSize: 'cover', 
      backgroundPosition: 'center',
      transition: 'background-image 3s ease-in-out',
      backgroundColor: '#1a1a1a'
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

  const isRaining = (weather?.weathercode >= 51 && weather?.weathercode <= 67) || 
                    (weather?.weathercode >= 80 && weather?.weathercode <= 82) ||
                    (weather?.weathercode >= 95);

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

        <RadioPlayer isPlaying={hasStarted} />
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
            <ClockWidget currentTime={currentTime} greeting={currentTime.getHours() < 12 ? 'Bom dia' : currentTime.getHours() < 18 ? 'Boa tarde' : 'Boa noite'} width={widgets.clock.width} height={widgets.clock.height} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.news.width} height={widgets.news.height} locked={isLayoutLocked} position={{ x: widgets.news.x, y: widgets.news.y }} isSelected={selectedWidget === 'news'} onSelect={() => setSelectedWidget('news')} onResize={(w, h) => updateWidget('news', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('news', { x, y })}>
            <NewsWidget news={news} onRefresh={loadData} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.weather.width} height={widgets.weather.height} locked={isLayoutLocked} position={{ x: widgets.weather.x, y: widgets.weather.y }} isSelected={selectedWidget === 'weather'} onSelect={() => setSelectedWidget('weather')} onResize={(w, h) => updateWidget('weather', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('weather', { x, y })}>
            <WeatherWidget weather={weather} locationName={locationName} beachReport={beachReport} width={widgets.weather.width} onRefresh={loadData} />
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

