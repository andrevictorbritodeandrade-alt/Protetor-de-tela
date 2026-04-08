import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRight, ArrowLeft, Lock, Edit3, Maximize, Minimize, PlayCircle, 
  WifiOff, Trash2, Plus, MessageCircle, X, Cloud, Sun, Moon, CloudRain, 
  CloudLightning, Wind, Droplets, Thermometer, Music, Bot, Send,
  GripHorizontal, Bell, Waves, MapPin, ThermometerSun, ArrowUp, ArrowDown, ThumbsUp, Skull,
  AlertTriangle, Info, CheckCircle, Navigation, Clock, Newspaper, Globe,
  TrendingUp, AlertCircle, RefreshCcw, Sparkles, Volume2, Image as ImageIcon, Loader2, Download,
  Menu, ArrowUpRight, Activity, Eye, AlarmClock, History, Calendar
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
    // 1. Fetch Weather Forecast (using the extensive parameters provided by the user)
    const currentParams = [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day", 
      "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "precipitation", 
      "rain", "showers", "weather_code", "cloud_cover", "pressure_msl", "surface_pressure",
      "uv_index" // Added to keep UI working
    ].join(",");

    const hourlyParams = [
      "temperature_2m", "rain", "precipitation", "precipitation_probability", 
      "apparent_temperature", "dew_point_2m", "relative_humidity_2m", "weather_code", 
      "pressure_msl", "surface_pressure", "cloud_cover", "cloud_cover_low", 
      "cloud_cover_mid", "cloud_cover_high", "visibility", "evapotranspiration", 
      "wind_speed_10m", "wind_speed_80m", "wind_speed_120m", "wind_speed_180m", 
      "wind_direction_10m", "wind_direction_80m", "wind_direction_120m", 
      "wind_direction_180m", "wind_gusts_10m", "temperature_80m", "temperature_120m", 
      "temperature_180m", "soil_temperature_0cm", "soil_temperature_6cm", 
      "soil_temperature_18cm", "soil_temperature_54cm", "soil_moisture_0_to_1cm", 
      "soil_moisture_1_to_3cm", "soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm", 
      "soil_moisture_27_to_81cm"
    ].join(",");

    const dailyParams = [
      "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", 
      "apparent_temperature_min", "sunrise", "sunset", "daylight_duration", 
      "sunshine_duration", "uv_index_clear_sky_max", "uv_index_max", "showers_sum", "rain_sum", 
      "precipitation_sum", "precipitation_hours", "precipitation_probability_max", 
      "wind_speed_10m_max", "wind_gusts_10m_max", "shortwave_radiation_sum", 
      "wind_direction_10m_dominant", "et0_fao_evapotranspiration"
    ].join(",");

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=${currentParams}&hourly=${hourlyParams}&daily=${dailyParams}&timezone=auto&forecast_days=16&past_days=10`;
    const weatherRes = await fetch(weatherUrl);
    const weatherData = await weatherRes.json();

    // 2. Fetch Air Quality
    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${coords.lat}&longitude=${coords.lon}&current=european_aqi&timezone=auto`;
    const aqiRes = await fetch(aqiUrl);
    const aqiData = await aqiRes.json();

    // 3. Fetch Marine Data (Wave height, water temperature)
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${coords.lat}&longitude=${coords.lon}&current=wave_height,wave_direction,wave_period,swell_wave_height,water_temperature&timezone=auto`;
    const marineRes = await fetch(marineUrl);
    const marineData = await marineRes.json();
    
    if (!weatherData.current || !weatherData.daily || !weatherData.hourly) {
      console.error("Dados meteorológicos incompletos:", weatherData);
      return null;
    }

    let weatherCode = weatherData.current.weather_code;
    const isRainingNow = (weatherData.current.precipitation > 0 || weatherData.current.rain > 0 || weatherData.current.showers > 0);
    
    if (isRainingNow && weatherCode < 50) {
      weatherCode = 61; 
    }

    const hourlyTime = weatherData.hourly.time || [];
    const todayDailyIdx = 10; // past_days=10, so index 10 is today
    const currentHourlyIdx = weatherData.hourly.time.findIndex((t: string) => new Date(t) > new Date()) || (weatherData.hourly.time.length - 1);

    return {
      temperature: weatherData.current.temperature_2m,
      apparent_temperature: weatherData.current.apparent_temperature,
      weathercode: weatherCode,
      is_day: weatherData.current.is_day,
      precipitation: weatherData.current.precipitation,
      precipitation_probability: weatherData.daily?.precipitation_probability_max?.[todayDailyIdx] || 0,
      wind_speed: weatherData.current.wind_speed_10m,
      relative_humidity: weatherData.current.relative_humidity_2m,
      uv_index: weatherData.current.uv_index || weatherData.daily?.uv_index_max?.[todayDailyIdx] || 0,
      uv_max: weatherData.daily?.uv_index_max?.[todayDailyIdx] || 0,
      temp_max: weatherData.daily?.temperature_2m_max?.[todayDailyIdx] || 0,
      temp_min: weatherData.daily?.temperature_2m_min?.[todayDailyIdx] || 0,
      sunrise: weatherData.daily?.sunrise?.[todayDailyIdx],
      sunset: weatherData.daily?.sunset?.[todayDailyIdx],
      utc_offset_seconds: weatherData.utc_offset_seconds,
      surface_pressure: weatherData.current.surface_pressure,
      visibility: weatherData.hourly?.visibility?.[currentHourlyIdx] || 0,
      dew_point: weatherData.hourly?.dew_point_2m?.[currentHourlyIdx] || 0,
      aqi: aqiData.current?.european_aqi || 0,
      
      // Additional requested info
      cloud_cover: weatherData.current.cloud_cover,
      wind_gusts: weatherData.current.wind_gusts_10m,
      rain_sum: weatherData.daily?.rain_sum?.[todayDailyIdx] || 0,
      snow_sum: weatherData.daily?.showers_sum?.[todayDailyIdx] || 0,
      uv_clear_sky: weatherData.daily?.uv_index_clear_sky_max?.[todayDailyIdx] || 0,
      daylight_duration: weatherData.daily?.daylight_duration?.[todayDailyIdx] || 0,
      sunshine_duration: weatherData.daily?.sunshine_duration?.[todayDailyIdx] || 0,
      shortwave_radiation_sum: weatherData.daily?.shortwave_radiation_sum?.[todayDailyIdx] || 0,
      evapotranspiration: weatherData.daily?.et0_fao_evapotranspiration?.[todayDailyIdx] || 0,
      
      // Soil data (surface)
      soil_temp: weatherData.hourly?.soil_temperature_0cm?.[currentHourlyIdx] || 0,
      soil_moisture: weatherData.hourly?.soil_moisture_0_to_1cm?.[currentHourlyIdx] || 0,
      
      // Cloud layers
      cloud_low: weatherData.hourly?.cloud_cover_low?.[currentHourlyIdx] || 0,
      cloud_mid: weatherData.hourly?.cloud_cover_mid?.[currentHourlyIdx] || 0,
      cloud_high: weatherData.hourly?.cloud_cover_high?.[currentHourlyIdx] || 0,

      // Marine Data
      wave_height: marineData.current?.wave_height || 0,
      water_temp: marineData.current?.water_temperature || 0,
      wave_period: marineData.current?.wave_period || 0,
      
      daily: weatherData.daily,
      hourly: weatherData.hourly,
      historical: {
        time: weatherData.hourly.time.slice(0, 240),
        temp: weatherData.hourly.temperature_2m.slice(0, 240),
        precip: weatherData.hourly.precipitation_probability.slice(0, 240)
      }
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
    { source: "Globo Esporte", title: "Flamengo finaliza preparação para o clássico", summary: "O técnico Leonardo Jardim definiu a escalação titular após o último treino tático no Ninho do Urubu.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/flamengo,soccer", time: "5 min" },
    { source: "Bahia Notícias", title: "Bahia treina em dois turnos visando o Nordestão", summary: "A comissão técnica foca na parte física e finalizações para o próximo confronto decisivo na Fonte Nova.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/salvador,bahia,soccer", time: "8 min" },
    { source: "G1 Política", title: "Câmara vota projeto de reforma tributária 2026", summary: "A sessão deste domingo promete debates intensos sobre as novas alíquotas para o setor de serviços.", category: "Política", imageUrl: "https://loremflickr.com/800/600/politics,brazil", time: "12 min" },
    { source: "TechCrunch", title: "Novos recursos de IA Generativa chegam aos smartphones", summary: "A atualização de Março de 2026 traz modelos de linguagem ultrarrápidos integrados ao hardware.", category: "Tecnologia", imageUrl: "https://loremflickr.com/800/600/technology,smartphone", time: "15 min" },
    { source: "CNN Brasil", title: "Mercado financeiro reage a novos dados econômicos", summary: "O Ibovespa opera em estabilidade neste início de semana com foco nas decisões do Banco Central.", category: "Economia", imageUrl: "https://loremflickr.com/800/600/economy,finance", time: "20 min" },
    { source: "UOL Esporte", title: "Flamengo monitora mercado europeu para reforços", summary: "O clube estuda propostas para a janela de meio de ano visando fortalecer o elenco para o Mundial.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/flamengo,stadium", time: "22 min" },
    { source: "Folha", title: "Bahia confirma venda de ingressos para a Copa do Brasil", summary: "A torcida tricolor esgota os primeiros lotes para o jogo de volta na Arena Fonte Nova.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/bahia,arena", time: "25 min" },
    { source: "The Verge", title: "Realidade Aumentada atinge novo patamar em 2026", summary: "Novos dispositivos leves prometem substituir os smartphones em tarefas do dia a dia até 2028.", category: "Tecnologia", imageUrl: "https://loremflickr.com/800/600/tech,future", time: "30 min" },
    { source: "Estadão", title: "Agronegócio brasileiro bate recorde de exportação", summary: "Os números do primeiro trimestre de 2026 superam as expectativas mais otimistas do setor.", category: "Economia", imageUrl: "https://loremflickr.com/800/600/agriculture,brazil", time: "35 min" },
    { source: "BBC Brasil", title: "Expedição na Antártida revela dados sobre o clima", summary: "Pesquisadores brasileiros participam de missão internacional para estudar o derretimento de geleiras.", category: "Ciência", imageUrl: "https://loremflickr.com/800/600/antarctica,ice", time: "40 min" },
    { source: "Globo.com", title: "Flamengo: Elenco foca na recuperação física", summary: "Após a sequência de jogos em Março, os titulares realizam trabalhos regenerativos na academia.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/gym,training", time: "45 min" },
    { source: "Bahia Notícias", title: "Bahia projeta temporada de títulos com novo elenco", summary: "A diretoria destaca a evolução do projeto e a integração com a base para os próximos desafios.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/soccer,team", time: "50 min" },
    { source: "Reuters", title: "Acordos globais buscam estabilidade energética", summary: "Líderes mundiais se reúnem para discutir a transição para fontes renováveis até 2030.", category: "Mundo", imageUrl: "https://loremflickr.com/800/600/energy,renewable", time: "55 min" },
    { source: "Wired", title: "Exploração de Marte entra em nova fase tripulada", summary: "As agências espaciais confirmam os preparativos para a primeira base permanente no planeta vermelho.", category: "Ciência", imageUrl: "https://loremflickr.com/800/600/mars,space", time: "1h" },
    { source: "Exame", title: "Startups brasileiras atraem investimentos bilionários", summary: "O cenário de inovação em 2026 mostra maturidade e foco em soluções de sustentabilidade.", category: "Economia", imageUrl: "https://loremflickr.com/800/600/startup,office", time: "1h 5min" },
    { source: "Globo Esporte", title: "Flamengo: Novas joias da base ganham espaço", summary: "O treinador Leonardo Jardim integra três jovens talentos ao elenco principal para a disputa do Brasileirão.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/soccer,youth", time: "1h 10min" },
    { source: "Bahia Notícias", title: "Bahia: Arena Fonte Nova terá melhorias tecnológicas", summary: "O projeto inclui conectividade total e novas experiências imersivas para os torcedores.", category: "Esportes", imageUrl: "https://loremflickr.com/800/600/stadium,tech", time: "1h 15min" },
    { source: "Gizmodo", title: "Computação Quântica se torna acessível via nuvem", summary: "Empresas começam a utilizar o poder de processamento quântico para otimização logística.", category: "Ciência", imageUrl: "https://loremflickr.com/800/600/quantum,computer", time: "1h 20min" },
    { source: "Valor Econômico", title: "Brasil se consolida como hub de tecnologia verde", summary: "Investimentos em hidrogênio verde colocam o país na vanguarda da economia de baixo carbono.", category: "Economia", imageUrl: "https://loremflickr.com/800/600/green,energy", time: "1h 25min" },
    { source: "O Globo", title: "Educação Digital: Novas diretrizes para 2026", summary: "O Ministério da Educação implementa currículo focado em alfabetização em IA e programação.", category: "Tecnologia", imageUrl: "https://loremflickr.com/800/600/education,coding", time: "1h 30min" }
  ];

  const newsApiKey = "06af7a659b144caf9db53213bbd5e392";
  
  // Obter data de hoje (YYYY-MM-DD)
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  // Assuntos solicitados: esportes, política, tecnologia
  const query = encodeURIComponent('esporte OR política OR tecnologia OR sports OR politics OR technology');
  // Domínios variados incluindo WSJ conforme pedido
  const domains = "wsj.com,reuters.com,techcrunch.com,theverge.com,wired.com,globo.com,uol.com.br";
  
  const url = `https://newsapi.org/v2/everything?q=${query}&domains=${domains}&from=${todayStr}&to=${todayStr}&apiKey=${newsApiKey}&sortBy=publishedAt&pageSize=50`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === "ok" && data.articles && data.articles.length > 0) {
      const mappedNews = data.articles
        .filter((article: any) => article.urlToImage) // Apenas notícias com imagem real
        .map((article: any) => ({
          source: article.source.name,
          title: article.title,
          summary: article.description || article.content || article.title,
          category: article.source.name === "The Wall Street Journal" ? "WSJ" : "News",
          imageUrl: article.urlToImage,
          time: new Date(article.publishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));

      if (mappedNews.length > 0) {
        // Garantir 50 itens repetindo se necessário
        let finalNews = [...mappedNews];
        while (finalNews.length < 50 && finalNews.length > 0) {
          finalNews = [...finalNews, ...mappedNews].slice(0, 50);
        }
        return finalNews;
      }
    }
  } catch (error) {
    console.error("Erro ao buscar notícias no NewsAPI:", error);
  }

  // Fallback se tudo falhar
  let finalFallback = [...fallbackNews];
  while (finalFallback.length < 50) {
    finalFallback = [...finalFallback, ...fallbackNews].slice(0, 50);
  }
  return finalFallback;
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
    <div className="flex flex-col items-center justify-center h-full w-full px-2 animate-fade-in drop-shadow-lg bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5 overflow-hidden">
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

