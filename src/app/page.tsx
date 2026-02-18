'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, Users, Settings, Cpu, TrendingUp, Shield, Award, Clock,
  ChevronLeft, ChevronRight, Sparkles, ArrowRight, Target, Zap,
  Check, BarChart3, Globe, Layers, Mic, MicOff
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

  const total = 8;
  const slideTitles = [
    "Title Slide - Green SAKURA",
    "Strategic Objectives",
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
              {current === 1 && <ObjectivesSlide />}
              {current === 2 && <PeopleStreamSlide />}
              {current === 3 && <ProcessStreamSlide />}
              {current === 4 && <TechnologyStreamSlide />}
              {current === 5 && <GovernanceSlide />}
              {current === 6 && <RoadmapSlide />}
              {current === 7 && <ClosingSlide />}
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
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center max-w-4xl">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative inline-block mb-12"
        >
          <div className="w-32 h-32 rounded-[32px] bg-gradient-to-br from-[#22c55e]/20 to-[#16a34a]/10 border border-[#22c55e]/30 flex items-center justify-center glow-green animate-float">
            <Leaf className="w-16 h-16 text-[#22c55e]" />
          </div>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
          <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.3em] uppercase mb-4 md:mb-6">ESG Transformation Program</p>
          <h1 className="text-4xl md:text-8xl font-bold text-gradient mb-6 md:mb-8 tracking-tight">Green SAKURA</h1>
          <p className="text-lg md:text-2xl text-gray-400 font-light leading-relaxed max-w-2xl mx-auto px-4">
            Sustainable & Agile Work Culture for <span className="text-white font-medium">Responsible Corporate Action</span>
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col md:flex-row justify-center gap-4 md:gap-8 mt-10 md:mt-16"
        >
          <div className="px-6 py-4 rounded-2xl glass-card">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Initiated By</div>
            <div className="text-base md:text-lg font-semibold text-white">Group of Cost</div>
          </div>
          <div className="px-6 py-4 rounded-2xl glass-card">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Scope</div>
            <div className="text-base md:text-lg font-semibold text-white text-center">Holding PTPN III</div>
          </div>
          <div className="px-6 py-4 rounded-2xl glass-card">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Timeline</div>
            <div className="text-base md:text-lg font-semibold text-white">90 Days</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ObjectivesSlide() {
  const objectives = [
    { icon: <Leaf className="w-8 h-8" />, title: 'Green Culture', desc: 'Membangun budaya kerja ramah lingkungan & sadar aset' },
    { icon: <TrendingUp className="w-8 h-8" />, title: 'Cost Efficiency', desc: 'Menurunkan carbon footprint & operational cost' },
    { icon: <Cpu className="w-8 h-8" />, title: 'Digital Ways', desc: 'Mendorong paperless & digital ways of working' },
    { icon: <Shield className="w-8 h-8" />, title: 'Strategic ESG', desc: 'ESG sebagai penggerak efisiensi & transformasi' },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-8">
      <div className="mb-8 md:mb-16">
        <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-4">Strategic Objectives</p>
        <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">Tujuan Program</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
        {objectives.map((obj, i) => (
          <motion.div
            key={i}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="p-8 rounded-3xl glass-card group hover:border-[#22c55e]/30 transition-all"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center text-[#22c55e] mb-6 group-hover:scale-110 transition-transform">
              {obj.icon}
            </div>
            <h3 className="text-xl font-bold text-white mb-3">{obj.title}</h3>
            <p className="text-gray-400 leading-relaxed">{obj.desc}</p>
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
  return (
    <div className="h-full flex flex-col justify-start md:justify-center gap-6 md:gap-8 pt-4 md:pt-0 py-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row gap-8 md:gap-12">
        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs md:text-sm font-medium mb-4 w-fit">
            <Settings className="w-4 h-4" /> Process Stream
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Green Policy & Ways of Working</h2>
          <p className="text-base md:text-lg text-gray-400 leading-relaxed mb-6">Aturan & cara kerja yang lebih ramah lingkungan</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {['No Overtime Policy', 'WFH / WFA Options', 'Virtual-First Meeting', 'Travel berbasis Urgensi', 'Shared Room Standard', 'Paper Usage Control'].map((item, i) => (
              <motion.div key={i} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 + i * 0.08 }} className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-white text-xs md:text-sm">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-72">
          <div className="p-5 rounded-2xl glass-card">
            <h4 className="text-[10px] md:text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Expected Impact</h4>
            <div className="space-y-4">
              {[
                { label: 'Travel Cost Reduction', value: '-30%', icon: <TrendingUp /> },
                { label: 'Virtual Meeting Ratio', value: '70%', icon: <Globe /> },
                { label: 'Paper Consumption', value: '-50%', icon: <Layers /> },
              ].map((stat, i) => (
                <motion.div key={i} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 + i * 0.15 }} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                    {React.cloneElement(stat.icon, { className: 'w-4 h-4' })}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400">{stat.label}</div>
                    <div className="text-base md:text-lg font-bold text-white">{stat.value}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Benchmark & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="p-5 rounded-2xl glass-card border-l-4 border-cyan-500">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Global Benchmark</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Microsoft — Hybrid Work Policy</span><span className="text-white font-semibold">40% travel reduction</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Spotify — Work From Anywhere</span><span className="text-white font-semibold">73% virtual meetings</span></div>
            <div className="flex justify-between"><span className="text-gray-400">SAP — No Paper Strategy</span><span className="text-white font-semibold">90% paperless</span></div>
          </div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="p-5 rounded-2xl glass-card border-l-4 border-amber-500">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Consultant Insight</span>
          </div>
          <p className="text-gray-300 text-sm italic leading-relaxed">"Hybrid work policies reduce corporate carbon emissions by <span className="text-white font-semibold">30-50%</span> while improving employee productivity by <span className="text-white font-semibold">15%</span>."</p>
          <p className="text-xs text-gray-500 mt-2">— Boston Consulting Group, 2024</p>
        </motion.div>
      </div>
    </div>
  );
}

function TechnologyStreamSlide() {
  return (
    <div className="h-full flex flex-col justify-start md:justify-center gap-6 md:gap-8 pt-4 md:pt-0 py-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row gap-8 md:gap-12">
        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs md:text-sm font-medium mb-4 w-fit">
            <Cpu className="w-4 h-4" /> Technology Stream
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Green Digital Enablement</h2>
          <p className="text-base md:text-lg text-gray-400 leading-relaxed mb-6 text-center md:text-left">Teknologi sebagai enabler transformasi ESG</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Online Recruitment', desc: 'End-to-end digital hiring' },
              { title: 'Paperless System', desc: 'HR & admin digitization' },
              { title: 'Digital Collaboration', desc: 'Unified platform' },
              { title: 'Workflow Automation', desc: 'AI-powered processes' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-blue-500/30 transition-all">
                <h4 className="text-base font-semibold text-white mb-1">{item.title}</h4>
                <p className="text-gray-400 text-xs md:text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-72">
          <div className="p-6 rounded-2xl glass-card text-center">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto mb-4">
              <BarChart3 className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <h4 className="text-lg md:text-xl font-bold text-white mb-1">Digital Maturity</h4>
            <p className="text-gray-400 text-[10px] md:text-xs mb-4">Target pencapaian</p>
            <div className="text-4xl md:text-5xl font-bold text-gradient mb-2">85%</div>
            <p className="text-[10px] text-gray-500">Proses HR & Admin Paperless</p>
          </div>
        </div>
      </div>

      {/* Benchmark & Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="p-5 rounded-2xl glass-card border-l-4 border-blue-500">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Global Benchmark</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Siemens — Digital HR Platform</span><span className="text-white font-semibold">100% cloud HR</span></div>
            <div className="flex justify-between"><span className="text-gray-400">HSBC — Paperless Banking Ops</span><span className="text-white font-semibold">85% digital docs</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Adobe — E-signature Adoption</span><span className="text-white font-semibold">99% approval digital</span></div>
          </div>
        </motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="p-5 rounded-2xl glass-card border-l-4 border-purple-500">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Consultant Insight</span>
          </div>
          <p className="text-gray-300 text-sm italic leading-relaxed">"Digital HR transformation delivers <span className="text-white font-semibold">40% cost savings</span> in admin operations and reduces paper waste by <span className="text-white font-semibold">8 tons/year</span> for mid-size enterprises."</p>
          <p className="text-xs text-gray-500 mt-2">— Deloitte Digital, 2024</p>
        </motion.div>
      </div>
    </div>
  );
}

function GovernanceSlide() {
  const structure = [
    { role: 'Program Owner', name: 'HC Director' },
    { role: 'Sponsor', name: 'Direksi' },
    { role: 'PMO', name: 'FGD COST' },
    { role: 'Champion', name: 'Green Ambassador' },
  ];

  return (
    <div className="h-full flex flex-col justify-start md:justify-center pt-4 md:pt-0 py-8 overflow-y-auto">
      <div className="mb-8 md:mb-12">
        <p className="text-xs md:text-sm font-medium text-[#22c55e] tracking-[0.2em] uppercase mb-4">Program Governance</p>
        <h2 className="text-4xl md:text-6xl font-bold text-white tracking-tight">Struktur Program</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8 md:mb-12">
        {structure.map((item, i) => (
          <motion.div
            key={i}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className="p-6 rounded-2xl glass-card text-center"
          >
            <div className="text-xs text-[#22c55e] uppercase tracking-wider mb-3">{item.role}</div>
            <div className="text-xl font-bold text-white">{item.name}</div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="p-6 md:p-8 rounded-3xl glass-card flex flex-col md:flex-row items-center gap-4 md:gap-8 text-center md:text-left"
      >
        <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center text-[#22c55e]">
          <BarChart3 className="w-6 h-6 md:w-8 md:h-8" />
        </div>
        <div className="flex-1">
          <h4 className="text-lg md:text-xl font-bold text-white mb-2">Dashboard Cost–ESG</h4>
          <p className="text-sm md:text-base text-gray-400">Monitoring terpusat di Management Command Center untuk konsumsi listrik, kertas, travel, dan cost saving</p>
        </div>
        <div className="px-4 py-2 rounded-full bg-[#22c55e]/10 text-[#22c55e] text-xs md:text-sm font-medium">
          Real-time Sync
        </div>
      </motion.div>
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
