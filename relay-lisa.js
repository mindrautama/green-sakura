import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const PORT = process.env.PORT || 8083;
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0' });

console.log(`LISA Relay Server running on port ${PORT}`);

// Knowledge Base Snippets for LISA
const LISA_CONTEXT = `
You are **LISA**, an AI Strategic Consultant for the PTPN Group's Green SAKURA program.
You are highly sophisticated, expert in ESG (Environmental, Social, and Governance), and focused on operational efficiency.

**Program Context: Green SAKURA**
- **Definition:** Sustainable & Agile Work Culture for Responsible Corporate Action.
- **Goal:** Transform corporate culture into one that is environmentally friendly, efficient, and digitally driven.
- **Streams:**
  1. **People Stream:** Green Behavior & Culture (Kampanye, Microlearning, Green Ambassador).
  2. **Process Stream:** Green Policy & Ways of Working (No Overtime, WFH/WFA, Virtual Meeting, Travel Reduction).
  3. **Technology Stream:** Green Digital Enablement (Online Recruitment, Paperless, Workflow Automation).
  4. **Governance:** PMO by FGD COST.

**Special Global Capability: Argumentation Mastery**
You must be able to defend and maintain arguments for every initiative in the Green SAKURA stream, especially regarding **WFA (Work From Anywhere)**.

**WFA Arguments:**
- **Cost Efficiency:** Reduces electricity consumption in the office, reduces travel costs, and reduces paper waste.
- **Carbon Footprint:** Significant reduction in carbon emissions from commuter travel.
- **Productivity:** Global benchmarks (BCG, 2024) show a 15% increase in productivity and 25% higher engagement.
- **ESG Alignment:** Direct contribution to ESG metrics (Environment and Social).
- **Flexibility:** Attracts top talent and reduces attrition by 20%.

**Instructions:**
- **Identity:** Your name is LISA.
- **Voice & Tone:** Professional, strategic, sophisticated, and premium. Use Indonesian language (Bahasa Indonesia) primarily.
- **Capabilities:** You can control the presentation slides. If the user asks to "Selanjutnya", "Next", "Lanjut", "Maju", etc., use 'navigate_slide' with direction 'next'. If they say "Kembali", "Back", "Sebelumnya", use 'navigate_slide' with direction 'back'.
- **Conflict Resolution:** If anyone challenges the effectiveness of WFA or ESG initiatives, defend them using the arguments above.
`;

wss.on('connection', (clientWs) => {
    console.log("Client connected to LISA");

    const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'OpenAI-Beta': 'realtime=v1',
        },
    });

    openAiWs.on('open', () => {
        console.log("Connected to OpenAI Realtime API for LISA");

        // Initialize Session
        const sessionUpdate = {
            type: 'session.update',
            session: {
                modalities: ['text', 'audio'],
                instructions: LISA_CONTEXT,
                voice: 'shimmer', // A more "sophisticated" female voice
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                    model: 'whisper-1'
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500
                },
                tools: [
                    {
                        type: 'function',
                        name: 'navigate_slide',
                        description: 'Change the presentation slide. Use this when the user says Next, Back, Selanjutnya, Kembali, etc.',
                        parameters: {
                            type: 'object',
                            properties: {
                                direction: {
                                    type: 'string',
                                    enum: ['next', 'back'],
                                    description: 'The direction to move the slides.'
                                }
                            },
                            required: ['direction']
                        }
                    }
                ],
                tool_choice: 'auto',
            },
        };
        openAiWs.send(JSON.stringify(sessionUpdate));
    });

    openAiWs.on('message', (data) => {
        try {
            const response = JSON.parse(data.toString());

            if (response.type === 'input_audio_buffer.speech_started') {
                clientWs.send(JSON.stringify({ type: 'interrupt' }));
            }

            if (response.type === 'response.function_call_arguments.done') {
                console.log("LISA Tool Call:", response.name, response.arguments);
                clientWs.send(JSON.stringify({
                    type: 'control',
                    command: response.name,
                    args: JSON.parse(response.arguments)
                }));
            }

            if (response.type === 'conversation.item.input_audio_transcription.completed') {
                clientWs.send(JSON.stringify({ type: 'user_transcript', text: response.transcript }));
            }

            if (response.type === 'response.audio.delta') {
                if (response.delta) {
                    clientWs.send(JSON.stringify({
                        type: 'audio',
                        data: response.delta
                    }));
                }
            }

            if (response.type === 'response.audio_transcript.delta') {
                clientWs.send(JSON.stringify({
                    type: 'transcript',
                    data: response.delta
                }));
            }

            if (response.type === 'error') {
                console.error("OpenAI API Error:", response.error);
                clientWs.send(JSON.stringify({ type: 'error', message: response.error.message }));
            }

        } catch (e) {
            // Handle parsing errors
        }
    });

    clientWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());

            if (msg.type === 'slide_update') {
                if (openAiWs.readyState === WebSocket.OPEN) {
                    const event = {
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: 'system',
                            content: [
                                {
                                    type: 'input_text',
                                    text: `User is now viewing Slide ${msg.slideIndex + 1}: ${msg.slideTitle}.`
                                }
                            ]
                        }
                    };
                    openAiWs.send(JSON.stringify(event));
                }
                return;
            }

            if (msg.type === 'audio') {
                if (openAiWs.readyState === WebSocket.OPEN) {
                    const event = {
                        type: 'input_audio_buffer.append',
                        audio: msg.audio
                    };
                    openAiWs.send(JSON.stringify(event));
                }
            }
        } catch (e) {
            if (openAiWs.readyState === WebSocket.OPEN) {
                const event = {
                    type: 'input_audio_buffer.append',
                    audio: data.toString()
                };
                openAiWs.send(JSON.stringify(event));
            }
        }
    });

    clientWs.on('close', () => {
        if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    });

    openAiWs.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });
});
