/**
 * WebKit Speech Recognition fallback for voice control.
 *
 * Activates when no OpenAI key is configured. Uses the browser's built-in
 * speech recognition for STT and simple pattern matching for command parsing.
 * No AI understanding — only exact/near-exact command patterns are supported.
 * Results are shown as text; no voice output.
 */

import { t } from '../i18n.js';
import { createGevActionRunner } from './gevActions.js';

const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

/** Whether the browser supports WebKit Speech Recognition. */
export const isWebkitSpeechSupported = Boolean(SpeechRecognition);

// ── Pattern matching ────────────────────────────────────────────────────────

const LAYER_NAME_MAP = new Map([
  ['flights', 'flights'], ['flight', 'flights'], ['aircraft', 'flights'], ['planes', 'flights'],
  ['military', 'military-flights'], ['military flights', 'military-flights'],
  ['vessels', 'ais'], ['ships', 'ais'], ['boats', 'ais'],
  ['satellites', 'satellites'], ['satellite', 'satellites'],
  ['earthquakes', 'earthquakes'], ['earthquake', 'earthquakes'],
  ['traffic', 'traffic'], ['cctv', 'cctv'], ['cameras', 'cctv'],
  ['radio', 'radio'], ['fires', 'firms'], ['fire', 'firms'],
  ['bikeshare', 'bikeshare'], ['launches', 'rocket-launches'], ['launch', 'rocket-launches'],
  ['space', 'rocket-launches'], ['datacenters', 'datacenters'], ['dams', 'dams'],
  ['cables', 'submarine-cables'], ['submarine cables', 'submarine-cables'],
]);

const STYLE_NAME_MAP = new Map([
  ['normal', 'normal'], ['default', 'normal'], ['retro', 'retro'],
  ['surveillance', 'surveillance'], ['nvg', 'surveillance'], ['night vision', 'surveillance'],
  ['thermal', 'thermal'], ['flir', 'thermal'], ['ironbow', 'thermal'],
  ['anime', 'anime'], ['noir', 'noir'], ['black and white', 'noir'],
  ['snow', 'snow'], ['white', 'snow'],
]);

const COMMAND_PATTERNS = [
  // Navigation
  {
    patterns: [/^(?:fly|go|zoom|take\s+me)\s+(?:to\s+)?(.+)$/i, /^(?:đi|tới|đến)\s+(.+)$/i],
    parse: (m) => ({ action: 'fly_to_location', args: { query: m[1].trim() } }),
  },
  {
    patterns: [/^(?:reset|home|globe|zoom\s*out|quay\s+về|toàn\s+cầu)$/i],
    parse: () => ({ action: 'zoom_to_globe', args: {} }),
  },
  // Layer toggles
  {
    patterns: [/^(?:turn\s+on|enable|show|bật|hiện)\s+(.+)$/i],
    parse: (m) => ({ action: 'set_layer_visibility', args: { layerId: normalizeLayerName(m[1]), enabled: true } }),
  },
  {
    patterns: [/^(?:turn\s+off|disable|hide|tắt|ẩn)\s+(.+)$/i],
    parse: (m) => ({ action: 'set_layer_visibility', args: { layerId: normalizeLayerName(m[1]), enabled: false } }),
  },
  // Visual style
  {
    patterns: [/^(?:switch\s+to|set|chuyển\s+sang)\s+(?:style\s+)?(.+)$/i],
    parse: (m) => {
      const style = normalizeStyleName(m[1]);
      return style ? { action: 'set_visual_style', args: { style } } : null;
    },
  },
  // HUD / Detection
  {
    patterns: [/^(?:show|toggle|bật)\s+(?:the\s+)?hud$/i],
    parse: () => ({ action: 'set_hud', args: { enabled: true } }),
  },
  {
    patterns: [/^(?:hide|tắt)\s+(?:the\s+)?hud$/i],
    parse: () => ({ action: 'set_hud', args: { enabled: false } }),
  },
  {
    patterns: [/^(?:show|toggle|bật)\s+(?:the\s+)?detection$/i],
    parse: () => ({ action: 'set_detection', args: { enabled: true } }),
  },
  {
    patterns: [/^(?:hide|tắt)\s+(?:the\s+)?detection$/i],
    parse: () => ({ action: 'set_detection', args: { enabled: false } }),
  },
  // Cockpit
  {
    patterns: [/^(?:enter|vào)\s+(?:the\s+)?cockpit$/i],
    parse: () => ({ action: 'control_cockpit', args: { action: 'enter' } }),
  },
  {
    patterns: [/^(?:exit|leave|thoát)\s+(?:the\s+)?cockpit$/i],
    parse: () => ({ action: 'control_cockpit', args: { action: 'exit' } }),
  },
  // Tracking
  {
    patterns: [/^(?:track|theo\s+dõi)\s+(.+)$/i],
    parse: (m) => ({ action: 'track_entity', args: { query: m[1].trim() } }),
  },
  {
    patterns: [/^(?:stop\s+tracking|bỏ\s+theo\s+dõi|dừng)$/i],
    parse: () => ({ action: 'stop_tracking', args: {} }),
  },
  // Zoom
  {
    patterns: [/^(?:zoom\s+in|phóng\s+to|lớn\s+hơn)$/i],
    parse: () => ({ action: 'adjust_camera_zoom', args: { direction: 'in', amount: 'medium' } }),
  },
  {
    patterns: [/^(?:zoom\s+out|thu\s+nhỏ|nhỏ\s+hơn)$/i],
    parse: () => ({ action: 'adjust_camera_zoom', args: { direction: 'out', amount: 'medium' } }),
  },
  // Map stack
  {
    patterns: [/^(?:switch\s+to|dùng)\s+(?:map\s+)?(?:osm|open\s*street\s*map)$/i],
    parse: () => ({ action: 'set_map_stack', args: { stackId: 'osm' } }),
  },
  {
    patterns: [/^(?:switch\s+to|dùng)\s+(?:google|3d|photoreal)/i],
    parse: () => ({ action: 'set_map_stack', args: { stackId: 'photoreal' } }),
  },
  {
    patterns: [/^(?:switch\s+to|dùng)\s+(?:esri|satellite|imagery)/i],
    parse: () => ({ action: 'set_map_stack', args: { stackId: 'esri-imagery' } }),
  },
];

