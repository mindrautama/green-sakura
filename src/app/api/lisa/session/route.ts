import { NextResponse } from 'next/server';

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

export async function POST() {
    try {
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-realtime-preview',
                modalities: ['text', 'audio'],
                voice: 'shimmer',
                instructions: LISA_CONTEXT,
                input_audio_transcription: {
                    model: 'whisper-1',
                },
                turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                },
                tools: [
                    {
                        type: 'function',
                        name: 'navigate_slide',
                        description:
                            'Change the presentation slide. Use this when the user says Next, Back, Selanjutnya, Kembali, etc.',
                        parameters: {
                            type: 'object',
                            properties: {
                                direction: {
                                    type: 'string',
                                    enum: ['next', 'back'],
                                    description: 'The direction to move the slides.',
                                },
                            },
                            required: ['direction'],
                        },
                    },
                ],
                tool_choice: 'auto',
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('OpenAI Session Error:', errorData);
            return NextResponse.json(
                { error: 'Failed to create session' },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Session creation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
