'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, Users, Settings, Cpu, TrendingUp, Shield, Award, Clock,
  ChevronLeft, ChevronRight, Sparkles, ArrowRight, Target, Zap,
  Check, BarChart3, Globe, Layers, Mic, MicOff, AlertCircle, TrendingDown,
  ArrowDown
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

  const total = 10;
  const slideTitles = [
    "Title Slide - Green SAKURA",
    "Latar Belakang: Gap Benchmark SGA",
    "Strategic Objectives",
    "Overview 3 Stream",
    "People Stream: Green Behavior & Culture",
    "Process Stream: Green Policy & Ways of Working",
    "Technology Stream: Green Digital Enablement",
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
            <div className="text-xs text-gray-500">PTPN III Holding</div>
            <div className="text-sm font-medium text-white">FGD COST</div>
          </div>
        </header>

        {/* Slide Area */}
        <main className="flex-1 px-6 md:px-16 pb-8 overflow-y-auto md:overflow-hidden">
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
              {current === 4 && <PeopleStreamSlide />}
              {current === 5 && <ProcessStreamSlide />}
              {current === 6 && <TechnologyStreamSlide />}
              {current === 7 && <GovernanceSlide />}
              {current === 8 && <RoadmapSlide />}
              {current === 9 && <ClosingSlide />}
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
          className="relative inline-block mb-12"
        >
          <div className="w-40 h-40 rounded-[40px] bg-gradient-to-br from-[#22c55e]/20 to-[#16a34a]/5 border border-[#22c55e]/30 flex items-center justify-center glow-green shadow-[0_0_50px_rgba(34,197,94,0.15)]">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 0.95, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Leaf className="w-20 h-20 text-[#22c55e]" />
            </motion.div>
          </div>
          {/* Ornamental rings */}
          <div className="absolute inset-0 rounded-[40px] border border-[#22c55e]/10 scale-125 animate-pulse" />
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <p className="text-xs md:text-base font-bold text-[#22c55e] tracking-[0.5em] uppercase mb-6 drop-shadow-sm">
            ESG Transformation Program
          </p>
          <h1 className="text-6xl md:text-[10rem] font-black text-gradient mb-8 tracking-tighter leading-none py-2">
            Green SAKURA
          </h1>
          <p className="text-xl md:text-3xl text-gray-400 font-light leading-snug max-w-3xl mx-auto px-4 tracking-wide">
            Sustainable & Agile Work Culture for <span className="text-white font-semibold underline underline-offset-8 decoration-[#22c55e]/40">Responsible Corporate Action</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="flex flex-wrap justify-center gap-4 md:gap-10 mt-16 md:mt-24"
        >
          {[
            { label: 'Initiated By', value: 'Group of Cost' },
            { label: 'Scope', value: 'Holding PTPN III' },
            { label: 'Timeline', value: '90 Days Program' }
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -5, backgroundColor: "rgba(255,255,255,0.05)" }}
              className="px-10 py-6 rounded-3xl glass-card border border-white/10 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#22c55e]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-[10px] md:text-xs text-gray-500 uppercase tracking-[0.2em] mb-2 font-bold">{item.label}</div>
              <div className="text-lg md:text-2xl font-bold text-white tracking-tight">{item.value}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
function BackgroundSlide() {
  const q3Data = [
    { name: 'PT Triputra', sga: '7%', color: 'blue' },
    { name: 'Sinarmas Agro', sga: '8%', color: 'blue' },
    { name: 'Astra Agro', sga: '13%', color: 'blue' },
    { name: 'Rata-rata Peers', sga: '9%', color: 'blue' },
    { name: 'PTPN III', sga: '17%', color: 'red', highlight: true },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-4 overflow-y-auto gap-6 md:gap-8">
      {/* Header */}
      <div>
        <p className="text-xs md:text-sm font-medium text-red-400 tracking-[0.2em] uppercase mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Latar Belakang & Urgensi
        </p>
        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
          Gap Efisiensi: SGA to Sales Ratio
        </h2>
        <p className="text-gray-400 mt-2 text-sm md:text-base">Perbandingan efisiensi operasional PTPN III terhadap Industri Perkebunan (Peers)</p>
      </div>

      {/* Main Stats Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: 2024 Full Year */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-3xl glass-card border-l-4 border-red-500/50"
        >
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Baseline Tahun 2024</div>
          <div className="flex items-end gap-6 mb-6">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Peers Avg</div>
              <div className="text-4xl font-bold text-white">8<span className="text-lg">%</span></div>
            </div>
            <div className="mb-2 text-red-500 animate-pulse">
              <TrendingDown className="w-6 h-6 rotate-180" />
            </div>
            <div>
              <div className="text-[10px] text-red-500 uppercase">PTPN III</div>
              <div className="text-4xl font-bold text-red-500">21<span className="text-lg">%</span></div>
            </div>
          </div>
          <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/10">
            <p className="text-xs text-red-400/90 leading-relaxed italic">
              "Terdapat <strong>selisih 13%</strong> dalam SGA to Sales ratio yang menunjukkan inefisiensi biaya operasional & admin dibanding standar industri."
            </p>
          </div>
        </motion.div>

        {/* Right: Q3 2025 Progress */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="p-6 rounded-3xl glass-card border-l-4 border-amber-500/50"
        >
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Posisi Quartal-3 2025</div>
          <div className="flex items-end gap-6 mb-6">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Peers Avg</div>
              <div className="text-4xl font-bold text-white">9<span className="text-lg">%</span></div>
            </div>
            <div className="mb-2 text-amber-500">
              <TrendingUp className="w-6 h-6 rotate-180" />
            </div>
            <div>
              <div className="text-[10px] text-amber-500 uppercase">PTPN III</div>
              <div className="text-4xl font-bold text-amber-400">17<span className="text-lg">%</span></div>
            </div>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Meskipun membaik, PTPN III masih mencatatkan <strong>SGA Rp 7.39 T</strong> — hampir 3x lipat rata-rata peers di Rp 2.78 T.
          </p>
        </motion.div>
      </div>

      {/* Peers Breakdown Bar Chart Style */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="p-6 rounded-3xl glass-card bg-white/[0.02]"
      >
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Benchmark SGA to Sales (Q3-2025)</h4>
          <span className="text-[10px] text-gray-500 italic">*Data per Sept 2025</span>
        </div>
        <div className="space-y-5">
          {q3Data.map((peer, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between items-end px-1">
                <span className={`text-xs ${peer.highlight ? 'text-white font-bold' : 'text-gray-400'}`}>{peer.name}</span>
                <span className={`text-sm font-bold ${peer.highlight ? 'text-red-500' : 'text-white'}`}>{peer.sga}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(parseInt(peer.sga) / 21) * 100}%` }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
                  className={`h-full rounded-full ${peer.highlight ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-white/20'}`}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}


function ObjectivesSlide() {
  const objectives = [
    {
      label: 'Go',
      name: 'Lean',
      desc: 'Pioneer of AI-driven production system.',
      goal: 'Menurunkan carbon footprint & operational cost.',
      icon: <Zap className="w-5 h-5" />,
      color: 'amber'
    },
    {
      label: 'Go',
      name: 'Green',
      desc: 'Leading green biz incubator.',
      goal: 'Membangun budaya kerja ramah lingkungan & sadar aset.',
      icon: <Leaf className="w-5 h-5" />,
      color: 'emerald'
    },
    {
      label: 'Go',
      name: 'AI',
      desc: 'First global WEF digital lighthouse.',
      goal: 'Mendorong paperless & digital ways of working.',
      icon: <Cpu className="w-5 h-5" />,
      color: 'blue'
    },
  ];

  const colorMap: Record<string, string> = {
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
    emerald: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
    blue: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
  };

  return (
    <div className="h-full flex flex-col justify-center items-center py-4 overflow-y-auto w-full">
      <div className="mb-6 text-center">
        <p className="text-[10px] md:text-xs font-bold text-[#22c55e] tracking-[0.4em] uppercase mb-2">Strategic Framework</p>
        <div className="flex items-center justify-center gap-6 mb-1">
          <div className="h-px w-20 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter">5G</h2>
          <div className="h-px w-20 bg-gradient-to-l from-transparent via-white/20 to-transparent" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-5 w-full items-start justify-center px-4">
        {objectives.map((obj, i) => (
          <div key={i} className="flex-1 flex flex-col items-center w-full min-w-0">
            {/* Main 5G Card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="p-4 rounded-3xl glass-card border border-white/5 hover:border-white/20 transition-all flex flex-col h-40 md:h-44 w-full relative group"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[obj.color].split(' ').slice(2).join(' ')} border ${colorMap[obj.color].split(' ')[1]}`}>
                <div className={colorMap[obj.color].split(' ')[0]}>
                  {obj.icon}
                </div>
              </div>

              <div className="mb-2">
                <span className={`text-sm md:text-base font-black uppercase italic tracking-tighter ${colorMap[obj.color].split(' ')[0]}`}>{obj.label}</span>
                <span className="text-sm md:text-base font-black uppercase italic tracking-tighter text-white ml-1.5">{obj.name}</span>
              </div>
              <p className="text-[10px] md:text-[11px] text-gray-400 leading-tight font-medium">
                {obj.desc}
              </p>
            </motion.div>

            {/* Vertical Connector */}
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
              className={`w-px h-6 md:h-8 bg-gradient-to-b ${colorMap[obj.color].split(' ')[0].replace('text-', 'from-')} to-transparent opacity-40`}
            />

            {/* Focus Tujuan Box */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className={`p-3 rounded-2xl border ${colorMap[obj.color].split(' ')[1]} ${colorMap[obj.color].split(' ')[2]} w-full`}
            >
              <div className="text-[8px] font-black uppercase tracking-widest text-gray-500 mb-1">Focus Tujuan</div>
              <p className="text-[10px] md:text-[11px] text-white font-bold leading-tight">
                {obj.goal}
              </p>
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
      focus: ['Green Habit Campaign', 'Engagement & Incentives', 'Green Ambassador'],
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
      focus: ['Hybrid Work Policy', 'E-SPJ & Digital Field Ops', 'Efficiency Controls'],
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
      focus: ['IHCMIS Backbone', 'Automation & Paperless', 'Data & Analytics'],
      target: '100% Digital Transformation'
    }
  ];

  return (
    <div className="h-full flex flex-col justify-center gap-8 py-4 overflow-y-auto w-full">
      <div className="text-center">
        <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-4">Implementation Pillars</p>
        <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-4">The 3-Stream Focus</h2>
        <div className="h-1 w-24 bg-gradient-to-r from-[#22c55e] to-emerald-400 mx-auto rounded-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {streams.map((stream, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className={`p-8 rounded-[2.5rem] glass-card border-t-4 ${stream.borderColor.replace('500/20', '400')} relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300`}
          >
            <div className={`absolute top-0 right-0 p-10 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity`}>
              {React.cloneElement(stream.icon as React.ReactElement<any>, { className: "w-32 h-32" })}
            </div>

            <div className={`w-16 h-16 rounded-2xl ${stream.bgColor} flex items-center justify-center mb-8 border ${stream.borderColor}`}>
              {stream.icon}
            </div>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-1">{stream.title}</h3>
              <p className={`text-sm font-semibold uppercase tracking-widest ${stream.id === 'people' ? 'text-emerald-400' : stream.id === 'process' ? 'text-cyan-400' : 'text-blue-400'}`}>{stream.subtitle}</p>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              {stream.description}
            </p>

            <div className="space-y-3 mb-8">
              {stream.focus.map((item, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full ${stream.id === 'people' ? 'bg-emerald-400' : stream.id === 'process' ? 'bg-cyan-400' : 'bg-blue-400'}`} />
                  <span className="text-white/80 text-xs font-medium">{item}</span>
                </div>
              ))}
            </div>

            <div className={`mt-auto p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between`}>
              <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Main Target</div>
              <div className="text-white font-bold text-sm tracking-tight">{stream.target}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}


function PeopleStreamSlide() {
  return (
    <div className="h-full flex flex-col justify-start md:justify-center gap-6 md:gap-8 pt-4 md:pt-0 py-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row gap-8 md:gap-12">
        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs md:text-sm font-medium mb-4 w-fit">
            <Users className="w-4 h-4" /> People Stream
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Green Behavior & Culture</h2>
          <p className="text-base md:text-lg text-gray-400 leading-relaxed mb-6">Perubahan perilaku karyawan menjadi lebih sadar lingkungan</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {['Kampanye Green Habit', 'Microlearning ESG 5 menit', 'Green Ambassador per unit', 'Insentif & Recognition'].map((item, i) => (
              <motion.div
                key={i}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
              >
                <Check className="w-4 h-4 text-[#22c55e]" />
                <span className="text-white text-xs md:text-sm">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-80">
          <div className="p-6 rounded-2xl glass-card">
            <h4 className="text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Target KPI</h4>
            <div className="space-y-4">
              {[
                { label: 'Partisipasi Kampanye', value: '85%' },
                { label: 'Penurunan Listrik', value: '-15%' },
                { label: 'ESG Awareness', value: '90%' },
              ].map((kpi, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-400 text-[10px] md:text-xs">{kpi.label}</span>
                    <span className="text-[#22c55e] font-bold text-xs md:text-sm">{kpi.value}</span>
                  </div>
                  <div className="progress-track h-1.5">
                    <motion.div className="progress-fill h-full" initial={{ width: 0 }} animate={{ width: kpi.value }} transition={{ delay: 0.5 + i * 0.2, duration: 1 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Benchmark & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="p-5 rounded-2xl glass-card border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Global Benchmark</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Unilever — Green Culture Program</span><span className="text-white font-semibold">28% energy reduction</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Google — Carbon Neutral Office</span><span className="text-white font-semibold">100% renewable</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Patagonia — Employee ESG Pledge</span><span className="text-white font-semibold">95% participation</span></div>
          </div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="p-5 rounded-2xl glass-card border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Consultant Insight</span>
          </div>
          <p className="text-gray-300 text-sm italic leading-relaxed">"Companies with strong ESG culture see <span className="text-white font-semibold">25% higher employee engagement</span> and <span className="text-white font-semibold">20% lower attrition</span>."</p>
          <p className="text-xs text-gray-500 mt-2">— McKinsey & Company, 2024</p>
        </motion.div>
      </div>
    </div>
  );
}

function ProcessStreamSlide() {
  const policyGroups = [
    {
      label: 'Fungsi Non-Operasional (Kantor)',
      color: 'cyan',
      dot: 'bg-cyan-400',
      icon: '🏢',
      policies: [
        'Hybrid Work untuk fungsi non-operasional',
        'Virtual-First Meeting Policy',
        'E-SPJ (Surat Perjalanan Dinas Digital)',
        'Efisiensi Energi Kantor (AC, Listrik, Lampu)',
      ],
    },
  ];

  const colorBorder: Record<string, string> = {
    cyan: 'border-cyan-500/30',
    emerald: 'border-emerald-500/30',
  };
  const colorText: Record<string, string> = {
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
  };
  const colorBg: Record<string, string> = {
    cyan: 'bg-cyan-500/10',
    emerald: 'bg-emerald-500/10',
  };

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-4 overflow-y-auto gap-4 md:gap-5">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-3 w-fit">
          <Settings className="w-3.5 h-3.5" /> Process Stream
        </div>
        <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight">PTPN Green Ways of Working Framework</h2>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Standar kerja rendah karbon untuk fungsi kantor & operasional kebun PTPN</p>
        <p className="text-[10px] text-cyan-400/70 mt-0.5">Green operating model untuk efisiensi biaya perjalanan, energi, dan kertas di PTPN · Target 2025–2027 vs baseline 2024</p>
      </div>

      {/* Policy Groups + Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
        {/* Two policy category cards */}
        {policyGroups.map((group, gi) => (
          <motion.div
            key={gi}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + gi * 0.15 }}
            className={`p-4 rounded-2xl glass-card border-t-2 ${colorBorder[group.color]}`}
          >
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${colorBg[group.color]} border ${colorBorder[group.color]} mb-3`}>
              <span className="text-sm">{group.icon}</span>
              <span className={`text-[9px] font-semibold uppercase tracking-wider ${colorText[group.color]}`}>{group.label}</span>
            </div>
            <div className="space-y-2">
              {group.policies.map((policy, pi) => (
                <motion.div
                  key={pi}
                  initial={{ x: -15, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + gi * 0.15 + pi * 0.07 }}
                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5"
                >
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${group.dot}`} />
                  <span className="text-white/90 text-xs leading-snug">{policy}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Expected Impact */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="p-4 rounded-2xl glass-card flex flex-col gap-2"
        >
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Expected Impact — WFA Policy</h4>
            <span className="text-[9px] text-gray-600">Scope: Fungsi Non-Ops Kantor</span>
          </div>
          {[
            { label: 'WFA Days Target (Non-Ops)', value: '6–8 hr', tag: 'Per Bulan', icon: <Clock className="w-3.5 h-3.5" />, color: 'text-cyan-400 bg-cyan-500/10', tagColor: 'text-cyan-400/70' },
            { label: 'Travel & Commute Cost', value: '−30%', tag: 'Cost & Carbon', icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'text-emerald-400 bg-emerald-500/10', tagColor: 'text-emerald-400/70' },
            { label: 'Virtual Meeting Adoption', value: '70%', tag: 'Productivity', icon: <Globe className="w-3.5 h-3.5" />, color: 'text-blue-400 bg-blue-500/10', tagColor: 'text-blue-400/70' },
            { label: 'Carbon Emisi Komuter', value: '−25%', tag: 'ESG Impact', icon: <Leaf className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-500/10', tagColor: 'text-amber-400/70' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.55 + i * 0.08 }}
              className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5"
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${stat.color}`}>
                {stat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-gray-400 truncate">{stat.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-white">{stat.value}</span>
                  <span className={`text-[8px] font-medium ${stat.tagColor}`}>{stat.tag}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom: Benchmark + Insight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.65 }} className="p-4 rounded-2xl glass-card border-l-4 border-cyan-500">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Benchmark — Industri Agro & Perkebunan</span>
            </div>
            <span className="text-[8px] text-gray-600 italic">*estimasi berbasis praktik industri</span>
          </div>
          <div className="space-y-3">
            {[
              { company: 'Wilmar International', role: 'Non-Ops (HQ/Regional)', wfa: 8, wfo: 14, note: '35% fuel reduction', source: 'Sustainability Report 2023' },
              { company: 'Cargill Agri', role: 'Non-Ops (Office)', wfa: 10, wfo: 12, note: '40% paperless field ops', source: 'Annual Report 2023' },
              { company: 'Astra Agro Lestari', role: 'Non-Ops (Kantor)', wfa: 6, wfo: 16, note: '100% digital inspection', source: 'Laporan Tahunan 2023' },
            ].map((item, i) => (
              <div key={i} className="text-[10px]">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-gray-300 font-semibold">{item.company}</span>
                  <span className="text-cyan-400/70 text-[9px]">{item.note}</span>
                </div>
                <div className="text-gray-500 mb-1 flex items-center gap-1.5">
                  <span>{item.role} · <span className="text-amber-400 font-bold">{item.wfa} hr WFA</span> + <span className="text-emerald-400 font-bold">{item.wfo} hr WFO</span> /bln</span>
                  <span className="text-[8px] text-gray-600 italic">· Src: {item.source}</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  <div className="bg-amber-400/70 rounded-l-full" style={{ width: `${(item.wfa / 22) * 100}%` }} />
                  <div className="bg-emerald-400/50 rounded-r-full flex-1" />
                </div>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
              <div className="text-[9px] text-cyan-400/80 font-semibold">
                💡 Rekomendasi PTPN: <span className="text-white">6–8 hari WFA/bulan</span> untuk fungsi non-operasional kantor holding
              </div>
              <div className="text-[8px] text-gray-600 italic">
                Ref: Mercer Global Talent Trends 2024 · BCG Future of Work Report 2023 · Gartner HR Survey 2024
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.75 }} className="p-4 rounded-2xl glass-card border-l-4 border-amber-500">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Consultant Insight</span>
          </div>
          <p className="text-gray-300 text-xs italic leading-relaxed">"Hybrid work policies reduce corporate carbon emissions by <span className="text-white font-semibold">30–50%</span> while improving employee productivity by <span className="text-white font-semibold">15%</span> — applicable for both office and field-based organizations."</p>
          <p className="text-[10px] text-gray-500 mt-1.5">— Boston Consulting Group, 2024</p>
          <div className="mt-2 pt-2 border-t border-white/5">
            <p className="text-[10px] text-amber-400/80 leading-relaxed">💡 Implikasi PTPN: digitalisasi kebun & hybrid kantor dapat menurunkan biaya perjalanan operasional dan inspeksi secara signifikan.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TechnologyStreamSlide() {
  const pillars = [
    {
      icon: <Layers className="w-5 h-5" />,
      color: 'blue',
      title: 'Paperless Operations',
      desc: 'Eliminasi dokumen fisik di seluruh proses kerja',
      items: ['E-Signature & digital approval', 'IHCMIS — Paperless HC backbone', 'Digitalisasi arsip & laporan'],
    },
    {
      icon: <Globe className="w-5 h-5" />,
      color: 'cyan',
      title: 'Digital Collaboration',
      desc: 'Platform kerja terpadu, tanpa batas lokasi',
      items: ['Virtual-first meeting platform', 'Shared workspace & cloud storage', 'Real-time document co-editing'],
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      color: 'purple',
      title: 'Workflow Automation',
      desc: 'Otomasi proses repetitif untuk efisiensi',
      items: ['AI-powered approval routing', 'Auto-notification & reminder', 'Robotic Process Automation (RPA)'],
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'emerald',
      title: 'Data & Analytics',
      desc: 'Keputusan berbasis data, bukan asumsi',
      items: ['ESG & cost dashboard real-time', 'Predictive analytics HC', 'Executive Command Center'],
    },
  ];

  const colorMap: Record<string, { pill: string; border: string; icon: string; dot: string }> = {
    blue: { pill: 'bg-blue-500/10 border-blue-500/20 text-blue-400', border: 'border-blue-500/40', icon: 'bg-blue-500/15 text-blue-400', dot: 'bg-blue-400' },
    cyan: { pill: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', border: 'border-cyan-500/40', icon: 'bg-cyan-500/15 text-cyan-400', dot: 'bg-cyan-400' },
    purple: { pill: 'bg-purple-500/10 border-purple-500/20 text-purple-400', border: 'border-purple-500/40', icon: 'bg-purple-500/15 text-purple-400', dot: 'bg-purple-400' },
    emerald: { pill: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', border: 'border-emerald-500/40', icon: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  };

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-4 overflow-y-auto gap-5 md:gap-6">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-3 w-fit">
          <Cpu className="w-3.5 h-3.5" /> Technology Stream
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">Green Digital Enablement</h2>
            <p className="text-sm text-gray-400 mt-1">Teknologi sebagai enabler transformasi ESG — 4 pilar utama</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 self-start md:self-auto">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-gray-400">Backbone: <span className="text-white font-semibold">IHCMIS</span></span>
          </div>
        </div>
      </div>

      {/* 4 Pillars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {pillars.map((p, i) => (
          <motion.div
            key={i}
            initial={{ y: 25, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className={`p-4 rounded-2xl glass-card border-t-2 ${colorMap[p.color].border} flex flex-col gap-3`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[p.color].icon}`}>
              {p.icon}
            </div>
            <div>
              <div className="text-sm font-bold text-white leading-tight">{p.title}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{p.desc}</div>
            </div>
            <div className="space-y-1.5 mt-auto">
              {p.items.map((item, j) => (
                <div key={j} className="flex items-start gap-1.5">
                  <div className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${colorMap[p.color].dot}`} />
                  <span className={`text-[9px] md:text-[10px] leading-snug ${item.includes('IHCMIS') ? 'text-white font-semibold' : 'text-gray-400'}`}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom: Global Benchmark + Insight */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="p-4 rounded-2xl glass-card border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Global Benchmark</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">Siemens — Digital HR Platform</span><span className="text-white font-semibold">100% cloud HR</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Microsoft — Hybrid Work + RPA</span><span className="text-white font-semibold">40% travel reduction</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Adobe — E-signature Adoption</span><span className="text-white font-semibold">99% approval digital</span></div>
          </div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="p-4 rounded-2xl glass-card border-l-4 border-purple-500">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Consultant Insight</span>
          </div>
          <p className="text-gray-300 text-xs md:text-sm italic leading-relaxed">"Digital enablement across people, process & technology reduces operational cost by <span className="text-white font-semibold">30–40%</span> and cuts corporate carbon footprint by <span className="text-white font-semibold">25%</span> within 2 years."</p>
          <p className="text-[10px] text-gray-500 mt-2">— McKinsey Digital, 2024</p>
        </motion.div>
      </div>
    </div>
  );
}



function GovernanceSlide() {
  const structure = [
    {
      role: 'Program Owner',
      name: 'HC Director',
      kpi: 'Program on-track & budget',
      review: 'Monthly',
      color: 'emerald',
    },
    {
      role: 'Sponsor',
      name: 'Direksi',
      kpi: 'Strategic alignment & ROI',
      review: 'Quarterly',
      color: 'amber',
    },
    {
      role: 'PMO',
      name: 'FGD COST',
      kpi: 'Milestone delivery & reporting',
      review: 'Weekly',
      color: 'cyan',
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
    { from: 'Green Ambassador', to: 'FGD COST (PMO)', trigger: 'Unit adoption < 60% dalam 2 minggu' },
    { from: 'FGD COST (PMO)', to: 'HC Director', trigger: 'Milestone Day-30 tidak tercapai' },
    { from: 'HC Director', to: 'Direksi', trigger: 'Cost saving < 50% target di Day-60' },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-4 overflow-y-auto gap-6 md:gap-8">
      {/* Header */}
      <div>
        <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-2">Program Governance</p>
        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight">Struktur & Akuntabilitas</h2>
      </div>

      {/* Role Cards with KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {structure.map((item, i) => (
          <motion.div
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.1 }}
            className="p-4 md:p-5 rounded-2xl glass-card flex flex-col gap-3"
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
          className="p-5 rounded-2xl glass-card border-l-4 border-red-500/60"
        >
          <div className="flex items-center gap-2 mb-4">
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
          className="p-5 rounded-2xl glass-card border-l-4 border-[#22c55e]/60"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[#22c55e]" />
            <span className="text-xs font-semibold text-[#22c55e] uppercase tracking-wider">Dashboard Cost–ESG</span>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] text-[9px] font-medium">Real-time</span>
          </div>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Monitoring terpusat di Management Command Center — konsumsi listrik, kertas, travel, dan cost saving.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Weekly', desc: 'PMO Report' },
              { label: 'Monthly', desc: 'HC Director Review' },
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
        { name: 'Online Meeting Policy', desc: 'Standarisasi pertemuan daring untuk meminimalisir emisi karbon dari perjalanan dinas.' },
        { name: 'Campaign Start', desc: 'Peluncuran kampanye kesadaran ESG melalui berbagai kanal komunikasi internal.' }
      ]
    },
    {
      day: '60',
      title: 'Transform',
      items: [
        { name: 'Paperless Recruitment', desc: 'Digitalisasi penuh proses rekrutmen untuk mengeliminasi penggunaan kertas secara total.' },
        { name: 'WFA Implementation Sync', desc: 'Sinkronisasi dan evaluasi efektivitas pelaksanaan kebijakan kerja jarak jauh di seluruh unit.' },
        { name: 'Travel Approval App', desc: 'Implementasi aplikasi persetujuan perjalanan dinas yang mengutamakan urgensi dan efisiensi.' },
        { name: 'Folder Standard', desc: 'Penetapan standar pengelolaan dokumen digital untuk proses kerja yang lebih terorganisir.' }
      ]
    },
    {
      day: '90',
      title: 'Scale',
      items: [
        { name: 'Dashboard Live', desc: 'Peluncuran dashboard pemantauan indikator ESG dan efisiensi biaya secara real-time.' },
        { name: 'Cost Report', desc: 'Laporan komprehensif hasil penghematan biaya operasional melalui program Green SAKURA.' },
        { name: 'Champion Award', desc: 'Penghargaan bagi unit yang menunjukkan dedikasi terbaik dalam penerapan budaya kerja hijau.' }
      ]
    },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-8 overflow-y-auto">
      <div className="mb-8 md:mb-12 text-center md:text-left">
        <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-4">Quick Wins</p>
        <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">Roadmap 90 Hari</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {phases.map((phase, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.15 }}
            className="p-8 rounded-3xl glass-card flex flex-col h-full"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-[#22c55e]" />
              </div>
              <div>
                <div className="text-3xl font-bold text-white">Day {phase.day}</div>
                <div className="text-sm text-gray-500">{phase.title}</div>
              </div>
            </div>
            <div className="space-y-4 flex-grow">
              {phase.items.map((item, j) => (
                <div key={j} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3 text-white font-semibold text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0" />
                    {item.name}
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed ml-[18px]">
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
          className="mb-12"
        >
          <Sparkles className="w-20 h-20 text-[#22c55e] mx-auto mb-8" />
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.3em] uppercase mb-4 md:mb-6">Strategic Power Position</p>
          <h2 className="text-3xl md:text-6xl font-bold text-white mb-6 md:mb-8 tracking-tight leading-tight px-4">
            ESG sebagai penggerak <span className="text-gradient">Efisiensi</span> & Keberlanjutan
          </h2>
          <p className="text-base md:text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto mb-8 md:mb-12 px-4">
            Green SAKURA mentransformasi pola kerja operasional menjadi lebih efisien, hemat biaya, dan ramah lingkungan.
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap justify-center gap-3 md:gap-6 px-4"
        >
          {['Cost Efficiency', 'Operational Excellence', 'ESG Driven'].map((label, i) => (
            <div key={i} className="px-4 md:px-6 py-2 md:py-3 rounded-full glass-card text-white text-xs md:text-sm font-medium">
              {label}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