function normalizeLayerName(spoken) {
  const key = spoken.toLowerCase().trim();
  return LAYER_NAME_MAP.get(key) || key.replace(/\s+/g, '-');
}

function normalizeStyleName(spoken) {
  const key = spoken.toLowerCase().trim();
  return STYLE_NAME_MAP.get(key) || null;
}

function matchCommand(transcript) {
  const text = transcript.trim();
  for (const { patterns, parse } of COMMAND_PATTERNS) {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return parse(m);
    }
  }
  return null;
}

// ── Controller ──────────────────────────────────────────────────────────────

/**
 * Lightweight voice controller using WebKit Speech Recognition.
 * Uses the same UI element IDs as GevRealtimeController so the existing
 * CSS and layout work without changes.
 */
export class WebKitVoiceFallback {
  constructor({ runner, ui }) {
    this.runner = runner;
    this.ui = ui;
    this.status = 'idle';
    this.recognition = null;
    this.buttonHandler = null;
    this.shortcutKeyDownHandler = null;
    this.shortcutKeyUpHandler = null;
  }

  isActive() {
    return this.status !== 'idle' && this.status !== 'error';
  }

  start() {
    if (this.isActive()) return;
    if (!SpeechRecognition) {
      this.setStatus('error', 'Speech recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    this.recognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.setStatus('listening', 'Listening...');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (interimTranscript) {
        this.ui.detail.textContent = interimTranscript;
      }

      if (finalTranscript) {
        this.setStatus('executing', `"${finalTranscript}"`);
        this._executeCommand(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') {
        this.setStatus('idle', 'No speech detected');
        return;
      }
      if (event.error === 'aborted') return;
      this.setStatus('error', `Speech error: ${event.error}`);
    };

    recognition.onend = () => {
      if (this.status === 'listening') {
        this.setStatus('idle', 'Voice off');
      }
    };

    try {
      recognition.start();
    } catch {
      this.setStatus('error', 'Could not start speech recognition');
    }
  }

  stop(options = {}) {
    const { removeUi = false } = options;
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* no-op */ }
      this.recognition = null;
    }
    this.setStatus('idle', 'Voice off');
    if (removeUi) {
      if (this.shortcutKeyDownHandler) {
        document.removeEventListener('keydown', this.shortcutKeyDownHandler);
        this.shortcutKeyDownHandler = null;
      }
      if (this.ui?.root) this.ui.root.remove();
    }
  }

  setStatus(status, detail) {
    this.status = status;
    this.ui.root.dataset.status = status;
    this.ui.status.textContent = status.toUpperCase();
    this.ui.detail.textContent = detail || '';
  }

  async _executeCommand(transcript) {
    const match = matchCommand(transcript);
    if (!match) {
      this.setStatus('listening', `Unknown: "${transcript}"`);
      this._scheduleRestart();
      return;
    }

    try {
      const result = await this.runner(match.action, match.args, {});
      const summary = result?.ok
        ? `${match.action}: OK`
        : `${match.action}: ${result?.error || 'failed'}`;
      this.setStatus('listening', summary);
    } catch (error) {
      this.setStatus('listening', `Error: ${error.message}`);
    }

    this._scheduleRestart();
  }

  _scheduleRestart() {
    setTimeout(() => {
      if (this.ui.root.dataset.status !== 'idle' && this.ui.root.dataset.status !== 'error') {
        this.start();
      }
    }, 1000);
  }

  bindKeyboardShortcut() {
    this.shortcutKeyDownHandler = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      if (this.isActive()) this.stop();
      else this.start();
    };
    document.addEventListener('keydown', this.shortcutKeyDownHandler);
  }

  destroy() {
    this.stop();
    if (this.shortcutKeyDownHandler) {
      document.removeEventListener('keydown', this.shortcutKeyDownHandler);
      this.shortcutKeyDownHandler = null;
    }
    if (this.ui?.root) this.ui.root.remove();
  }
}
