'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, Users, Settings, Cpu, TrendingUp, Shield, Award, Clock,
  ChevronLeft, ChevronRight, Sparkles, ArrowRight, Target, Zap,
  Check, BarChart3, Globe, Layers, Mic, MicOff, AlertCircle, TrendingDown,
  ArrowDown, Building2, Home
} from 'lucide-react';

export default function GreenSakuraPresentation() {
  const [current, setCurrent] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isAIThinking, setIsAIThinking] = useState(false);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const total = 9;
  const slideTitles = [
    "Title Slide - Green SAKURA",
    "Latar Belakang: Gap Benchmark SGA",
    "Strategic Objectives",
    "Overview 3 Stream",
    "3-Stream Deep Dive",
    "Global Trend: Hybrid Work & RTO",
    "Program Governance",
    "Roadmap 90 Hari",
    "Closing Slide"
  ];

  const nextSlide = () => setCurrent(prev => Math.min(prev + 1, total - 1));
  const prevSlide = () => setCurrent(prev => Math.max(prev - 1, 0));

  const stopLISA = () => {
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
  };

  // LISA AI Integration via WebRTC (no relay server needed)
  useEffect(() => {
    if (!isListening) {
      stopLISA();
      return;
    }

    let cancelled = false;

    const startLISA = async () => {
      try {
        // Step 1: Get ephemeral token from our API route
        const tokenRes = await fetch('/api/lisa/session', { method: 'POST' });
        if (!tokenRes.ok) throw new Error('Failed to get session token');
        const session = await tokenRes.json();
        const ephemeralKey = session.client_secret.value;
        if (cancelled) return;

        // Step 2: Create WebRTC peer connection
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        // Step 3: Set up audio output (AI voice)
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
        audioElRef.current = audioEl;
        pc.ontrack = (event) => {
          console.log('LISA: audio track received');
          audioEl.srcObject = event.streams[0];
          audioEl.play().catch(e => console.error('Audio play error:', e));
        };

        // Step 4: Add user's microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Step 5: Create data channel for events
        const dc = pc.createDataChannel('oai-events');
        dcRef.current = dc;

        dc.onopen = () => {
          console.log('LISA: data channel open!');
          dc.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{
                type: 'input_text',
                text: `Halo LISA! User sedang melihat Slide ${current + 1}: ${slideTitles[current]}. Berikan sambutan singkat dan profesional dalam Bahasa Indonesia.`
              }]
            }
          }));
          dc.send(JSON.stringify({ type: 'response.create' }));
        };

        dc.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'response.function_call_arguments.done') {
              const args = typeof msg.arguments === 'string' ? JSON.parse(msg.arguments) : msg.arguments;
              if (msg.name === 'navigate_slide') {
                if (args.direction === 'next') nextSlide();
                if (args.direction === 'back') prevSlide();
              }
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: JSON.stringify({ success: true })
                }
              }));
              dc.send(JSON.stringify({ type: 'response.create' }));
            }

            if (msg.type === 'response.audio_transcript.delta') {
              setIsAIThinking(false);
              setTranscript(prev => prev + msg.delta);
            }

            if (msg.type === 'response.audio_transcript.done') {
              setTimeout(() => setTranscript(''), 4000);
            }

            if (msg.type === 'input_audio_buffer.speech_started') {
              setTranscript('');
            }

            if (msg.type === 'error') {
              console.error('LISA Error:', msg.error);
            }
          } catch (e) {
            console.error('Data channel message error:', e);
          }
        };

        dc.onclose = () => console.log('LISA: data channel closed');
        pc.onconnectionstatechange = () => console.log('LISA: connection state:', pc.connectionState);

        // Step 6: Create and exchange SDP offer/answer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (cancelled) return;

        // Wait for ICE gathering to complete
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          } else {
            const onStateChange = () => {
              if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', onStateChange);
                resolve();
              }
            };
            pc.addEventListener('icegatheringstatechange', onStateChange);
            setTimeout(resolve, 4000);
          }
        });
        if (cancelled) return;

        console.log('LISA: sending SDP offer...');

        const sdpRes = await fetch(
          'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
          {
            method: 'POST',
            body: pc.localDescription!.sdp,
            headers: {
              Authorization: `Bearer ${ephemeralKey}`,
              'Content-Type': 'application/sdp',
            },
          }
        );

        if (!sdpRes.ok) {
          const errText = await sdpRes.text();
          throw new Error(`SDP exchange failed ${sdpRes.status}: ${errText}`);
        }

        const answerSdp = await sdpRes.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
        console.log('LISA: WebRTC connected!');

      } catch (err) {
        if (!cancelled) {
          console.error('LISA Error:', err);
          setIsListening(false);
        }
      }
    };

    startLISA();

    return () => {
      cancelled = true;
    };
  }, [isListening]);

  // Notify LISA when slide changes
  useEffect(() => {
    if (dcRef.current?.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: `User is now viewing Slide ${current + 1}: ${slideTitles[current]}.`
          }]
        }
      }));
    }
  }, [current]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const slideVariants = {
    enter: { opacity: 0, y: 40 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -40 }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-mesh">
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 grid-pattern opacity-50" />

      {/* Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[#22c55e] opacity-[0.03] blur-[150px] rounded-full" />

      {/* Main Content */}
      <div className="relative z-10 w-full h-full flex flex-col">

        {/* Top Bar */}
        <header className="flex flex-col md:flex-row items-center justify-between px-6 md:px-16 pt-10 pb-4 md:py-8 gap-4 md:gap-0">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center">
              <Leaf className="w-4 h-4 md:w-5 md:h-5 text-[#22c55e]" />
            </div>
            <div>
              <div className="text-xs md:text-sm font-semibold text-white">Green SAKURA</div>
              <div className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest leading-none">ESG Program</div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 order-3 md:order-2">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`slide-dot ${i === current ? 'active' : ''}`}
              />
            ))}
          </div>

          <div className="text-right hidden md:block md:order-3">
            <div className="text-xs text-gray-500">PTPN </div>
            <div className="text-sm font-medium text-white">Group of Cost</div>
          </div>
        </header>

        {/* Slide Area */}
        <main className="flex-1 px-6 md:px-16 pb-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              className="h-full"
            >
              {current === 0 && <TitleSlide />}
              {current === 1 && <BackgroundSlide />}
              {current === 2 && <ObjectivesSlide />}
              {current === 3 && <StreamsOverviewSlide />}
              {current === 4 && <StreamDeepDiveSlide />}
              {current === 5 && <HybridTrendSlide />}
              {current === 6 && <GovernanceSlide />}
              {current === 7 && <RoadmapSlide />}
              {current === 8 && <ClosingSlide />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <footer className="flex flex-col md:flex-row items-center justify-between px-6 md:px-16 py-4 md:py-6 border-t border-white/5 bg-bg-dark/80 backdrop-blur-md">
          <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-0">
            <span className="text-3xl md:text-5xl font-light text-white/10">{String(current + 1).padStart(2, '0')}</span>
            <div className="h-6 md:h-8 w-px bg-white/10" />
            <span className="text-xs md:text-sm text-gray-400">of {String(total).padStart(2, '0')}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* LISA AI Control */}
            <div className="flex items-center gap-4 mr-4 pr-4 border-r border-white/10">
              <AnimatePresence>
                {(isListening || transcript) && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl"
                  >
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold text-[#22c55e] tracking-widest uppercase">LISA AI</span>
                      {transcript && <p className="text-[10px] text-gray-400 italic max-w-[100px] md:max-w-[150px] truncate">{transcript}</p>}
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center text-[#22c55e]">
                      <Sparkles className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={() => setIsListening(!isListening)}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isListening
                  ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                  : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:bg-white/10'
                  }`}
              >
                {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </button>
            </div>

            <button
              onClick={prevSlide}
              disabled={current === 0}
              className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-all disabled:opacity-30"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={nextSlide}
              disabled={current === total - 1}
              className="h-14 px-8 rounded-2xl btn-primary text-white font-semibold flex items-center gap-3 disabled:opacity-30"
            >
              Next <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ===== SLIDE COMPONENTS =====

function TitleSlide() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="h-full flex items-center justify-center">
      {/* Immersive Particle Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {mounted && [...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: Math.random() * 100 + "%",
              y: Math.random() * 100 + "%",
              opacity: 0,
              rotate: Math.random() * 360
            }}
            animate={{
              y: ["-10%", "110%"],
              x: ["0%", (Math.random() > 0.5 ? 10 : -10) + "%"],
              rotate: 360,
              opacity: [0, 0.4, 0]
            }}
            transition={{
              duration: 15 + Math.random() * 10,
              repeat: Infinity,
              delay: Math.random() * 10,
              ease: "linear"
            }}
            className="absolute"
          >
            <Leaf className="w-4 h-4 text-[#22c55e]/20" />
          </motion.div>
        ))}
      </div>

      <div className="text-center max-w-5xl z-10">
        {/* Large Ambient Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#22c55e]/10 blur-[120px] rounded-full -z-10" />

        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 100,
            damping: 20,
            delay: 0.1
          }}
          className="relative inline-block mb-6 md:mb-8"
        >
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-[24px] md:rounded-[40px] bg-gradient-to-br from-[#22c55e]/20 to-[#16a34a]/5 border border-[#22c55e]/30 flex items-center justify-center glow-green shadow-[0_0_50px_rgba(34,197,94,0.15)]">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 0.95, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Leaf className="w-12 h-12 md:w-16 md:h-16 text-[#22c55e]" />
            </motion.div>
          </div>
          {/* Ornamental rings */}
          <div className="absolute inset-0 rounded-[24px] md:rounded-[40px] border border-[#22c55e]/10 scale-125 animate-pulse" />
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <p className="text-[10px] md:text-sm font-bold text-[#22c55e] tracking-[0.5em] uppercase mb-3 md:mb-4 drop-shadow-sm">
            ESG Transformation Program
          </p>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-gradient mb-4 md:mb-6 tracking-tighter leading-none py-2">
            Green SAKURA
          </h1>
          <p className="text-lg md:text-xl lg:text-2xl text-gray-400 font-light leading-snug max-w-3xl mx-auto px-4 tracking-wide">
            Sustainable & Agile Work Culture for <span className="text-white font-semibold underline underline-offset-8 decoration-[#22c55e]/40">Responsible Corporate Action</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="flex flex-wrap justify-center gap-3 md:gap-6 mt-8 md:mt-12"
        >
          {[
            { label: 'Initiated By', value: 'Group of Cost' },
            { label: 'Scope', value: 'Holding PTPN III' },
            { label: 'Timeline', value: '90 Days Program' }
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -5, backgroundColor: "rgba(255,255,255,0.05)" }}
              className="px-6 md:px-8 py-3 md:py-4 rounded-2xl md:rounded-3xl glass-card border border-white/10 relative overflow-hidden group shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#22c55e]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-1 font-bold">{item.label}</div>
              <div className="text-sm md:text-lg font-bold text-white tracking-tight">{item.value}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
function BackgroundSlide() {
  const peers = [
    { name: 'Wilmar International', sga: '6–8%', mid: 7, color: 'emerald' },
    { name: 'SMART (Sinarmas Agro)', sga: '8–10%', mid: 9, color: 'blue' },
    { name: 'Triputra Agro Persada', sga: '9–11%', mid: 10, color: 'blue' },
    { name: 'Golden Agri-Resources', sga: '9–11%', mid: 10, color: 'blue' },
    { name: 'Astra Agro Lestari', sga: '11–13%', mid: 12, color: 'amber' },
    { name: 'Median Industri', sga: '≈10%', mid: 10, color: 'white', isMedian: true },
    { name: 'PTPN', sga: '17%', mid: 17, color: 'red', highlight: true },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center py-1 overflow-y-auto gap-2 md:gap-3">
      {/* Header */}
      <div>
        <p className="text-[10px] md:text-xs font-medium text-red-400 tracking-[0.2em] uppercase mb-0.5 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" /> Latar Belakang & Urgensi
        </p>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-tight">
          Gap Efisiensi: SGA to Sales Ratio
        </h2>
        <p className="text-gray-400 mt-0.5 text-[10px] md:text-xs">Perbandingan efisiensi operasional PTPN terhadap peers perkebunan regional</p>
      </div>

      {/* Main Stats Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
        {/* Left: 2024 Full Year */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-3 rounded-2xl glass-card border-l-4 border-red-500/50"
        >
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Baseline Tahun 2024</div>
          <div className="flex items-end gap-4 mb-2">
            <div>
              <div className="text-[8px] text-gray-500 uppercase">Median Industri</div>
              <div className="text-2xl font-bold text-white">≈10<span className="text-sm">%</span></div>
            </div>
            <div className="mb-1 text-red-500 animate-pulse">
              <TrendingDown className="w-4 h-4 rotate-180" />
            </div>
            <div>
              <div className="text-[8px] text-red-500 uppercase">PTPN</div>
              <div className="text-2xl font-bold text-red-500">21<span className="text-sm">%</span></div>
            </div>
          </div>
          <div className="p-2 bg-red-500/5 rounded-lg border border-red-500/10">
            <p className="text-[10px] text-red-400/90 leading-snug italic">
              "Gap <strong>+11 ppt</strong> di atas median industri — peluang signifikan untuk efisiensi biaya."
            </p>
          </div>
        </motion.div>

        {/* Right: Q4 2025 Progress */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="p-3 rounded-2xl glass-card border-l-4 border-amber-500/50"
        >
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Posisi Quartal-4 2025</div>
          <div className="flex items-end gap-4 mb-2">
            <div>
              <div className="text-[8px] text-gray-500 uppercase">Median Industri</div>
              <div className="text-2xl font-bold text-white">≈10<span className="text-sm">%</span></div>
            </div>
            <div className="mb-1 text-amber-500">
              <TrendingUp className="w-4 h-4 rotate-180" />
            </div>
            <div>
              <div className="text-[8px] text-amber-500 uppercase">PTPN</div>
              <div className="text-2xl font-bold text-amber-400">17<span className="text-sm">%</span></div>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">
            Membaik dari 21% ke 17%, namun masih <strong>+7 ppt di atas median</strong>. Ruang besar untuk efisiensi pola kerja.
          </p>
        </motion.div>
      </div>

      {/* Peers Benchmark Bar Chart */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="p-3 rounded-2xl glass-card bg-white/[0.02]"
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[9px] font-bold text-white uppercase tracking-wider">Benchmark SGA/Sales — Peers Perkebunan Regional</h4>
          <span className="text-[7px] text-gray-500 italic">FY2023–FY2024</span>
        </div>
        <div className="space-y-1.5">
          {peers.map((peer, i) => (
            <div key={i} className={`space-y-0.5 ${peer.isMedian ? 'pt-1.5 border-t border-dashed border-white/10' : ''}`}>
              <div className="flex justify-between items-end px-0.5">
                <span className={`text-[9px] ${peer.highlight ? 'text-white font-bold' : peer.isMedian ? 'text-gray-300 font-semibold italic' : 'text-gray-400'}`}>{peer.name}</span>
                <span className={`text-[10px] font-bold ${peer.highlight ? 'text-red-500' : peer.isMedian ? 'text-gray-300' : peer.color === 'emerald' ? 'text-emerald-400' : peer.color === 'amber' ? 'text-amber-400' : 'text-white'}`}>{peer.sga}</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(peer.mid / 22) * 100}%` }}
                  transition={{ delay: 0.5 + i * 0.08, duration: 1 }}
                  className={`h-full rounded-full ${peer.highlight ? 'bg-gradient-to-r from-red-600 to-red-400' : peer.isMedian ? 'bg-gradient-to-r from-gray-500 to-gray-400' : peer.color === 'emerald' ? 'bg-emerald-500/40' : peer.color === 'amber' ? 'bg-amber-500/40' : 'bg-white/20'}`}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[7px] text-gray-600 italic mt-2 pt-1.5 border-t border-white/5">
          Sumber: Laporan Tahunan & Laporan Keuangan perusahaan perkebunan listed regional (AALI, TAPG, SMART, Wilmar, GAR) FY2023–FY2024; analisis Group of Cost.
        </p>
      </motion.div>
    </div>
  );
}