const WeatherWidget = ({ weather, locationName, onRefresh }: { weather: any, locationName: string, onRefresh: () => void }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setIsUpdating(true);
    setLastUpdated(new Date());
    const timer = setTimeout(() => setIsUpdating(false), 800);
    return () => clearTimeout(timer);
  }, [weather]);

  // Auto-rotate pages
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % 4);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!weather) return <div className="flex items-center justify-center h-full text-white/50">Carregando clima...</div>;

  const temp = Math.round(Number(weather.temperature));
  const tempMax = Math.round(Number(weather.temp_max));
  const tempMin = Math.round(Number(weather.temp_min));
  const apparentTemp = Math.round(Number(weather.apparent_temperature));
  
  // Helper for day names
  const getDayName = (dateString: string, index: number) => {
    if (index === 0) return 'Hoje';
    if (index === 1) return 'Amanhã';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { weekday: 'long' });
  };

  // Condition text
  const getConditionText = (code: number) => {
    if (code === 0) return "Ensolarado";
    if (code <= 3) return "Parcialmente nublado";
    if (code === 45 || code === 48) return "Neblina";
    if (code >= 51 && code <= 67) return "Chuva";
    if (code >= 80 && code <= 82) return "Pancadas de chuva";
    if (code >= 95) return "Tempestade";
    if (code >= 71 && code <= 77) return "Neve";
    return "Nublado";
  };

  // UV Index text
  const getUvText = (uv: number) => {
    if (uv <= 2) return "Baixo";
    if (uv <= 5) return "Moderado";
    if (uv <= 7) return "Alto";
    if (uv <= 10) return "Muito Alto";
    return "Extremo";
  };

  // AQI text
  const getAqiText = (aqi: number) => {
    if (aqi <= 20) return "Boa";
    if (aqi <= 40) return "Razoável";
    if (aqi <= 60) return "Moderada";
    if (aqi <= 80) return "Ruim";
    return "Muito Ruim";
  };

  // Hourly forecast (next 24 hours)
  const currentHourIndex = weather.hourly?.time?.findIndex((t: string) => new Date(t) > new Date()) || 0;
  const nextHours = weather.hourly?.time?.slice(currentHourIndex, currentHourIndex + 24) || [];
  
  const hourlyTemp = weather.hourly?.temperature_2m || [];
  const hourlyCode = weather.hourly?.weather_code || [];
  const hourlyPrecip = weather.hourly?.precipitation_probability || [];

  const pages = [
    // Page 0: Main & Hourly
    <div key="page0" className="flex flex-col h-full justify-between">
      <div className="flex justify-between items-start mt-2">
        <div className="flex flex-col text-white">
          <div className="text-[120px] font-light leading-none tracking-tighter -ml-2">{temp}°</div>
          <div className="text-3xl font-medium mt-2">{getConditionText(weather.weathercode)}</div>
          <div className="text-xl mt-4 font-medium opacity-90">
            {tempMax}° / {tempMin}° Sensação térmica de {apparentTemp}°
          </div>
        </div>
        <div className="text-[100px] leading-none mt-4 drop-shadow-lg">
          {getWeatherIcon(weather.weathercode)}
        </div>
      </div>

      <div className="relative flex-1 flex flex-col justify-end pb-4">
        <p className="text-white font-medium mb-6 text-base">
          {getConditionText(weather.weathercode)}. Máximas de {tempMax}°C e mínimas de {tempMin}°C.
        </p>
        <div className="flex overflow-x-auto no-scrollbar gap-8 pb-4 relative">
          <svg className="absolute top-16 left-0 w-[800px] h-10 pointer-events-none" preserveAspectRatio="none">
            <path 
              d={`M ${nextHours.slice(0, 12).map((_, i) => {
                const idx = currentHourIndex + i;
                const hTemp = Math.round(hourlyTemp[idx] || 0);
                const temps = hourlyTemp.slice(currentHourIndex, currentHourIndex + 12);
                const minT = temps.length > 0 ? Math.min(...temps) : 0;
                const maxT = temps.length > 0 ? Math.max(...temps) : 100;
                const y = 40 - ((hTemp - minT) / (maxT - minT || 1)) * 30;
                return `${i * 64 + 20},${y}`;
              }).join(' L ')}`}
              fill="none" stroke="#FBBF24" strokeWidth="2" 
            />
            {nextHours.slice(0, 12).map((_, i) => {
              const idx = currentHourIndex + i;
              const hTemp = Math.round(hourlyTemp[idx] || 0);
              const temps = hourlyTemp.slice(currentHourIndex, currentHourIndex + 12);
              const minT = temps.length > 0 ? Math.min(...temps) : 0;
              const maxT = temps.length > 0 ? Math.max(...temps) : 100;
              const y = 40 - ((hTemp - minT) / (maxT - minT || 1)) * 30;
              return <circle key={i} cx={i * 64 + 20} cy={y} r="3" fill="#FBBF24" />;
            })}
          </svg>
          
          {nextHours.slice(0, 12).map((timeStr: string, i: number) => {
            const idx = currentHourIndex + i;
            const hTemp = Math.round(hourlyTemp[idx] || 0);
            const hCode = hourlyCode[idx] || 0;
            const hPrecip = hourlyPrecip[idx] || 0;
            const date = new Date(timeStr);
            return (
              <div key={i} className="flex flex-col items-center min-w-[40px] text-white z-10">
                <span className="text-sm mb-2">{i === 0 ? 'Agora' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-2xl mb-2">{getWeatherIcon(hCode)}</span>
                <span className="text-lg font-medium mb-6">{hTemp}°</span>
                {hPrecip > 0 ? (
                  <div className="flex items-center gap-1 text-blue-200 text-xs mt-auto">
                    <Droplets size={10} />
                    <span>{hPrecip}%</span>
                  </div>
                ) : (
                  <div className="h-4 mt-auto"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,

    // Page 1: 7-Day Forecast & UV
    <div key="page1" className="flex flex-col h-full gap-6">
      <div className="flex flex-col">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Calendar size={18} /> Previsão de 7 Dias
        </h3>
        <div className="flex flex-col gap-4">
          {weather.daily?.time?.slice(10, 17).map((dateStr: string, i: number) => {
            const idx = 10 + i;
            const dMax = weather.daily.temperature_2m_max?.[idx] || 0;
            const dMin = weather.daily.temperature_2m_min?.[idx] || 0;
            const dCode = weather.daily.weather_code?.[idx] || 0;
            const dPrecip = weather.daily.precipitation_probability_max?.[idx] || 0;
            
            return (
              <div key={i} className="flex items-center justify-between text-white">
                <span className="w-28 text-base font-medium capitalize">{getDayName(dateStr, i)}</span>
                <div className="flex items-center gap-1 w-16 text-blue-200 text-xs">
                  {dPrecip > 0 && (
                    <>
                      <Droplets size={12} />
                      <span>{dPrecip}%</span>
                    </>
                  )}
                </div>
                <span className="text-2xl w-10 text-center">{getWeatherIcon(dCode)}</span>
                <div className="flex justify-end gap-3 w-20 text-base font-medium">
                  <span>{Math.round(dMax)}°</span>
                  <span className="text-white/60">{Math.round(dMin)}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-white/80 mb-2">
          <Sun size={16} />
          <span className="text-sm font-medium">Índice UV</span>
        </div>
        <p className="text-white text-sm mb-4">
          Os raios UV estão {getUvText(weather.uv_index).toLowerCase()}s.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, (weather.uv_index / 11) * 100)}%` }}></div>
          </div>
          <span className="text-white font-bold text-xl">{weather.uv_index.toFixed(0)}</span>
        </div>
      </div>
    </div>,

    // Page 2: Air Quality & Marine & Basic Metrics
    <div key="page2" className="flex flex-col h-full gap-6">
      <div className="flex flex-col items-center">
        <span className="text-white/80 text-xs font-medium uppercase tracking-wider mb-1">Qualidade do Ar</span>
        <span className="text-white text-lg font-bold mb-3">{getAqiText(weather.aqi)} ({weather.aqi})</span>
        <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden flex">
          <div className="h-full bg-green-400" style={{ width: '20%' }}></div>
          <div className="h-full bg-yellow-400" style={{ width: '40%' }}></div>
          <div className="h-full bg-orange-400" style={{ width: '20%' }}></div>
          <div className="h-full bg-red-500" style={{ width: '20%' }}></div>
        </div>
        <div className="w-full relative mt-1">
           <div className="absolute top-[-10px] w-3 h-3 bg-white rounded-full shadow-md border-2 border-blue-500" style={{ left: `${Math.min(95, (weather.aqi / 100) * 100)}%` }}></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-white/80 mb-2">
            <Droplets size={14} />
            <span className="text-xs font-medium">Umidade</span>
          </div>
          <span className="text-white text-xl font-bold">{weather.relative_humidity}%</span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-white/80 mb-2">
            <Wind size={14} />
            <span className="text-xs font-medium">Vento</span>
          </div>
          <span className="text-white text-xl font-bold">{weather.wind_speed} km/h</span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-white/80 mb-2">
            <Waves size={14} />
            <span className="text-xs font-medium">Ondas</span>
          </div>
          <span className="text-white text-xl font-bold">{weather.wave_height}m</span>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-white/80 mb-2">
            <Thermometer size={14} />
            <span className="text-xs font-medium">Água</span>
          </div>
          <span className="text-white text-xl font-bold">{weather.water_temp}°</span>
        </div>
      </div>

      <div className="flex justify-between items-center text-white mt-auto">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-white/80 uppercase">Nascer</span>
          <span className="text-lg font-bold">{new Date(weather.sunrise).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-white/80 uppercase">Pôr do Sol</span>
          <span className="text-lg font-bold">{new Date(weather.sunset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>,

    // Page 3: Advanced Technical Metrics
    <div key="page3" className="flex flex-col h-full">
      <div className="flex flex-col">
        <h3 className="text-yellow-400 text-[10px] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <Activity size={12} /> Dados Técnicos Avançados
        </h3>
        
        <div className="grid grid-cols-2 gap-y-6 gap-x-8">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Cobertura de Nuvens</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-mono text-white">{weather.cloud_cover}%</span>
              <span className="text-[8px] text-white/30 font-medium">Total</span>
            </div>
            <div className="flex gap-2 mt-1">
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Baixa</span>
                <span className="text-[10px] font-mono text-white/70">{weather.cloud_low}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Média</span>
                <span className="text-[10px] font-mono text-white/70">{weather.cloud_mid}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Alta</span>
                <span className="text-[10px] font-mono text-white/70">{weather.cloud_high}%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Rajadas de Vento</span>
            <span className="text-lg font-mono text-white">{weather.wind_gusts} <small className="text-[10px] opacity-50">km/h</small></span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Solo (Superfície)</span>
            <div className="flex items-baseline gap-3">
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Temp</span>
                <span className="text-lg font-mono text-white">{weather.soil_temp}°</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Umidade</span>
                <span className="text-lg font-mono text-white">{weather.soil_moisture}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Radiação Solar</span>
            <span className="text-lg font-mono text-white">{weather.shortwave_radiation_sum} <small className="text-[10px] opacity-50">MJ/m²</small></span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Evapotranspiração</span>
            <span className="text-lg font-mono text-white">{weather.evapotranspiration} <small className="text-[10px] opacity-50">mm</small></span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider">Luz Solar</span>
            <div className="flex items-baseline gap-3">
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Dia</span>
                <span className="text-lg font-mono text-white">{(weather.daylight_duration / 3600).toFixed(1)}h</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[7px] text-white/30 uppercase">Sol</span>
                <span className="text-lg font-mono text-white">{(weather.sunshine_duration / 3600).toFixed(1)}h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,

    // Page 4: Historical Data (Last 10 Days)
    <div key="page4" className="flex flex-col h-full">
      <div className="flex flex-col">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <History size={18} /> Últimos 10 Dias
        </h3>
        <div className="flex flex-col gap-3">
          {/* Show a simplified view of the last 10 days */}
          {[...Array(10)].map((_, i) => {
            const dayIdx = i * 24; // 24 hours per day
            const date = new Date(weather.historical.time[dayIdx]);
            const avgTemp = weather.historical.temp.slice(dayIdx, dayIdx + 24).reduce((a, b) => a + b, 0) / 24;
            const maxPrecip = Math.max(...weather.historical.precip.slice(dayIdx, dayIdx + 24));
            
            return (
              <div key={i} className="flex items-center justify-between text-white text-sm">
                <span className="w-24 capitalize">{date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</span>
                <div className="flex items-center gap-1 w-16 text-blue-200 text-[10px]">
                  {maxPrecip > 0 && (
                    <>
                      <Droplets size={10} />
                      <span>{maxPrecip}%</span>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-3 w-20 font-mono">
                  <span>{Math.round(avgTemp)}°</span>
                  <span className="text-white/40">Média</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  ];

  return (
    <div className={`animate-float flex flex-col w-full h-full bg-black/40 backdrop-blur-md border border-white/5 rounded-[3rem] shadow-2xl relative overflow-hidden transition-all duration-700 ${isUpdating ? 'scale-[1.02] opacity-90' : 'scale-100'}`}>
      
      {/* Header */}
      <div className="flex justify-between items-center p-4 pb-2 shrink-0 z-10">
        <div className="flex items-center gap-2 text-white">
          <Menu size={24} />
          <span className="text-xl font-medium">{locationName}</span>
          <MapPin size={16} />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentPage ? 'bg-yellow-400 w-3' : 'bg-white/20'}`} />
            ))}
          </div>
          <button onClick={(e) => { e.stopPropagation(); onRefresh(); }} className="p-2 text-white/80 hover:text-white transition-colors">
            <Bot size={20} className={isUpdating ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Carousel Content */}
      <div className="flex-1 overflow-hidden px-4 pb-4 z-10 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5 }}
            className="h-full no-scrollbar"
          >
            {pages[currentPage]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="px-6 pb-4 flex justify-between items-center text-white/30 text-[10px] uppercase tracking-widest">
        <span>Open-Meteo API</span>
        <span>{lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
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
  
  // Estados para IA
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

  // Busca de Notícias (Gemini + Google Search)
  const fetchNewsInternal = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const fetchedNews = await fetchNews();
      if (fetchedNews && fetchedNews.length > 0) {
        setNews(fetchedNews);
        setLastUpdated(new Date());
        setCurrentIdx(0);
      } else {
        setError("Não foi possível carregar o feed de notícias.");
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
          audioRef.current.play().catch(err => {
            console.error("Erro ao reproduzir áudio:", err);
            setIsSpeaking(false);
          });
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
    const interval = setInterval(fetchNewsInternal, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (news.length === 0 || isAnalyzing || isSpeaking) return;
    const rotate = setInterval(() => {
      setAnalysis(null);
      setCurrentIdx((prev) => (prev + 1) % news.length);
    }, 40000);
    return () => clearInterval(rotate);
  }, [news, isAnalyzing, isSpeaking]);

  const currentNews = news[currentIdx];
  const currentImageUrl = currentNews?.imageUrl;

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
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full p-4">
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
        .animate-ticker { animation: ticker 150s linear infinite; }
        
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
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
const RadioPlayer: React.FC<{ isPlaying: boolean, volume: number }> = ({ isPlaying, volume }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayingRadio, setIsPlayingRadio] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

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


// 7. Alarm Overlay
const AlarmOverlay = ({ alarm, onDismiss, volume }) => {
  if (!alarm) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-red-600 flex flex-col items-center justify-center animate-pulse">
      <div className="bg-white/20 p-10 rounded-full mb-8">
        <AlarmClock size={120} className="text-white animate-bounce" />
      </div>
      <h2 className="text-6xl font-bold text-white mb-4">DESPERTAR!</h2>
      <p className="text-2xl text-white/80 mb-12 uppercase tracking-widest">{alarm.time}</p>
      <button 
        onClick={onDismiss}
        className="bg-white text-red-600 px-12 py-6 rounded-full text-3xl font-bold shadow-2xl hover:scale-110 transition-transform"
      >
        DESLIGAR
      </button>
    </div>
  );
};

// 8. Quick Settings
const QuickSettings = ({ brightness, setBrightness, volume, setVolume, alarms, setAlarms, isNightMode }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed top-8 left-8 z-50 flex flex-col items-start gap-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-black/40 backdrop-blur-md p-4 rounded-full border border-white/10 text-white/70 hover:text-white transition-all shadow-xl"
      >
        <Menu size={24} />
      </button>

      {isOpen && (
        <div className="bg-black/80 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 w-80 shadow-2xl animate-fade-in flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold uppercase tracking-widest text-yellow-400">Ajustes</h3>
            <button onClick={() => setIsOpen(false)}><X size={20} /></button>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/50">
                <div className="flex items-center gap-2"><Sun size={14} /> Brilho</div>
                <span>{Math.round(brightness * 100)}%</span>
              </div>
              <input 
                type="range" min="0.1" max="1" step="0.01" 
                value={brightness} onChange={(e) => setBrightness(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-500"
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/50">
                <div className="flex items-center gap-2"><Volume2 size={14} /> Volume</div>
                <span>{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.01" 
                value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-yellow-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
              <AlarmClock size={14} /> Alarmes
            </h4>
            <div className="space-y-2">
              {alarms.map(alarm => (
                <div key={alarm.id} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div>
                    <span className="text-2xl font-bold block leading-none">{alarm.time}</span>
                    <span className="text-[10px] text-white/40 uppercase tracking-tighter">
                      {alarm.days.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ')}
                    </span>
                  </div>
                  <button 
                    onClick={() => setAlarms(alarms.map(a => a.id === alarm.id ? {...a, enabled: !a.enabled} : a))}
                    className={`w-10 h-6 rounded-full relative transition-colors ${alarm.enabled ? 'bg-green-500' : 'bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${alarm.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {isNightMode && (
            <div className="bg-blue-500/20 border border-blue-500/30 p-4 rounded-2xl flex items-center gap-3">
              <Moon size={20} className="text-blue-400" />
              <span className="text-xs font-medium text-blue-200">Modo Noturno Ativo</span>
            </div>
          )}
        </div>
      )}
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
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(0.5);
  const [isNightMode, setIsNightMode] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState<any>(null);
  const [alarms, setAlarms] = useState([
    { id: 1, time: "05:00", days: [1, 2, 4, 5], enabled: true }, // Seg, Ter, Qui, Sex
    { id: 2, time: "06:30", days: [3], enabled: true } // Qua
  ]);
  const alarmAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const totalMinutes = hour * 60 + minute;
    
    // Night mode strictly between 23:00 and 05:00
    // Day mode (weather aligned) between 05:01 and 22:59
    const night = totalMinutes >= 1380 || totalMinutes <= 300;
    setIsNightMode(night);
  }, [currentTime]);

  useEffect(() => {
    // Check alarms every minute
    const hour = currentTime.getHours().toString().padStart(2, '0');
    const minute = currentTime.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hour}:${minute}`;
    const day = currentTime.getDay(); // 0 (Sun) to 6 (Sat)

    const triggeredAlarm = alarms.find(a => a.enabled && a.time === timeStr && a.days.includes(day));
    
    if (triggeredAlarm && !activeAlarm && currentTime.getSeconds() === 0) {
      setActiveAlarm(triggeredAlarm);
      if (alarmAudioRef.current) {
        alarmAudioRef.current.volume = volume;
        alarmAudioRef.current.play().catch(e => console.log("Erro ao tocar alarme:", e));
      }
    }
  }, [currentTime, alarms, activeAlarm, volume]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = () => {
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setInstallPrompt(null);
        }
      });
    }
  };

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
    const padding = Math.min(12, w * 0.01); // Reduced padding
    
    if (isLandscape) {
      // Landscape layout
      const sideColumnWidth = Math.max(280, Math.floor(w * 0.3)); // Increased width
      const centerColumnWidth = w - (sideColumnWidth * 2) - (padding * 4);
      const clockHeight = Math.min(180, h * 0.25);
      const footerHeight = Math.min(120, h * 0.15);
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
      // Portrait layout
      const widgetWidth = w - (padding * 2);
      const clockHeight = 160;
      const weatherHeight = h * 0.35;
      const dateHeight = h * 0.2;
      const newsHeight = h * 0.3;
      
      setWidgets(prev => ({
        ...prev,
        clock: { width: widgetWidth, height: clockHeight, x: padding, y: padding },
        weather: { width: widgetWidth, height: weatherHeight, x: padding, y: padding + clockHeight + padding },
        date: { width: widgetWidth, height: dateHeight, x: padding, y: padding + clockHeight + weatherHeight + (padding * 2) },
        news: { width: widgetWidth, height: newsHeight, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + (padding * 3) },
        prev: { width: (widgetWidth / 2) - (padding / 2), height: 100, x: padding, y: padding + clockHeight + weatherHeight + dateHeight + newsHeight + (padding * 4) },
        next: { width: (widgetWidth / 2) - (padding / 2), height: 100, x: padding + (widgetWidth / 2) + (padding / 2), y: padding + clockHeight + weatherHeight + dateHeight + newsHeight + (padding * 4) }
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
    const interval = setInterval(loadData, 1800000); // 30 mins (48 times a day)
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
      if (code >= 95) imageId = '1605727216801-e27ce1d0cc28'; // Stormy night
      else if (code >= 71) imageId = '1491002052572-0307a8e7a24e'; // Snowy night
      else if (code >= 51) imageId = '1515694346937-94d85e41e6f0'; // Rainy night
      else if (code >= 45) imageId = '1485236715516-5a1c38a0b9ce'; // Foggy night
      else if (code >= 1) imageId = '1536152470836-b943b246224c'; // Cloudy night
      else imageId = '1506318137071-a8e063b4bec0'; // Clear night
    } else {
      // Day time - Granular mapping for Open-Meteo codes
      if (code >= 95) imageId = '1605727216801-e27ce1d0cc28'; // Thunderstorm
      else if (code >= 80) imageId = '1519692938051-eb57626e6d73'; // Rain showers
      else if (code >= 71) imageId = '1491002052572-0307a8e7a24e'; // Snow
      else if (code >= 61) imageId = '1515694346937-94d85e41e6f0'; // Rain
      else if (code >= 51) imageId = '1541919329463-37036c314ef1'; // Drizzle
      else if (code >= 45) imageId = '1485236715516-5a1c38a0b9ce'; // Fog
      else if (code >= 3) imageId = '1483728642387-6c3bdd6c93e5'; // Overcast
      else if (code >= 1) imageId = '1534088568595-a066f410cbda'; // Partly Cloudy
      else imageId = '1507525428034-b723cf961d3e'; // Sunny Beach
    }

    const imageUrl = `https://images.unsplash.com/photo-${imageId}?q=80&w=2560&auto=format&fit=crop`;

    const baseStyle: any = { 
      backgroundImage: `linear-gradient(rgba(0,0,0,${isNightMode ? 0.8 : 0.1}), rgba(0,0,0,${isNightMode ? 0.9 : 0.4})), url("${imageUrl}")`,
      backgroundSize: 'cover', 
      backgroundPosition: 'center',
      transition: 'background-image 3s ease-in-out, filter 2s ease-in-out',
      backgroundColor: '#000',
      filter: `brightness(${isNightMode ? Math.min(brightness, 0.3) : brightness})`
    };

    return baseStyle;
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

        <RadioPlayer isPlaying={hasStarted} volume={volume} />
        <QuickSettings 
          brightness={brightness} setBrightness={setBrightness} 
          volume={volume} setVolume={setVolume} 
          alarms={alarms} setAlarms={setAlarms}
          isNightMode={isNightMode}
        />
        <AlarmOverlay 
          alarm={activeAlarm} 
          volume={volume}
          onDismiss={() => {
            if (alarmAudioRef.current) {
              alarmAudioRef.current.pause();
              alarmAudioRef.current.currentTime = 0;
            }
            setActiveAlarm(null);
          }} 
        />
        <audio ref={alarmAudioRef} src="https://assets.mixkit.co/sfx/preview/mixkit-classic-alarm-clock-993.mp3" loop />
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
            <WeatherWidget weather={weather} locationName={locationName} onRefresh={loadData} />
          </ResizableWidget>
          
          <ResizableWidget width={widgets.date.width} height={widgets.date.height} locked={isLayoutLocked} position={{ x: widgets.date.x, y: widgets.date.y }} isSelected={selectedWidget === 'date'} onSelect={() => setSelectedWidget('date')} onResize={(w, h) => updateWidget('date', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('date', { x, y })}>
            <div className="flex flex-col items-center justify-center h-full text-center drop-shadow-2xl animate-fade-in bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
              <span className="font-bold opacity-70 text-yellow-400 tracking-[0.4em]" style={{ fontSize: `${Math.min(30, widgets.date.width / 14)}px` }}>HOJE</span>
              <span className="font-bold leading-none my-2 text-white" style={{ fontSize: `${Math.min(widgets.date.height * 0.5, widgets.date.width / 1.6)}px` }}>{today.day}</span>
              <span className="font-light uppercase tracking-[0.3em] text-white/80" style={{ fontSize: `${Math.min(40, widgets.date.width / 10)}px` }}>{today.weekday}</span>
            </div>
          </ResizableWidget>

          <ResizableWidget width={widgets.prev.width} height={widgets.prev.height} locked={isLayoutLocked} position={{ x: widgets.prev.x, y: widgets.prev.y }} isSelected={selectedWidget === 'prev'} onSelect={() => setSelectedWidget('prev')} onResize={(w, h) => updateWidget('prev', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('prev', { x, y })}>
            <div className="flex items-center gap-4 opacity-50 p-2 h-full bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
                <ArrowLeft size={Math.min(40, widgets.prev.width / 6)} />
                <div className="text-left">
                  <span className="block uppercase tracking-widest text-yellow-400 font-bold" style={{ fontSize: `${Math.min(16, widgets.prev.width / 10)}px` }}>Ontem</span>
                  <span className="font-bold block" style={{ fontSize: `${Math.min(50, widgets.prev.width / 4)}px` }}>{yesterday.day}</span>
                </div>
            </div>
          </ResizableWidget>
          
          <ResizableWidget width={widgets.next.width} height={widgets.next.height} locked={isLayoutLocked} position={{ x: widgets.next.x, y: widgets.next.y }} isSelected={selectedWidget === 'next'} onSelect={() => setSelectedWidget('next')} onResize={(w, h) => updateWidget('next', { width: w, height: h })} onPositionChange={(x, y) => updateWidget('next', { x, y })}>
            <div className="flex items-center gap-4 justify-end opacity-50 p-2 h-full bg-black/40 backdrop-blur-md rounded-[3rem] border border-white/5" style={{ pointerEvents: !isLayoutLocked ? 'none' : 'auto' }}>
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
          {installPrompt && (
            <button onClick={handleInstall} className="p-4 rounded-full border-2 bg-green-500 border-green-400 text-black hover:scale-110 transition-transform shadow-lg shadow-green-500/20 mr-2" title="Instalar App">
               <Download size={24}/>
            </button>
          )}
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

