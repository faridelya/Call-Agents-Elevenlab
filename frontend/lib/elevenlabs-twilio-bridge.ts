/**
 * WebSocket bridge between Twilio Media Streams and ElevenLabs Conversational AI.
 *
 * Flow:
 *   Inbound call → Twilio → TwiML <Connect><Stream> → this bridge → ElevenLabs agent
 *   ElevenLabs agent audio response → this bridge → Twilio → caller's ear
 *
 * Audio formats:
 *   Twilio sends/receives: µ-law (PCMU) 8 kHz mono, base64-encoded
 *   ElevenLabs input:      same base64 µ-law chunks via user_audio_chunk
 *   ElevenLabs output:     ulaw_8000 (configured via conversation_initiation_client_data)
 */

import WebSocket from 'ws';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TwilioConnectedEvent  { event: 'connected'; protocol: string; version: string }
interface TwilioStartEvent      { event: 'start';     start: { streamSid: string; callSid: string; accountSid: string } }
interface TwilioMediaEvent      { event: 'media';     media: { track: string; chunk: string; timestamp: string; payload: string }; streamSid: string }
interface TwilioStopEvent       { event: 'stop';      stop: { callSid: string } }
type TwilioEvent = TwilioConnectedEvent | TwilioStartEvent | TwilioMediaEvent | TwilioStopEvent;

interface ElevenLabsAudio       { type: 'audio';               audio_base_64: string; isFinal: boolean }
interface ElevenLabsInterrupt   { type: 'interruption' }
interface ElevenLabsPing        { type: 'ping';                event_id: number; ping_ms?: number }
interface ElevenLabsTranscript  { type: 'user_transcript';     user_transcribed_text: string }
interface ElevenLabsAgentResp   { type: 'agent_response';      agent_response: string }
interface ElevenLabsConvInit    { type: 'conversation_initiation_metadata'; conversation_id: string }
type ElevenLabsMessage = ElevenLabsAudio | ElevenLabsInterrupt | ElevenLabsPing | ElevenLabsTranscript | ElevenLabsAgentResp | ElevenLabsConvInit;

// ─── Bridge ───────────────────────────────────────────────────────────────────

export function handleTwilioStream(twilioWs: WebSocket, callMetadata?: Record<string, string>) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    console.error('[bridge] Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID');
    twilioWs.close();
    return;
  }

  let streamSid: string | null = null;
  let callSid:   string | null = null;
  let elevenWs:  WebSocket | null = null;
  let ready = false;             // ElevenLabs init handshake complete
  const audioQueue: string[] = []; // buffer audio until ElevenLabs is ready

  // ── Connect to ElevenLabs ─────────────────────────────────────────────────
  const connectElevenLabs = () => {
    const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${ELEVENLABS_AGENT_ID}`;
    elevenWs = new WebSocket(url, { headers: { 'xi-api-key': ELEVENLABS_API_KEY } });

    elevenWs.on('open', () => {
      console.log('[bridge] ElevenLabs connected');

      // Configure output to µ-law 8 kHz so Twilio can play it directly
      const initMsg = {
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          agent: {
            // Optionally override prompt / first_message here
            ...(callMetadata?.systemPrompt
              ? { prompt: { prompt: callMetadata.systemPrompt } }
              : {}),
          },
          tts: {
            output_format: 'ulaw_8000', // Twilio-compatible
          },
        },
      };
      elevenWs!.send(JSON.stringify(initMsg));
    });

    elevenWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ElevenLabsMessage;

        switch (msg.type) {
          case 'conversation_initiation_metadata':
            console.log('[bridge] Conversation ID:', msg.conversation_id);
            ready = true;
            // Flush any buffered audio
            for (const chunk of audioQueue) {
              elevenWs!.send(JSON.stringify({ user_audio_chunk: chunk }));
            }
            audioQueue.length = 0;
            break;

          case 'audio':
            // Forward ElevenLabs TTS audio → Twilio caller
            if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
              twilioWs.send(
                JSON.stringify({
                  event: 'media',
                  streamSid,
                  media: { payload: msg.audio_base_64 },
                }),
              );
            }
            break;

          case 'interruption':
            // User spoke → clear Twilio's playback buffer
            if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
              twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
            }
            break;

          case 'ping':
            elevenWs!.send(JSON.stringify({ type: 'pong', event_id: msg.event_id }));
            break;

          case 'user_transcript':
            console.log('[bridge] User:', msg.user_transcribed_text);
            break;

          case 'agent_response':
            console.log('[bridge] Agent:', msg.agent_response);
            break;
        }
      } catch (err) {
        console.error('[bridge] ElevenLabs message parse error:', err);
      }
    });

    elevenWs.on('close', (code, reason) => {
      console.log(`[bridge] ElevenLabs closed: ${code} ${reason}`);
    });

    elevenWs.on('error', (err) => {
      console.error('[bridge] ElevenLabs error:', err);
    });
  };

  // ── Handle Twilio messages ────────────────────────────────────────────────
  twilioWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as TwilioEvent;

      switch (msg.event) {
        case 'connected':
          console.log('[bridge] Twilio stream connected');
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          callSid   = msg.start.callSid;
          console.log(`[bridge] Stream ${streamSid} / Call ${callSid}`);
          connectElevenLabs();
          break;

        case 'media':
          // Only forward inbound (caller → agent) audio
          if (msg.media.track !== 'inbound') break;
          if (ready && elevenWs?.readyState === WebSocket.OPEN) {
            elevenWs.send(JSON.stringify({ user_audio_chunk: msg.media.payload }));
          } else {
            // Buffer until ElevenLabs init completes
            audioQueue.push(msg.media.payload);
            if (audioQueue.length > 200) audioQueue.shift(); // safety cap
          }
          break;

        case 'stop':
          console.log(`[bridge] Stream stopped for call ${callSid}`);
          elevenWs?.close();
          break;
      }
    } catch (err) {
      console.error('[bridge] Twilio message parse error:', err);
    }
  });

  twilioWs.on('close', () => {
    console.log('[bridge] Twilio WebSocket closed');
    elevenWs?.close();
  });

  twilioWs.on('error', (err) => {
    console.error('[bridge] Twilio WebSocket error:', err);
  });
}