function ObjectivesSlide() {
  const streamBadge = {
    people: { label: 'People', abbr: 'Pe', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    process: { label: 'Process', abbr: 'Pr', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    technology: { label: 'Technology', abbr: 'Te', cls: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
  };

  const objectives = [
    {
      label: 'Go',
      name: 'Lean',
      desc: 'Pioneer of AI-driven production system & workforce-of-the-future.',
      items: [
        { text: 'Hybrid Work', stream: 'process' as const },
        { text: 'Virtual-First Meeting', stream: 'process' as const },
        { text: 'Workflow Automation', stream: 'technology' as const },
      ],
      icon: <Zap className="w-4 h-4" />,
      color: 'amber'
    },
    {
      label: 'Go',
      name: 'Green',
      desc: 'Leading green biz incubator & global impact investing alliance partner.',
      items: [
        { text: 'Green Habit Campaign', stream: 'people' as const },
        { text: 'Green Ambassador', stream: 'people' as const },
        { text: 'Green Travel Policy', stream: 'process' as const },
      ],
      icon: <Leaf className="w-4 h-4" />,
      color: 'emerald'
    },
    {
      label: 'Go',
      name: 'AI',
      desc: 'First global WEF digital lighthouse in ag sector.',
      items: [
        { text: 'AI Approval Routing', stream: 'technology' as const },
        { text: 'RPA', stream: 'technology' as const },
        { text: 'Predictive Analytics', stream: 'technology' as const },
        { text: 'Dashboard ESG', stream: 'technology' as const },
      ],
      icon: <Cpu className="w-4 h-4" />,
      color: 'blue'
    },
    {
      label: 'Go',
      name: 'Secure',
      desc: 'National champion of inclusive growth for EntrePlanters and diversified crops.',
      items: [
        { text: 'ESS', stream: 'technology' as const },
        { text: 'SOP Online', stream: 'technology' as const },
        { text: 'IHCMIS', stream: 'technology' as const },
        { text: 'Standarisasi Digital', stream: 'process' as const },
      ],
      icon: <Shield className="w-4 h-4" />,
      color: 'cyan'
    },
    {
      label: 'Go',
      name: 'Beyond',
      desc: 'Global innovation leader — ESG & cost reporting aligned with global sustainability standards.',
      items: [
        { text: 'ESG & Cost Reporting (GRI/ISSB-aligned)', stream: 'technology' as const },
        { text: 'Executive Command Center', stream: 'technology' as const },
        { text: 'Stakeholder Transparency Report', stream: 'process' as const },
      ],
      icon: <Globe className="w-4 h-4" />,
      color: 'purple'
    },
  ];

  const colorMap: Record<string, string> = {
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10',
    purple: 'text-purple-400 border-purple-500/20 bg-purple-500/10',
  };

  return (
    <div className="h-full flex flex-col justify-center items-center py-2 overflow-y-auto w-full">
      <div className="mb-5 text-center">
        <p className="text-xs md:text-sm font-bold text-[#22c55e] tracking-[0.4em] uppercase mb-2">Strategic Framework</p>
        <div className="flex items-center justify-center gap-5 mb-1">
          <div className="h-px w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <h2 className="text-5xl md:text-6xl font-black text-white tracking-tighter">5G</h2>
          <div className="h-px w-20 bg-gradient-to-l from-transparent via-white/20 to-transparent" />
        </div>
        <p className="text-[10px] md:text-xs text-gray-500">Green SAKURA alignment dengan strategi korporat PTPN</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          {Object.values(streamBadge).map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`text-[7px] font-bold uppercase px-1 py-px rounded border ${s.cls}`}>{s.abbr}</span>
              <span className="text-[9px] text-gray-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:gap-4 w-full items-start justify-center px-2">
        {objectives.map((obj, i) => (
          <div key={i} className="flex-1 flex flex-col items-center w-full min-w-0">
            {/* Main 5G Card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="p-4 rounded-2xl glass-card border border-white/5 hover:border-white/20 transition-all flex flex-col h-36 md:h-40 w-full relative group"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[obj.color].split(' ').slice(2).join(' ')} border ${colorMap[obj.color].split(' ')[1]}`}>
                <div className={colorMap[obj.color].split(' ')[0]}>
                  {obj.icon}
                </div>
              </div>

              <div className="mb-2">
                <span className={`text-sm font-black uppercase italic tracking-tighter ${colorMap[obj.color].split(' ')[0]}`}>{obj.label}</span>
                <span className="text-sm font-black uppercase italic tracking-tighter text-white ml-1.5">{obj.name}</span>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400 leading-snug font-medium">
                {obj.desc}
              </p>
            </motion.div>

            {/* Vertical Connector */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.4 + i * 0.08, duration: 0.5 }}
              className={`w-px h-5 md:h-6 bg-gradient-to-b ${colorMap[obj.color].split(' ')[0].replace('text-', 'from-')} to-transparent opacity-40`}
            />

            {/* Green SAKURA Mapping Box */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.08 }}
              className={`p-3 rounded-xl border ${colorMap[obj.color].split(' ')[1]} ${colorMap[obj.color].split(' ')[2]} w-full`}
            >
              <div className="text-[8px] font-black uppercase tracking-widest text-gray-500 mb-2">Green SAKURA</div>
              <div className="flex flex-wrap gap-1.5">
                {obj.items.map((item, j) => (
                  <div key={j} className="flex items-center gap-1 bg-white/5 rounded-md px-1.5 py-0.5">
                    <span className={`text-[7px] font-bold uppercase tracking-wider px-1 py-px rounded border ${streamBadge[item.stream].cls}`}>
                      {streamBadge[item.stream].abbr}
                    </span>
                    <span className="text-[9px] text-white font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}


function StreamsOverviewSlide() {
  const streams = [
    {
      id: 'people',
      title: 'People Stream',
      subtitle: 'Behavior & Culture',
      icon: <Users className="w-8 h-8 text-emerald-400" />,
      color: 'emerald',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/20',
      description: 'Membangun kesadaran & budaya kerja ramah lingkungan.',
      focus: ['Kampanye Green Habit', 'Microlearning ESG', 'Green Ambassador per Unit', 'Insentif & Recognition'],
      target: '85% Employee Participation'
    },
    {
      id: 'process',
      title: 'Process Stream',
      subtitle: 'Policy & WoW',
      icon: <Settings className="w-8 h-8 text-cyan-400" />,
      color: 'cyan',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/20',
      description: 'Standardisasi proses bisnis rendah karbon & efisien.',
      focus: ['Hybrid Work Policy', 'Virtual-First Meeting', 'Green Travel Policy', 'Efisiensi Energi Kantor'],
      target: '-30% Travel & Operational Cost'
    },
    {
      id: 'technology',
      title: 'Technology Stream',
      subtitle: 'Digital Enablement',
      icon: <Cpu className="w-8 h-8 text-blue-400" />,
      color: 'blue',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      description: 'Penyediaan platform & alat kerja digital terintegrasi.',
      focus: ['Paperless Operations', 'Green IT Infrastructure', 'Workflow Automation', 'Data & Analytics'],
      target: '100% Digital Transformation'
    }
  ];

  return (
    <div className="h-full flex flex-col justify-center gap-4 py-2 overflow-y-auto w-full">
      <div className="text-center">
        <p className="text-[10px] md:text-xs font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-2">Implementation Pillars</p>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight mb-2">The 3-Stream Focus</h2>
        <div className="h-1 w-16 bg-gradient-to-r from-[#22c55e] to-emerald-400 mx-auto rounded-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {streams.map((stream, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className={`p-4 md:p-5 rounded-2xl glass-card border-t-3 ${stream.borderColor.replace('500/20', '400')} relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}
          >
            <div className={`absolute top-0 right-0 p-6 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity`}>
              {React.cloneElement(stream.icon as React.ReactElement<any>, { className: "w-20 h-20" })}
            </div>

            <div className={`w-10 h-10 rounded-xl ${stream.bgColor} flex items-center justify-center mb-4 border ${stream.borderColor}`}>
              {React.cloneElement(stream.icon as React.ReactElement<any>, { className: "w-5 h-5" })}
            </div>

            <div className="mb-3">
              <h3 className="text-lg font-bold text-white mb-0.5">{stream.title}</h3>
              <p className={`text-[10px] font-semibold uppercase tracking-widest ${stream.id === 'people' ? 'text-emerald-400' : stream.id === 'process' ? 'text-cyan-400' : 'text-blue-400'}`}>{stream.subtitle}</p>
            </div>

            <p className="text-gray-400 text-[11px] leading-relaxed mb-3">
              {stream.description}
            </p>

            <div className="space-y-1.5 mb-4">
              {stream.focus.map((item, j) => (
                <div key={j} className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${stream.id === 'people' ? 'bg-emerald-400' : stream.id === 'process' ? 'bg-cyan-400' : 'bg-blue-400'}`} />
                  <span className="text-white/80 text-[11px] font-medium">{item}</span>
                </div>
              ))}
            </div>

            <div className={`mt-auto p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between`}>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Main Target</div>
              <div className="text-white font-bold text-xs tracking-tight">{stream.target}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}


function HybridTrendSlide() {
  const trends = [
    {
      phase: '01',
      era: '2020 – 2022',
      title: 'WFA: Work From Anywhere',
      sub: 'Respon Krisis Pandemi',
      desc: 'Pandemi membuktikan efektivitas remote work. Produktivitas awal naik signifikan (+13%), namun memicu risiko burnout jangka panjang dan erosi budaya korporat.',
      icon: <Home className="w-6 h-6 text-amber-400" />,
      accent: 'amber',
      stats: [
        { label: 'Uplift Produktivitas', val: '+13%*', pos: true },
        { label: 'Risiko Burnout', val: 'Tinggi', pos: false },
      ],
    },
    {
      phase: '02',
      era: '2023 – 2024',
      title: 'RTO Pressure & Response',
      sub: 'Uji Coba Kehadiran Fisik Penuh',
      desc: 'Eksperimen RTO (Return to Office) penuh oleh sejumlah perusahaan besar memicu resistensi talenta (turnover risk) dan penyesuaian menuju keseimbangan baru.',
      icon: <Building2 className="w-6 h-6 text-red-400" />,
      accent: 'red',
      stats: [
        { label: 'Attrition (Knowledge Work)', val: 'Meningkat', pos: false },
        { label: 'Sentimen Karyawan', val: 'Resistensi', pos: false },
      ],
    },
    {
      phase: '03',
      era: '2025 – Present',
      title: 'Structured Hybrid',
      sub: 'Model Kerja Pasca-Konvergensi',
      desc: 'Konsolidasi global pada model 2–3 hari onsite. Terbukti menurunkan attrition sebesar 35% dibandingkan model full onsite sekaligus mengoptimalkan biaya SGA.',
      icon: <Layers className="w-6 h-6 text-emerald-400" />,
      accent: 'emerald',
      stats: [
        { label: 'Turnover Reduction', val: '-35%**', pos: true },
        { label: 'SGA/Space Savings', val: '15–20%***', pos: true },
      ],
    },
  ];

  const accentMap: Record<string, { border: string; bg: string; text: string; badge: string }> = {
    amber: { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-400/30' },
    red: { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300 border-red-400/30' },
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' },
  };

  return (
    <div className="h-full flex flex-col justify-start md:justify-center py-2 gap-3 relative">
      {/* Header */}
      <div className="text-center">
        <p className="text-xs md:text-sm font-bold text-[#22c55e] tracking-[0.4em] uppercase mb-2 flex items-center justify-center gap-2">
          <Globe className="w-4 h-4" /> Global Work Paradigm Shift
        </p>
        <h2 className="text-2xl md:text-4xl font-black text-white tracking-tighter leading-tight mb-1">
          Hybrid Work: Macro Trends
        </h2>
        <p className="text-xs md:text-sm text-gray-400 font-light max-w-4xl mx-auto leading-relaxed">
          Industri global berkonvergensi pada model <strong className="text-emerald-400">hybrid terstruktur (2–3 hari onsite)</strong> sebagai solusi optimal yang menyeimbangkan kolaborasi fisik dengan fleksibilitas yang diinginkan talenta berkinerja tinggi.
        </p>
      </div>

      {/* Trend Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trends.map((t, i) => {
          const a = accentMap[t.accent];
          return (
            <motion.div
              key={i}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.12 }}
              className={`relative flex flex-col p-5 rounded-2xl glass-card border ${a.border} overflow-hidden group hover:scale-[1.02] transition-all`}
            >
              {/* Phase badge */}
              <div className={`absolute top-4 right-4 text-[10px] font-black px-2 py-0.5 rounded-full border ${a.badge}`}>
                FASE {t.phase}
              </div>

              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${a.bg} border ${a.border}`}>
                {t.icon}
              </div>

              {/* Text */}
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${a.text}`}>{t.era}</div>
              <h3 className="text-lg font-bold text-white mb-0.5">{t.title}</h3>
              <p className={`text-xs font-semibold mb-3 ${a.text}`}>{t.sub}</p>
              <p className="text-xs text-gray-400 leading-relaxed flex-1">{t.desc}</p>

              {/* Stats */}
              <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
                {t.stats.map((s, j) => (
                  <div key={j} className="text-center">
                    <div className={`text-sm font-black ${s.pos ? 'text-emerald-400' : 'text-red-400'}`}>{s.val}</div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-wide">{s.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* PTPN Positioning Note */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="p-4 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/5 text-center"
      >
        <p className="text-sm text-gray-300 leading-relaxed">
          <span className="text-[#22c55e] font-bold">Strategic Focus:</span> Adopsi <strong className="text-white">Structured Hybrid</strong> ditujukan bagi <strong className="text-emerald-400">fungsi G&A dan Knowledge Workers</strong> di Kantor Pusat & Regional sebagai lever efisiensi SGA tanpa mengganggu produktivitas operasional lapangan.
        </p>
      </motion.div>

      {/* Footnotes */}
      <div className="flex justify-center gap-6 mt-2 pt-2 border-t border-white/5">
        <span className="text-[8px] text-gray-600 italic">*Stanford/Bloom Research</span>
        <span className="text-[8px] text-gray-600 italic">**Bloom et al., Nature 2024</span>
        <span className="text-[8px] text-gray-600 italic">***JLL/CBRE Real Estate Reports</span>
      </div>
    </div>
  );
}

function StreamDeepDiveSlide() {
  const [activeTab, setActiveTab] = useState<'people' | 'process' | 'technology'>('people');

  const tabs = [
    { id: 'people' as const, label: 'People Stream', icon: <Users className="w-4 h-4" />, color: 'emerald' },
    { id: 'process' as const, label: 'Process Stream', icon: <Settings className="w-4 h-4" />, color: 'cyan' },
    { id: 'technology' as const, label: 'Technology Stream', icon: <Cpu className="w-4 h-4" />, color: 'blue' },
  ];

  const colorActive: Record<string, string> = {
    emerald: 'bg-emerald-500/20 border-emerald-400 text-emerald-300',
    cyan: 'bg-cyan-500/20    border-cyan-400    text-cyan-300',
    blue: 'bg-blue-500/20    border-blue-400    text-blue-300',
  };
  const colorInactive = 'border-white/10 text-gray-400 hover:text-white hover:border-white/30';

  return (
    <div className="h-full flex flex-col pt-2 overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 ${activeTab === tab.id ? colorActive[tab.color] : colorInactive
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* ── PEOPLE ── */}
          {activeTab === 'people' && (
            <motion.div key="people" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="flex flex-col gap-4 h-full">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Green Behavior & Culture</h2>
                <p className="text-xs text-gray-400 mt-1">Perubahan perilaku karyawan menjadi lebih sadar lingkungan</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Initiatives */}
                <div className="md:col-span-2 grid grid-cols-2 gap-2">
                  {[
                    { title: 'Kampanye Green Habit', desc: 'Program harian hemat listrik, air & kertas di seluruh kantor holding' },
                    { title: 'Microlearning ESG 5 menit', desc: 'Modul singkat mingguan via app tentang praktik kerja berkelanjutan' },
                    { title: 'Green Ambassador per unit', desc: 'Satu perwakilan tiap direktorat sebagai agen perubahan ESG' },
                    { title: 'Insentif & Recognition', desc: 'Penghargaan bulanan untuk unit dengan kontribusi green terbaik' },
                  ].map((item, i) => (
                    <motion.div key={i} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.07 }} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-emerald-500/10">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-white text-xs font-semibold">{item.title}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{item.desc}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                {/* KPI */}
                <div className="p-4 rounded-2xl glass-card">
                  <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-3">Target KPI</h4>
                  <div className="space-y-3">
                    {[{ label: 'Partisipasi Kampanye', value: '85%' }, { label: 'Penyelesaian Microlearning', value: '80%' }, { label: 'ESG Awareness (survey)', value: '90%' }].map((kpi, i) => (
                      <div key={i}>
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-400 text-[10px]">{kpi.label}</span>
                          <span className="text-emerald-400 font-bold text-xs">{kpi.value}</span>
                        </div>
                        <div className="progress-track h-1.5">
                          <motion.div className="progress-fill h-full" initial={{ width: 0 }} animate={{ width: kpi.value }} transition={{ delay: 0.3 + i * 0.15, duration: 1 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Benchmark + Insight */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="p-4 rounded-2xl glass-card border-l-4 border-emerald-500">
                  <div className="flex items-center gap-2 mb-2"><Globe className="w-3.5 h-3.5 text-emerald-400" /><span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Global Benchmark</span></div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Unilever — Sustainable Living Plan</span><span className="text-white font-semibold">28% energy reduction</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Google — Renewable Matching</span><span className="text-white font-semibold">100% electricity matched</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">IKEA — People & Planet Positive</span><span className="text-white font-semibold">92% renewable energy</span></div>
                  </div>
                </motion.div>
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="p-4 rounded-2xl glass-card border-l-4 border-blue-500">
                  <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-blue-400" /><span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Consultant Insight</span></div>
                  <p className="text-gray-300 text-xs italic leading-relaxed">"Companies with strong ESG propositions see <span className="text-white font-semibold">14% higher employee engagement</span> and purpose-driven employees are <span className="text-white font-semibold">2.5× more likely</span> to report high satisfaction."</p>
                  <p className="text-[10px] text-gray-500 mt-1.5">— McKinsey & Company, 2020 & 2023</p>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── PROCESS ── */}
          {activeTab === 'process' && (
            <motion.div key="process" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="flex flex-col gap-2">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">PTPN Green Ways of Working</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Standar kerja rendah karbon · Fungsi Non-Operasional Kantor · Target 2026–2027</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Policies */}
                <div className="p-3 rounded-2xl glass-card border-t-2 border-cyan-500/30">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 mb-2">
                    <span className="text-xs">🏢</span>
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-cyan-400">Fungsi Non-Operasional (Kantor)</span>
                  </div>
                  <div className="space-y-1.5">
                    {['Hybrid Work untuk fungsi non-operasional', 'Virtual-First Meeting Policy', 'Green Travel Policy (Pembatasan perdin non-esensial)', 'Efisiensi Energi Kantor (AC, Listrik, Lampu)'].map((p, i) => (
                      <motion.div key={i} initial={{ x: -12, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.07 }} className="flex items-start gap-2 p-2 rounded-xl bg-white/5">
                        <div className="w-1.5 h-1.5 rounded-full mt-1 shrink-0 bg-cyan-400" />
                        <span className="text-white/90 text-[11px] leading-snug">{p}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
                {/* Expected Impact WFA */}
                <div className="p-3 rounded-2xl glass-card flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">Expected Impact — WFA Policy</h4>
                    <span className="text-[8px] text-gray-600">Scope: Fungsi Non-Ops</span>
                  </div>
                  {[
                    { label: 'WFA Days Target (Non-Ops)', value: '6–8 hari', tag: 'Per Bulan', icon: <Clock className="w-3 h-3" />, color: 'text-cyan-400 bg-cyan-500/10', tagColor: 'text-cyan-400/70' },
                    { label: 'Travel & Commute Cost', value: '−30%', tag: 'Cost & Carbon', icon: <TrendingUp className="w-3 h-3" />, color: 'text-emerald-400 bg-emerald-500/10', tagColor: 'text-emerald-400/70' },
                    { label: 'Virtual Meeting Adoption', value: '70%', tag: 'Productivity', icon: <Globe className="w-3 h-3" />, color: 'text-blue-400 bg-blue-500/10', tagColor: 'text-blue-400/70' },
                    { label: 'Carbon Emisi Komuter', value: '−25%', tag: 'ESG Impact', icon: <Leaf className="w-3 h-3" />, color: 'text-amber-400 bg-amber-500/10', tagColor: 'text-amber-400/70' },
                  ].map((stat, i) => (
                    <motion.div key={i} initial={{ x: 15, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.07 }} className="flex items-center gap-2 p-1.5 rounded-lg bg-white/5">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${stat.color}`}>{stat.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[8px] text-gray-400 truncate">{stat.label}</div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-bold text-white">{stat.value}</span>
                          <span className={`text-[7px] font-medium ${stat.tagColor}`}>{stat.tag}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
              {/* Benchmark WFA/WFO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="p-3 rounded-2xl glass-card border-l-4 border-cyan-500">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5"><Globe className="w-3 h-3 text-cyan-400" /><span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Research — Hybrid Work Impact</span></div>
                    <span className="text-[7px] text-gray-600 italic">*peer-reviewed studies</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { finding: 'Fully remote workers', impact: '−54% carbon footprint', source: 'Cornell–Microsoft, PNAS 2023' },
                      { finding: 'Hybrid 2–4 days WFH', impact: '−11 to 29% emissions', source: 'Cornell–Microsoft, PNAS 2023' },
                      { finding: 'Global hybrid adoption', impact: '75% maintain productivity', source: 'BCG Remote Work Survey, 2020' },
                    ].map((item, i) => (
                      <div key={i} className="text-[9px]">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-gray-300 font-semibold">{item.finding}</span>
                          <span className="text-cyan-400 font-bold">{item.impact}</span>
                        </div>
                        <div className="text-[7px] text-gray-600 italic">{item.source}</div>
                      </div>
                    ))}
                    <div className="pt-1.5 border-t border-white/5 text-[8px] text-cyan-400/80 font-semibold">
                      💡 Rekomendasi PTPN: <span className="text-white">6–8 hari WFA/bulan (fungsi non-ops)</span>
                    </div>
                  </div>
                </motion.div>
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="p-3 rounded-2xl glass-card border-l-4 border-amber-500">
                  <div className="flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3 h-3 text-amber-400" /><span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Consultant Insight</span></div>
                  <p className="text-gray-300 text-[11px] italic leading-snug">"Fully remote workers reduce carbon footprint by <span className="text-white font-semibold">up to 54%</span>, and hybrid workers (2–4 days WFH) by <span className="text-white font-semibold">11–29%</span> vs. onsite workers."</p>
                  <p className="text-[9px] text-gray-500 mt-1">— Cornell University & Microsoft Research, PNAS 2023</p>
                  <p className="text-[9px] text-amber-400/80 mt-1.5 pt-1.5 border-t border-white/5 leading-snug">💡 Implikasi PTPN: hybrid kantor dapat menurunkan biaya perjalanan & emisi secara signifikan.</p>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* ── TECHNOLOGY ── */}
          {activeTab === 'technology' && (
            <motion.div key="technology" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="flex flex-col gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Green Digital Enablement</h2>
                <p className="text-xs text-gray-400 mt-1">Teknologi sebagai enabler transformasi ESG — 4 pilar utama</p>
              </div>
              {/* 4 Pillars */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: <Layers className="w-5 h-5" />, color: 'blue', title: 'Paperless Operations', desc: 'Eliminasi dokumen fisik di seluruh proses kerja', items: ['E-Signature & digital approval', 'IHCMIS — Paperless HC backbone', 'ESS — Layanan mandiri karyawan', 'SOP Online — Standarisasi digital'] },
                  { icon: <Globe className="w-5 h-5" />, color: 'cyan', title: 'Green IT Infrastructure', desc: 'Infrastruktur TI hemat energi & scalable', items: ['Cloud-first server consolidation', 'Shared workspace & cloud storage', 'Energy monitoring dashboard IT'] },
                  { icon: <Cpu className="w-5 h-5" />, color: 'purple', title: 'Workflow Automation', desc: 'Otomasi proses repetitif untuk efisiensi', items: ['AI-powered approval routing', 'Auto-notification & reminder', 'Robotic Process Automation (RPA)'] },
                  { icon: <BarChart3 className="w-5 h-5" />, color: 'emerald', title: 'Data & Analytics', desc: 'Keputusan berbasis data, bukan asumsi', items: ['ESG & Cost Reporting (GRI/ISSB)', 'Predictive analytics HC', 'Executive Command Center'] },
                ].map((p, i) => {
                  const cm: Record<string, { border: string; icon: string; dot: string }> = {
                    blue: { border: 'border-blue-500/40', icon: 'bg-blue-500/15 text-blue-400', dot: 'bg-blue-400' },
                    cyan: { border: 'border-cyan-500/40', icon: 'bg-cyan-500/15 text-cyan-400', dot: 'bg-cyan-400' },
                    purple: { border: 'border-purple-500/40', icon: 'bg-purple-500/15 text-purple-400', dot: 'bg-purple-400' },
                    emerald: { border: 'border-emerald-500/40', icon: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
                  };
                  return (
                    <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.08 }} className={`p-4 rounded-2xl glass-card border-t-2 ${cm[p.color].border} flex flex-col gap-3`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cm[p.color].icon}`}>{p.icon}</div>
                      <div>
                        <div className="text-sm font-bold text-white leading-tight">{p.title}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{p.desc}</div>
                      </div>
                      <div className="space-y-1.5 mt-auto">
                        {p.items.map((item, j) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${cm[p.color].dot}`} />
                            <span className="text-[9px] md:text-[10px] leading-snug text-gray-400">{item}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {/* Benchmark + Insight */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }} className="p-4 rounded-2xl glass-card border-l-4 border-blue-500">
                  <div className="flex items-center gap-2 mb-2"><Globe className="w-3.5 h-3.5 text-blue-400" /><span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Global Benchmark</span></div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Siemens — Cloud HR Migration</span><span className="text-white font-semibold">SuccessFactors + Workday</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Cornell–Microsoft Research</span><span className="text-white font-semibold">−54% carbon (remote)</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">DocuSign — E-signature Global</span><span className="text-white font-semibold">82% faster agreement</span></div>
                  </div>
                </motion.div>
                <motion.div initial={{ y: 15, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }} className="p-4 rounded-2xl glass-card border-l-4 border-purple-500">
                  <div className="flex items-center gap-2 mb-2"><Sparkles className="w-3.5 h-3.5 text-purple-400" /><span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Consultant Insight</span></div>
                  <p className="text-gray-300 text-xs italic leading-relaxed">"<span className="text-white font-semibold">92% of companies</span> achieve positive ROI from intelligent automation, with leading organizations seeing cost reductions within <span className="text-white font-semibold">12–18 months</span>."</p>
                  <p className="text-[10px] text-gray-500 mt-1.5">— Deloitte Intelligent Automation Survey, 2022</p>
                </motion.div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}





function GovernanceSlide() {
  const structure = [
    {
      role: 'Program Owner',
      name: 'Group of Cost',
      kpi: 'Program on-track & budget',
      review: 'Monthly',
      color: 'emerald',
    },
    {
      role: 'Sponsor',
      name: 'BOD',
      kpi: 'Strategic alignment & ROI',
      review: 'Quarterly',
      color: 'amber',
    },
    {
      role: 'Champion',
      name: 'Green Ambassador',
      kpi: 'Unit adoption & engagement',
      review: 'Bi-weekly',
      color: 'purple',
    },
  ];

  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    amber: 'bg-amber-500/10  border-amber-500/30  text-amber-400',
    cyan: 'bg-cyan-500/10   border-cyan-500/30   text-cyan-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };

  const escalation = [
    { from: 'Green Ambassador', to: 'Group of Cost', trigger: 'Unit adoption < 60% dalam 2 minggu' },
    { from: 'Group of Cost', to: 'BOD', trigger: 'Cost saving < 50% target di Day-60' },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center py-2 overflow-y-auto gap-3 md:gap-4 lg:gap-6">
      {/* Header */}
      <div>
        <p className="text-[10px] md:text-xs font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-1">Program Governance</p>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">Struktur & Akuntabilitas</h2>
      </div>

      {/* Role Cards with KPI */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {structure.map((item, i) => (
          <motion.div
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.1 }}
            className="p-3 md:p-4 rounded-2xl glass-card flex flex-col gap-2"
          >
            {/* Role badge */}
            <div className={`inline-flex items-center self-start px-2 py-1 rounded-full border text-[9px] md:text-[10px] font-semibold uppercase tracking-wider ${colorMap[item.color]}`}>
              {item.role}
            </div>
            {/* Name */}
            <div className="text-base md:text-lg font-bold text-white leading-tight">{item.name}</div>
            {/* KPI */}
            <div className="text-[10px] md:text-xs text-gray-400 leading-snug border-t border-white/5 pt-2">
              <span className="text-gray-500 uppercase tracking-wider text-[9px]">KPI · </span>
              {item.kpi}
            </div>
            {/* Review cadence */}
            <div className={`text-[9px] md:text-[10px] font-semibold uppercase tracking-wider ${colorMap[item.color].split(' ')[2]}`}>
              ↻ Review {item.review}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom row: Escalation + Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Escalation Path */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="p-4 rounded-2xl glass-card border-l-4 border-red-500/60"
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-red-400" />
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider">Eskalasi Path</span>
          </div>
          <div className="space-y-3">
            {escalation.map((e, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10px] md:text-xs">
                  <span className="text-gray-300 font-medium">{e.from}</span>
                  <ArrowRight className="w-3 h-3 text-gray-500 shrink-0" />
                  <span className="text-white font-semibold">{e.to}</span>
                </div>
                <p className="text-[9px] md:text-[10px] text-gray-500 italic ml-0">Trigger: {e.trigger}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Dashboard & Monitoring */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="p-4 rounded-2xl glass-card border-l-4 border-[#22c55e]/60"
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[#22c55e]" />
            <span className="text-xs font-semibold text-[#22c55e] uppercase tracking-wider">Dashboard Cost–ESG</span>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] text-[9px] font-medium">Real-time</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
            Monitoring terpusat di Management Command Center — konsumsi listrik, kertas, travel, dan cost saving.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Weekly', desc: 'Group of Cost Report' },
              { label: 'Monthly', desc: 'Program Owner Review' },
              { label: 'Quarterly', desc: 'Board Report' },
            ].map((r, i) => (
              <div key={i} className="p-2 rounded-xl bg-white/5 text-center">
                <div className="text-[#22c55e] font-bold text-xs md:text-sm">{r.label}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{r.desc}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function RoadmapSlide() {
  const phases = [
    {
      day: '30',
      title: 'Launch',
      items: [
        { name: 'Green Pledge', desc: 'Komitmen bersama seluruh pimpinan dan karyawan untuk mendukung inisiatif ramah lingkungan.' },
        { name: 'WFA Policy Deployment', desc: 'Penerbitan kebijakan Work From Anywhere untuk mengurangi mobilitas dan penggunaan fasilitas.' },
        { name: 'Virtual-First Meeting Policy', desc: 'Standarisasi pertemuan daring untuk meminimalisir emisi karbon dari perjalanan dinas.' },
        { name: 'Campaign Start', desc: 'Peluncuran kampanye kesadaran ESG melalui berbagai kanal komunikasi internal.' }
      ]
    },
    {
      day: '60',
      title: 'Transform',
      items: [
        { name: 'Paperless Recruitment', desc: 'Digitalisasi penuh proses rekrutmen untuk mengeliminasi penggunaan kertas secara total.' },
        { name: 'WFA Implementation Sync', desc: 'Sinkronisasi dan evaluasi efektivitas pelaksanaan kebijakan kerja jarak jauh di seluruh unit.' },
        { name: 'ESS Deployment', desc: 'Peluncuran Employee Self Service untuk layanan mandiri karyawan secara digital.' },
        { name: 'SOP Online Deployment', desc: 'Peluncuran standarisasi proses digital untuk memastikan konsistensi operasional di seluruh unit.' }
      ]
    },
    {
      day: '90',
      title: 'Scale',
      items: [
        { name: 'Dashboard Live', desc: 'Peluncuran dashboard pemantauan indikator ESG dan efisiensi biaya secara real-time.' },
        { name: 'Stakeholder Transparency Report', desc: 'Laporan ESG & penghematan biaya yang selaras dengan standar pelaporan global (GRI/ISSB).' },
        { name: 'Champion Award', desc: 'Penghargaan bagi unit yang menunjukkan dedikasi terbaik dalam penerapan budaya kerja hijau.' }
      ]
    },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center py-2 overflow-y-auto gap-3 md:gap-4">
      <div className="text-center md:text-left">
        <p className="text-[10px] md:text-xs font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-1">Quick Wins</p>
        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tracking-tight">Roadmap 90 Hari</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {phases.map((phase, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15 }}
            className="p-4 md:p-5 rounded-2xl glass-card flex flex-col h-full"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div>
                <div className="text-xl font-bold text-white">Day {phase.day}</div>
                <div className="text-[11px] text-gray-500">{phase.title}</div>
              </div>
            </div>
            <div className="space-y-2.5 flex-grow">
              {phase.items.map((item, j) => (
                <div key={j} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0" />
                    {item.name}
                  </div>
                  <p className="text-[10px] text-gray-400 leading-relaxed ml-[14px]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ClosingSlide() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-4xl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-8"
        >
          <Sparkles className="w-16 h-16 text-[#22c55e] mx-auto mb-6" />
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          <p className="text-[10px] md:text-xs font-medium text-[#22c55e] tracking-[0.3em] uppercase mb-3 md:mb-4">Strategic Power Position</p>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-6 tracking-tight leading-tight px-4">
            ESG sebagai penggerak <span className="text-gradient">Efisiensi</span> & Keberlanjutan
          </h2>
          <p className="text-sm md:text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto mb-6 md:mb-8 px-4">
            Melalui <span className="text-emerald-400 font-semibold">People</span>, <span className="text-cyan-400 font-semibold">Process</span>, dan <span className="text-blue-400 font-semibold">Technology</span> — Green SAKURA mentransformasi pola kerja menjadi lebih efisien, hemat biaya, dan ramah lingkungan.
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap justify-center gap-3 md:gap-6 px-4"
        >
          {['Cost Efficiency', 'Green Ways of Working', 'ESG Driven'].map((label, i) => (
            <div key={i} className="px-4 md:px-6 py-2 md:py-3 rounded-full glass-card text-white text-xs md:text-sm font-medium">
              {label}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
