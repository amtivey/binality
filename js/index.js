var chart = null;
var monitor = null;
var program = null;

var currentProgram = 'programs/relaxation.xml';
var baseFreq = 440.0;

var timeStart = 0;
var timeContext = 0;
var timeMax = 0;
var maxFreq = 0.0;

var voicesData = [];
var hoverTime = null;

window.AudioContext = window.AudioContext || window.webkitAudioContext;

// Every AudioContext goes through createAudioContext() so onstatechange is always wired (see lifecycle block).
function createAudioContext() {
  var ctx = new AudioContext();
  ctx.onstatechange = onContextStateChange;
  return ctx;
}

var context = null;
var isAudioSupported = typeof window.AudioContext !== 'undefined';
try {
  if (isAudioSupported) {
    context = createAudioContext();
  }
} catch (e) {
  context = null;
}

var merger = [];
var gain = [];
var osc = [];

var entrainmentMode = 'binaural'; // 'binaural' (stereo headphones) or 'isochronic' (speakers & phones)
// Canvas backing-store scale: device pixel ratio capped at 2 to bound memory/fill cost on high-DPR phones.
function getCanvasDpr() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

var activeStageView = 'curve'; // 'curve' (Program Timeline) or 'waveform' (Live Waveform & FFR Scope)
var scopeMode = 'envelope'; // 'envelope', 'oscilloscope', 'orbit'
var scopeZoom = 'med'; // 'fast', 'med', 'slow'
var scopeChannels = { left: true, right: true, ffr: true };
var scopeAnimId = null;

var analyserSplitter = null;
var analyserLeft = null;
var analyserRight = null;
var timeDomainLeft = null;
var timeDomainRight = null;

var toneVolume = 0.35;
var toneMasterGain = null;
var isTimerFadingOut = false;

var ambientVolume = 0.20;
var lastNonZeroAmbientVolume = 0.20;
var ambientType = 'pink';
var pinkNoiseBuffer = null;
var noiseNode = null;
var noiseFilter = null;
var noiseGain = null;
var noiseLfo = null;
var noiseLfoGain = null;

var timerSetting = '0';
var timerDurationSec = 0;
var timerRemainingSec = 0;
// Audio-clock end schedule (context.currentTime seconds); null = not scheduled. UI derives remaining time from these.
var sleepEndAt = null;
var programEndAt = null;
var toneRampEndAt = 0;
var noiseRampEndAt = 0;
var toneRampStartAt = 0;
var noiseRampStartAt = 0;
var SLEEP_FADE_SEC = 10;
var PROGRAM_FADE_SEC = 3;
var sleepFadeSec = SLEEP_FADE_SEC; // fade length fixed when the end is scheduled (min of 10 s and half the remaining time)
var programFadeSec = PROGRAM_FADE_SEC;
var START_FADE_SEC = 3;
var STOP_FADE_SEC = 0.3;
var SEEK_FADE_SEC = 0.15; // gain fade-out across a seek restart while playing (MUX-IN-3)
var TAP_MAX_MOVE_PX = 10; // chart tap = moved less than this ...
var TAP_MAX_MS = 300; // ... and pressed for less than this (MUX-IN-2)
var TOUCH_TOOLTIP_LIFT_PX = 58; // touch tooltip sits at least this far above the finger (MUX-IN-1)
var TOAST_MS = 1500;
var seekRestartId = null;
var sliderHeld = false; // true while a finger/mouse holds the #slider thumb
var pendingStopId = null;
var ctxResumePending = false;
var interruptedInfo = null; // { at: Date.now(), reason } while UI state is 'interrupted'
var hiddenWatchId = null;
var lastPositionSavedAt = -1;
var pendingRestorePosition = null; // { program, position } from the previous session, applied by the first loadProgram
var chimeEnabled = true;
var timerCompletedStatus = null;

var breathMode = 'off';
var lastActiveBreathMode = 'box';
var breathCompact = false;
var breathAnimId = null;
var breathStartTime = 0;

var BREATH_PATTERNS = {
  box: {
    name: 'Box Breathing (4-4-4-4)',
    shortName: 'Box 4-4-4-4',
    steps: [
      { phase: 'Inhale', duration: 4.0, type: 'inhale', color: '#38bdf8' },
      { phase: 'Hold', duration: 4.0, type: 'hold-full', color: '#a855f7' },
      { phase: 'Exhale', duration: 4.0, type: 'exhale', color: '#ff70d9' },
      { phase: 'Rest', duration: 4.0, type: 'hold-empty', color: '#818cf8' }
    ]
  },
  '478': {
    name: '4-7-8 Pranayama',
    shortName: '4-7-8 Breath',
    steps: [
      { phase: 'Inhale', duration: 4.0, type: 'inhale', color: '#38bdf8' },
      { phase: 'Hold', duration: 7.0, type: 'hold-full', color: '#a855f7' },
      { phase: 'Exhale', duration: 8.0, type: 'exhale', color: '#ff70d9' }
    ]
  },
  coherent: {
    name: 'Coherent HRV (5.5-5.5)',
    shortName: 'Coherent 5.5s',
    steps: [
      { phase: 'Inhale', duration: 5.5, type: 'inhale', color: '#38bdf8' },
      { phase: 'Exhale', duration: 5.5, type: 'exhale', color: '#ff70d9' }
    ]
  },
  calm: {
    name: 'Calm Relax (4-2-6)',
    shortName: 'Calm 4-2-6',
    steps: [
      { phase: 'Inhale', duration: 4.0, type: 'inhale', color: '#38bdf8' },
      { phase: 'Hold', duration: 2.0, type: 'hold-full', color: '#a855f7' },
      { phase: 'Exhale', duration: 6.0, type: 'exhale', color: '#ff70d9' }
    ]
  }
};

var VOICE_COLORS = [
  { stroke: '#ff70d9', fillTop: 'rgba(255, 112, 217, 0.24)', fillBottom: 'rgba(255, 112, 217, 0.0)', name: 'Voice 1' },
  { stroke: '#38bdf8', fillTop: 'rgba(56, 189, 248, 0.20)', fillBottom: 'rgba(56, 189, 248, 0.0)', name: 'Voice 2' },
  { stroke: '#a855f7', fillTop: 'rgba(168, 85, 247, 0.20)', fillBottom: 'rgba(168, 85, 247, 0.0)', name: 'Voice 3' },
  { stroke: '#818cf8', fillTop: 'rgba(129, 140, 248, 0.18)', fillBottom: 'rgba(129, 140, 248, 0.0)', name: 'Voice 4' },
  { stroke: '#fb7185', fillTop: 'rgba(251, 113, 133, 0.18)', fillBottom: 'rgba(251, 113, 133, 0.0)', name: 'Voice 5' }
];

// Built-in XML programs embedded so Binality works both via direct file:// protocol and HTTP servers
var BUILTIN_PROGRAMS_XML = {
  'programs/astralprojection.xml':
    '<program name="Astral Projection" description="Aids in the practice of astral projection (40 minutes)">' +
    '<voice length="2400">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">10.0</frequency>' +
    '<frequency time="120">6.0</frequency>' +
    '<frequency time="180">4.0</frequency>' +
    '<frequency time="2220">4.0</frequency>' +
    '<frequency time="2280">6.0</frequency>' +
    '<frequency time="2340">10.0</frequency>' +
    '<frequency time="2400">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="2390">1.0</volume>' +
    '<volume time="2400">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/concentration.xml':
    '<program name="Concentration" description="Drifts from normal awakened state up to a peak of seventy hertz, then glides down to fifty hertz followed by a short drift back to normality (14 minutes)">' +
    '<voice length="840">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="120">70.0</frequency>' +
    '<frequency time="720">50.0</frequency>' +
    '<frequency time="840">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="830">1.0</volume>' +
    '<volume time="840">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/luciddreaming.xml':
    '<program name="Lucid Dreaming" description="Drift down into Theta state and then back up to Alpha to enhance awareness during dreaming (40 minutes)">' +
    '<voice length="2400">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="138">12.0</frequency>' +
    '<frequency time="180">8.0</frequency>' +
    '<frequency time="258">8.0</frequency>' +
    '<frequency time="300">5.0</frequency>' +
    '<frequency time="2100">5.0</frequency>' +
    '<frequency time="2160">7.5</frequency>' +
    '<frequency time="2280">7.5</frequency>' +
    '<frequency time="2400">10.0</frequency>' +
    '<volume time="0">1.0</volume>' +
    '<volume time="2370">1.0</volume>' +
    '<volume time="2400">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/meditation.xml':
    '<program name="Meditation" description="Drifts slowly down to 4Hz with spikes of 7Hz to aid wakefulness (60 minutes)">' +
    '<voice length="3600">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">8.0</frequency>' +
    '<frequency time="120">6.0</frequency>' +
    '<frequency time="180">5.0</frequency>' +
    '<frequency time="300">4.5</frequency>' +
    '<frequency time="480">4.0</frequency>' +
    '<frequency time="600">4.0</frequency>' +
    '<frequency time="605">7.0</frequency>' +
    '<frequency time="610">4.0</frequency>' +
    '<frequency time="1200">4.0</frequency>' +
    '<frequency time="1205">7.0</frequency>' +
    '<frequency time="1210">4.0</frequency>' +
    '<frequency time="1800">4.0</frequency>' +
    '<frequency time="1805">7.0</frequency>' +
    '<frequency time="1810">4.0</frequency>' +
    '<frequency time="2400">4.0</frequency>' +
    '<frequency time="2405">7.0</frequency>' +
    '<frequency time="2410">4.0</frequency>' +
    '<frequency time="3000">4.0</frequency>' +
    '<frequency time="3005">7.0</frequency>' +
    '<frequency time="3010">4.0</frequency>' +
    '<frequency time="3120">4.0</frequency>' +
    '<frequency time="3300">4.5</frequency>' +
    '<frequency time="3420">5.0</frequency>' +
    '<frequency time="3480">6.0</frequency>' +
    '<frequency time="3540">8.0</frequency>' +
    '<frequency time="3600">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="3590">1.0</volume>' +
    '<volume time="3600">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/oobe.xml':
    '<program name="Out of Body Experience" description="Induces a state in which out of body experiences may result (40 minutes)">' +
    '<voice length="2400">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">14.0</frequency>' +
    '<frequency time="120">16.0</frequency>' +
    '<frequency time="180">18.0</frequency>' +
    '<frequency time="240">20.0</frequency>' +
    '<frequency time="300">22.0</frequency>' +
    '<frequency time="2100">22.0</frequency>' +
    '<frequency time="2160">20.0</frequency>' +
    '<frequency time="2220">18.0</frequency>' +
    '<frequency time="2280">16.0</frequency>' +
    '<frequency time="2340">14.0</frequency>' +
    '<frequency time="2400">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="2390">1.0</volume>' +
    '<volume time="2400">0.0</volume>' +
    '</voice>' +
    '<voice length="2400">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">17.6</frequency>' +
    '<frequency time="120">23.2</frequency>' +
    '<frequency time="180">28.8</frequency>' +
    '<frequency time="240">34.4</frequency>' +
    '<frequency time="300">40.0</frequency>' +
    '<frequency time="2100">40.0</frequency>' +
    '<frequency time="2160">34.4</frequency>' +
    '<frequency time="2220">28.8</frequency>' +
    '<frequency time="2280">23.2</frequency>' +
    '<frequency time="2340">17.6</frequency>' +
    '<frequency time="2400">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="2390">1.0</volume>' +
    '<volume time="2400">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/painrelief.xml':
    '<program name="Pain Relief" description="Cycles between 0.5 and 1.5 Hertz to provide relief from pain (28 minutes)">' +
    '<voice length="1680">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="30">6.25</frequency>' +
    '<frequency time="60">3.375</frequency>' +
    '<frequency time="120">1.9375</frequency>' +
    '<frequency time="180">1.21875</frequency>' +
    '<frequency time="240">0.859375</frequency>' +
    '<frequency time="300">0.5</frequency>' +
    '<frequency time="600">1.5</frequency>' +
    '<frequency time="900">0.5</frequency>' +
    '<frequency time="1200">1.5</frequency>' +
    '<frequency time="1500">0.5</frequency>' +
    '<frequency time="1530">0.859375</frequency>' +
    '<frequency time="1560">1.21875</frequency>' +
    '<frequency time="1590">1.9375</frequency>' +
    '<frequency time="1620">3.375</frequency>' +
    '<frequency time="1650">6.25</frequency>' +
    '<frequency time="1680">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1670">1.0</volume>' +
    '<volume time="1680">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/relaxation.xml':
    '<program name="Relaxation" description="Mixed theta and delta waves aid relaxation and may induce sleep (60 minutes)">' +
    '<voice length="3600">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">7.85</frequency>' +
    '<frequency time="120">5.775</frequency>' +
    '<frequency time="180">4.7375</frequency>' +
    '<frequency time="240">4.21875</frequency>' +
    '<frequency time="300">3.959375</frequency>' +
    '<frequency time="360">3.7</frequency>' +
    '<frequency time="3600">3.7</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="3590">1.0</volume>' +
    '<volume time="3600">0.0</volume>' +
    '</voice>' +
    '<voice length="3600">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">7.25</frequency>' +
    '<frequency time="120">4.875</frequency>' +
    '<frequency time="180">3.6875</frequency>' +
    '<frequency time="240">3.09375</frequency>' +
    '<frequency time="300">2.796875</frequency>' +
    '<frequency time="360">2.5</frequency>' +
    '<frequency time="3600">2.5</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="3590">1.0</volume>' +
    '<volume time="3600">0.0</volume>' +
    '</voice>' +
    '<voice length="3600">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">8.95</frequency>' +
    '<frequency time="120">7.425</frequency>' +
    '<frequency time="180">6.6625</frequency>' +
    '<frequency time="240">6.28125</frequency>' +
    '<frequency time="300">6.090625</frequency>' +
    '<frequency time="360">5.9</frequency>' +
    '<frequency time="3600">5.9</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="3590">1.0</volume>' +
    '<volume time="3600">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/schumann.xml':
    '<program name="Schumann Resonance" description="The schumann resonance is derived from the atmospheric harmonics of our planet (20 minutes)">' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="300">7.83</frequency>' +
    '<frequency time="900">7.83</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="300">14.3</frequency>' +
    '<frequency time="900">14.3</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="300">20.8</frequency>' +
    '<frequency time="900">20.8</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="300">27.3</frequency>' +
    '<frequency time="900">27.3</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="300">33.8</frequency>' +
    '<frequency time="900">33.8</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/shamanicconsciousness.xml':
    '<program name="Shamanic Consciousness" description="Induces a meditative state similar to shamanic drumming or tibetan chanting (40 minutes)">' +
    '<voice length="2400">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="60">12.0</frequency>' +
    '<frequency time="120">8.0</frequency>' +
    '<frequency time="180">8.0</frequency>' +
    '<frequency time="240">4.0</frequency>' +
    '<frequency time="2220">4.0</frequency>' +
    '<frequency time="2280">8.0</frequency>' +
    '<frequency time="2340">8.0</frequency>' +
    '<frequency time="2400">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="2390">1.0</volume>' +
    '<volume time="2400">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/sleep.xml':
    '<program name="Sleep Induction" description="Helps with getting to sleep (60 minutes)">' +
    '<voice length="3600">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="30">10.0</frequency>' +
    '<frequency time="60">8.0</frequency>' +
    '<frequency time="240">6.0</frequency>' +
    '<frequency time="480">4.0</frequency>' +
    '<frequency time="840">3.0</frequency>' +
    '<frequency time="1200">2.0</frequency>' +
    '<frequency time="1560">1.5</frequency>' +
    '<frequency time="1920">2.0</frequency>' +
    '<frequency time="2280">1.5</frequency>' +
    '<frequency time="2640">2.0</frequency>' +
    '<frequency time="3000">1.5</frequency>' +
    '<frequency time="3360">2.0</frequency>' +
    '<frequency time="3600">1.5</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="3570">1.0</volume>' +
    '<volume time="3600">0.0</volume>' +
    '</voice>' +
    '</program>',

  'programs/universalhealing.xml':
    '<program name="Abrahams Universal Healing Rate" description="Helps with healing of injuries and relief from fatigue (20 minutes)">' +
    '<voice length="1200">' +
    '<frequency time="0">12.0</frequency>' +
    '<frequency time="30">6.75</frequency>' +
    '<frequency time="60">4.125</frequency>' +
    '<frequency time="120">2.8125</frequency>' +
    '<frequency time="180">2.15625</frequency>' +
    '<frequency time="240">1.828125</frequency>' +
    '<frequency time="300">1.5</frequency>' +
    '<frequency time="1030">1.5</frequency>' +
    '<frequency time="1060">1.828125</frequency>' +
    '<frequency time="1090">2.15625</frequency>' +
    '<frequency time="1120">2.8125</frequency>' +
    '<frequency time="1150">4.125</frequency>' +
    '<frequency time="1170">6.75</frequency>' +
    '<frequency time="1200">12.0</frequency>' +
    '<volume time="0">0.0</volume>' +
    '<volume time="10">1.0</volume>' +
    '<volume time="1190">1.0</volume>' +
    '<volume time="1200">0.0</volume>' +
    '</voice>' +
    '</program>'
};

function getTimeString(t) {
  var totalSec = Math.max(0, Math.floor(Number(t) || 0));
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = (totalSec % 3600) % 60;

  var str = '';
  if (h > 0) {
    str += h.toString() + ':';
  }
  if (m > 9) {
    str += m.toString() + ':';
  } else {
    if (h > 0) {
      str += '0';
    }
    str += m.toString() + ':';
  }
  if (s < 10) {
    str += '0';
  }
  str += s.toString();

  return str;
}

function getBandName(freq) {
  if (freq < 4.0) return 'Delta';
  if (freq < 8.0) return 'Theta';
  if (freq < 13.0) return 'Alpha';
  if (freq < 30.0) return 'Beta';
  return 'Gamma';
}

function getBrainwaveBand(freq) {
  if (freq < 4.0) return { name: 'Delta', color: '#818cf8' };
  if (freq < 8.0) return { name: 'Theta', color: '#a855f7' };
  if (freq < 13.0) return { name: 'Alpha', color: '#38bdf8' };
  if (freq < 30.0) return { name: 'Beta', color: '#ff70d9' };
  return { name: 'Gamma', color: '#fbbf24' };
}

function parseVoiceKeyframes(voiceNode, tagName) {
  var nodes = voiceNode.getElementsByTagName
    ? voiceNode.getElementsByTagName(tagName)
    : voiceNode.querySelectorAll(tagName);
  var points = [];
  for (var i = 0; i < nodes.length; ++i) {
    var t = parseFloat(nodes[i].getAttribute('time'));
    var val = parseFloat(nodes[i].textContent);
    if (!isNaN(t) && !isNaN(val)) {
      points.push({ time: t, value: val });
    }
  }
  points.sort(function (a, b) {
    return a.time - b.time;
  });
  return points;
}

function interpolateKeyframes(points, t, fallback) {
  if (!points || points.length === 0) return fallback;
  if (t <= points[0].time) return points[0].value;
  if (t >= points[points.length - 1].time) return points[points.length - 1].value;

  for (var i = 0; i < points.length - 1; ++i) {
    var t0 = points[i].time;
    var t1 = points[i + 1].time;
    if (t0 <= t && t <= t1) {
      if (t1 === t0) return points[i + 1].value;
      var d = (t - t0) / (t1 - t0);
      var v0 = points[i].value;
      var v1 = points[i + 1].value;
      return v0 + (v1 - v0) * d;
    }
  }
  return points[points.length - 1].value;
}

function getFrequency(v, t) {
  if (!v) return 0.0;
  var points = Array.isArray(v.frequencies)
    ? v.frequencies
    : parseVoiceKeyframes(v, 'frequency');
  return interpolateKeyframes(points, t, 0.0);
}

function getVolume(v, t) {
  if (!v) return 0.0;
  var points = Array.isArray(v.volumes)
    ? v.volumes
    : parseVoiceKeyframes(v, 'volume');
  return interpolateKeyframes(points, t, 1.0);
}

function updateSliderFill() {
  var slider = document.getElementById('slider');
  if (!slider) return;
  var min = parseFloat(slider.min) || 0;
  var max = parseFloat(slider.max) || 1;
  var val = parseFloat(slider.value) || 0;
  var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  pct = Math.max(0, Math.min(100, pct));
  slider.style.setProperty('--fill', pct.toFixed(2) + '%');
  setSliderValueText(slider);
}

function updateLiveReadouts(t) {
  updateCanvasLabelsSoon();
  var currentT = typeof t === 'number' ? t : parseInt(document.getElementById('slider').value, 10) || 0;
  var liveFreqBadge = document.getElementById('liveFreqBadge');
  var activeBandBadge = document.getElementById('activeBandBadge');
  var carrierBadge = document.getElementById('carrierBadge');

  if (carrierBadge) {
    carrierBadge.textContent = baseFreq + ' Hz Carrier';
  }

  if (voicesData.length > 0) {
    var primaryFreq = getFrequency(voicesData[0], currentT);
    var isIso = entrainmentMode === 'isochronic';

    if (liveFreqBadge) {
      var suffix = isIso ? ' Hz Pulse' : ' Hz Beat';
      if (voicesData.length === 1) {
        liveFreqBadge.textContent = primaryFreq.toFixed(2).replace(/\.00$/, '.0') + suffix;
      } else {
        var parts = [];
        for (var i = 0; i < Math.min(voicesData.length, 3); ++i) {
          parts.push(getFrequency(voicesData[i], currentT).toFixed(1) + ' Hz');
        }
        if (voicesData.length > 3) {
          parts.push('+' + (voicesData.length - 3) + ' more');
        }
        liveFreqBadge.textContent = parts.join(' • ') + (isIso ? ' (Pulse)' : '');
      }
    }

    if (activeBandBadge) {
      var bands = [];
      for (var j = 0; j < voicesData.length; ++j) {
        var b = getBandName(getFrequency(voicesData[j], currentT));
        if (bands.indexOf(b) === -1) bands.push(b);
      }
      activeBandBadge.textContent = bands.join(' / ') + ' Wave';
    }
  }

  var legendFreqNodes = document.querySelectorAll('[data-voice-freq]');
  for (var k = 0; k < legendFreqNodes.length; ++k) {
    var vIdx = parseInt(legendFreqNodes[k].getAttribute('data-voice-freq'), 10);
    if (voicesData[vIdx]) {
      var vf = getFrequency(voicesData[vIdx], currentT);
      legendFreqNodes[k].textContent = vf.toFixed(1) + ' Hz';
    }
  }
}

function renderLegend() {
  var legendContainer = document.getElementById('chartLegend');
  if (!legendContainer) return;

  var isIso = entrainmentMode === 'isochronic';

  if (activeStageView === 'waveform') {
    var htmlWave = '<div class="legend-voices">';
    htmlWave +=
      '<span class="legend-item">' +
      '<span class="legend-swatch" style="background:#38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>' +
      '<span>Left Ear / Speaker: <strong style="color:#fff;">' + baseFreq + ' Hz Carrier</strong></span>' +
      '</span>';

    htmlWave +=
      '<span class="legend-item">' +
      '<span class="legend-swatch" style="background:#ff70d9; box-shadow: 0 0 8px #ff70d9;"></span>' +
      '<span>Right Ear / Speaker: <strong style="color:#fff;">' + (isIso ? (baseFreq + ' Hz (In-Phase)') : (baseFreq + ' Hz + Beat')) + '</strong></span>' +
      '</span>';

    htmlWave +=
      '<span class="legend-item">' +
      '<span class="legend-swatch" style="background:#c084fc; box-shadow: 0 0 8px #c084fc;"></span>' +
      '<span>' + (isIso ? 'Pulse Modulation' : 'FFR Brainstem Sum') + ': <strong style="color:#fff;">' + (isIso ? 'Raised-Cosine Envelope' : 'Acoustic Beat Envelope') + '</strong></span>' +
      '</span>';
    htmlWave += '</div>';

    if (isIso) {
      htmlWave +=
        '<div class="legend-hint">Isochronic Scope: Displays the physical raised-cosine amplitude pulse train entering your ears/room at the program entrainment rate.</div>';
    } else {
      htmlWave +=
        '<div class="legend-hint">Frequency Following Response (FFR): Constant tones in Left &amp; Right ears interfere in the superior olivary complex to produce the neurological envelope shown above.</div>';
    }

    legendContainer.innerHTML = htmlWave;
    return;
  }

  var html = '<div class="legend-voices">';
  for (var i = 0; i < voicesData.length; ++i) {
    var color = VOICE_COLORS[i % VOICE_COLORS.length];
    var f0 = getFrequency(voicesData[i], parseInt(document.getElementById('slider').value, 10) || 0);
    var label = voicesData.length > 1 ? 'Voice ' + (i + 1) : (isIso ? 'Pulse Rate' : 'Beat Frequency');
    html +=
      '<span class="legend-item">' +
      '<span class="legend-swatch" style="background:' + color.stroke + '; box-shadow: 0 0 8px ' + color.stroke + ';"></span>' +
      '<span>' + label + ': <strong style="color:#fff;" data-voice-freq="' + i + '">' + f0.toFixed(1) + ' Hz</strong></span>' +
      '</span>';
  }
  html += '</div>';

  if (isIso) {
    html +=
      '<div class="legend-hint">Both Speakers/Ears: <strong style="color:#a5b4fc;">' +
      baseFreq +
      ' Hz Carrier</strong> • <strong style="color:#f9a8d4;">Rhythmic AM Pulses</strong> (Room speakers &amp; phones compatible)</div>';
  } else {
    html +=
      '<div class="legend-hint">Left Ear: <strong style="color:#a5b4fc;">' +
      baseFreq +
      ' Hz</strong> • Right Ear: <strong style="color:#f9a8d4;">' +
      baseFreq +
      ' Hz + Beat</strong> (Stereo headphones required)</div>';
  }

  legendContainer.innerHTML = html;
}

function createProgramChart() {
  var container = document.getElementById('chart');
  var canvas = document.getElementById('chartCanvas');
  var tooltip = document.getElementById('chartTooltip');
  if (!container || !canvas) return null;

  var ctx = canvas.getContext('2d');

  function getLayout(width, height) {
    var isCompact = width < 500;
    var padLeft = isCompact ? 34 : 48;
    var padRight = isCompact ? 14 : 24;
    var padTop = isCompact ? 12 : 22;
    var padBottom = isCompact ? 24 : 36;
    return {
      padLeft: padLeft,
      padRight: padRight,
      padTop: padTop,
      padBottom: padBottom,
      plotW: Math.max(10, width - padLeft - padRight),
      plotH: Math.max(10, height - padTop - padBottom)
    };
  }

  function replot() {
    var rect = container.getBoundingClientRect();
    var width = Math.floor(rect.width);
    var height = Math.floor(rect.height);
    if (width <= 0 || height <= 0) return;

    var dpr = getCanvasDpr();
    var pxW = Math.floor(width * dpr);
    var pxH = Math.floor(height * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 1. Deep Cosmic Background Gradient
    var bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, 'rgba(13, 8, 36, 0.96)');
    bgGrad.addColorStop(1, 'rgba(7, 3, 20, 0.99)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    var layout = getLayout(width, height);
    var plotW = layout.plotW;
    var plotH = layout.plotH;
    var padLeft = layout.padLeft;
    var padTop = layout.padTop;

    var yMax = maxFreq > 0 ? maxFreq * 1.25 : 15;
    var xMax = timeMax > 0 ? timeMax : 60;

    function toX(t) {
      return padLeft + (Math.max(0, Math.min(xMax, t)) / xMax) * plotW;
    }

    function toY(f) {
      return padTop + plotH - (Math.max(0, Math.min(yMax, f)) / yMax) * plotH;
    }

    // 2. Grid lines & Axis Ticks
    ctx.lineWidth = 1;
    ctx.font = '500 11px "JetBrains Mono", monospace';

    var yTickCount = height < 220 ? 4 : 5;
    var rawYStep = yMax / yTickCount;
    var yStep = rawYStep <= 2 ? 2 : rawYStep <= 5 ? 5 : rawYStep <= 10 ? 10 : Math.ceil(rawYStep / 5) * 5;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var yVal = 0; yVal <= yMax; yVal += yStep) {
      var py = toY(yVal);
      ctx.strokeStyle = yVal === 0 ? 'rgba(168, 85, 247, 0.28)' : 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.moveTo(padLeft, py);
      ctx.lineTo(padLeft + plotW, py);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(Math.round(yVal) + 'Hz', padLeft - 7, py);
    }

    var xTickCount = width < 480 ? 4 : 6;
    var xStep = Math.max(1, Math.round(xMax / xTickCount / 60) * 60);
    if (xMax < 120) {
      xStep = Math.max(1, Math.round(xMax / xTickCount));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var xVal = 0; xVal <= xMax; xVal += xStep) {
      var px = toX(xVal);
      ctx.strokeStyle = xVal === 0 ? 'rgba(168, 85, 247, 0.28)' : 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      ctx.moveTo(px, padTop);
      ctx.lineTo(px, padTop + plotH);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(xVal + 's', px, padTop + plotH + 4);
    }

    if (height >= 180) {
      ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
      ctx.font = '500 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('frequency/time(s)', padLeft + plotW / 2, height - 8);
    }

    // 3. Plot Voice Curves
    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, plotW, plotH);
    ctx.clip();

    for (var vIdx = voicesData.length - 1; vIdx >= 0; --vIdx) {
      var voice = voicesData[vIdx];
      var freqs = voice.frequencies;
      if (!freqs || freqs.length === 0) continue;

      var palette = VOICE_COLORS[vIdx % VOICE_COLORS.length];

      var areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      areaGrad.addColorStop(0, palette.fillTop);
      areaGrad.addColorStop(1, palette.fillBottom);

      ctx.beginPath();
      ctx.moveTo(toX(freqs[0].time), padTop + plotH);
      for (var i = 0; i < freqs.length; ++i) {
        ctx.lineTo(toX(freqs[i].time), toY(freqs[i].value));
      }
      ctx.lineTo(toX(freqs[freqs.length - 1].time), padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      for (var j = 0; j < freqs.length; ++j) {
        var cx = toX(freqs[j].time);
        var cy = toY(freqs[j].value);
        if (j === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = palette.stroke;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();

      for (var k = 0; k < freqs.length; ++k) {
        var kx = toX(freqs[k].time);
        var ky = toY(freqs[k].value);
        ctx.beginPath();
        ctx.arc(kx, ky, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = '#0a061c';
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = palette.stroke;
        ctx.stroke();
      }
    }

    // 4. Current Playback Position Playhead
    var sliderEl = document.getElementById('slider');
    var currentPos = sliderEl ? parseFloat(sliderEl.value) || 0 : 0;
    var playheadX = toX(currentPos);
    var isPlaying = isCurrentlyPlaying();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(playheadX, padTop);
    ctx.lineTo(playheadX, padTop + plotH);
    ctx.strokeStyle = isPlaying ? '#ff70d9' : 'rgba(255, 112, 217, 0.55)';
    ctx.lineWidth = isPlaying ? 2 : 1.5;
    if (!isPlaying) {
      ctx.setLineDash([4, 4]);
    }
    ctx.shadowColor = '#ff70d9';
    ctx.shadowBlur = isPlaying ? 12 : 4;
    ctx.stroke();
    ctx.restore();

    for (var m = 0; m < voicesData.length; ++m) {
      var vfNow = getFrequency(voicesData[m], currentPos);
      var pyNow = toY(vfNow);
      var vColor = VOICE_COLORS[m % VOICE_COLORS.length].stroke;

      ctx.save();
      ctx.beginPath();
      ctx.arc(playheadX, pyNow, isPlaying ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = vColor;
      ctx.shadowColor = vColor;
      ctx.shadowBlur = isPlaying ? 14 : 6;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    // 5. Interactive Hover Crosshair
    if (hoverTime !== null && hoverTime >= 0 && hoverTime <= xMax) {
      var hx = toX(hoverTime);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();

      for (var hIdx = 0; hIdx < voicesData.length; ++hIdx) {
        var hf = getFrequency(voicesData[hIdx], hoverTime);
        var hy = toY(hf);
        var hCol = VOICE_COLORS[hIdx % VOICE_COLORS.length].stroke;
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fillStyle = hCol;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
    }

    ctx.restore();
    ctx.restore();
  }

  function handlePointerMove(clientX, clientY, isTouch) {
    var rect = container.getBoundingClientRect();
    var x = clientX - rect.left;
    var y = clientY - rect.top;
    var layout = getLayout(rect.width, rect.height);

    if (
      x < layout.padLeft ||
      x > layout.padLeft + layout.plotW ||
      y < layout.padTop ||
      y > layout.padTop + layout.plotH ||
      timeMax <= 0
    ) {
      hoverTime = null;
      if (tooltip) tooltip.classList.add('hidden');
      replot();
      return;
    }

    var ratio = (x - layout.padLeft) / layout.plotW;
    hoverTime = Math.max(0, Math.min(timeMax, Math.round(ratio * timeMax)));

    if (tooltip && voicesData.length > 0) {
      var html =
        '<div class="tooltip-time">' +
        getTimeString(hoverTime) +
        ' <span style="color:#94a3b8;">(' +
        hoverTime +
        's)</span></div>';

      for (var i = 0; i < voicesData.length; ++i) {
        var f = getFrequency(voicesData[i], hoverTime);
        var c = VOICE_COLORS[i % VOICE_COLORS.length].stroke;
        var label = voicesData.length > 1 ? 'Voice ' + (i + 1) : (entrainmentMode === 'isochronic' ? 'Pulse' : 'Beat');
        html +=
          '<div class="tooltip-voice-row">' +
          '<span><span class="tooltip-dot" style="background:' +
          c +
          ';"></span>' +
          label +
          '</span>' +
          '<strong style="color:#fff;">' +
          f.toFixed(2) +
          ' Hz</strong>' +
          '</div>';
      }

      tooltip.innerHTML = html;
      tooltip.classList.remove('hidden');

      var tipRect = tooltip.getBoundingClientRect();
      var leftPos;
      var topPos;
      if (isTouch) {
        // Finger or pen (MUX-IN-1): keep the tooltip >= TOUCH_TOOLTIP_LIFT_PX from the touch point, inside the stage.
        // Try above, then beside (right/left), then below; if none fit, fall back to a one-line compact tooltip.
        var placeTouch = function (w, h, M, L) {
          var cy = Math.max(M, Math.min(rect.height - h - M, y - h / 2));
          var cx = Math.max(M, Math.min(rect.width - w - M, x - w / 2));
          var cands = [
            { l: cx, t: y - h - L },
            { l: x + L, t: cy },
            { l: x - w - L, t: cy },
            { l: cx, t: y + L }
          ];
          for (var k = 0; k < cands.length; ++k) {
            var c = cands[k];
            if (c.l >= M && c.t >= M && c.l + w <= rect.width - M && c.t + h <= rect.height - M) return c;
          }
          return null;
        };
        var pos = placeTouch(tipRect.width, tipRect.height, 8, TOUCH_TOOLTIP_LIFT_PX);
        if (!pos) {
          var parts = [];
          for (var j = 0; j < voicesData.length; ++j) parts.push(getFrequency(voicesData[j], hoverTime).toFixed(2));
          tooltip.innerHTML =
            '<div class="tooltip-time" style="margin:0;white-space:nowrap;">' +
            getTimeString(hoverTime) +
            ' &middot; ' +
            parts.join(' / ') +
            ' Hz</div>';
          tipRect = tooltip.getBoundingClientRect();
          pos = placeTouch(tipRect.width, tipRect.height, 0, TOUCH_TOOLTIP_LIFT_PX);
        }
        if (!pos) {
          // Tiny stage: the stage corner farthest from the finger.
          var best = -1;
          [2, rect.width - tipRect.width - 2].forEach(function (cl) {
            [2, rect.height - tipRect.height - 2].forEach(function (ct) {
              var ddx = Math.max(cl - x, 0, x - (cl + tipRect.width));
              var ddy = Math.max(ct - y, 0, y - (ct + tipRect.height));
              var dd = Math.hypot(ddx, ddy);
              if (dd > best) {
                best = dd;
                pos = { l: cl, t: ct };
              }
            });
          });
        }
        leftPos = pos.l;
        topPos = pos.t;
      } else {
        leftPos = x + 14;
        if (leftPos + tipRect.width > rect.width - 8) {
          leftPos = x - tipRect.width - 14;
        }
        topPos = Math.max(8, Math.min(rect.height - tipRect.height - 8, y - tipRect.height / 2));
      }
      tooltip.style.left = Math.max(8, leftPos) + 'px';
      tooltip.style.top = topPos + 'px';
    }

    replot();
  }

  // Pointer Events (MUX-IN-1/2): hover for mouse, press-and-drag scrub for touch/pen. A seek happens only on a
  // tap: moved < 10 px and (for touch/pen) pressed < 300 ms. Dragging never seeks. The canvas has touch-action: none.
  var press = null;

  function hideCursor() {
    hoverTime = null;
    if (tooltip) tooltip.classList.add('hidden');
    replot();
  }

  function secondAtClientX(clientX) {
    var rect = container.getBoundingClientRect();
    var x = clientX - rect.left;
    var layout = getLayout(rect.width, rect.height);
    if (x >= layout.padLeft && x <= layout.padLeft + layout.plotW && timeMax > 0) {
      var ratio = (x - layout.padLeft) / layout.plotW;
      return Math.max(0, Math.min(timeMax, Math.round(ratio * timeMax)));
    }
    return null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    press = { id: e.pointerId, type: e.pointerType, x: e.clientX, y: e.clientY, at: Date.now(), moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    handlePointerMove(e.clientX, e.clientY, e.pointerType !== 'mouse');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (press && press.id === e.pointerId) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= TAP_MAX_MOVE_PX) press.moved = true;
    } else if (press) {
      return;
    }
    handlePointerMove(e.clientX, e.clientY, e.pointerType !== 'mouse');
  });

  canvas.addEventListener('pointerup', function (e) {
    if (!press || press.id !== e.pointerId) return;
    var p = press;
    press = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
    var isTap = !p.moved && (p.type === 'mouse' || Date.now() - p.at < TAP_MAX_MS);
    if (isTap) {
      var seekSec = secondAtClientX(e.clientX);
      if (seekSec !== null) seekToSecond(seekSec, true);
    }
    if (p.type !== 'mouse') hideCursor();
  });

  canvas.addEventListener('pointercancel', function () {
    press = null;
    hideCursor();
  });

  canvas.addEventListener('pointerleave', function (e) {
    if (press || e.pointerType !== 'mouse') return;
    hideCursor();
  });

  return {
    replot: replot
  };
}

function ensureScopeAnalysers() {
  if (!context) return;
  try {
    if (!analyserLeft) {
      analyserLeft = context.createAnalyser();
      analyserLeft.fftSize = 2048;
      analyserLeft.smoothingTimeConstant = 0.25;
      timeDomainLeft = new Float32Array(analyserLeft.frequencyBinCount);
    }
    if (!analyserRight) {
      analyserRight = context.createAnalyser();
      analyserRight.fftSize = 2048;
      analyserRight.smoothingTimeConstant = 0.25;
      timeDomainRight = new Float32Array(analyserRight.frequencyBinCount);
    }
    if (!analyserSplitter) {
      analyserSplitter = context.createChannelSplitter(2);
      analyserSplitter.connect(analyserLeft, 0);
      analyserSplitter.connect(analyserRight, 1);
    }
  } catch (e) {}
}

function stopScopeAnimation() {
  if (scopeAnimId !== null) {
    cancelAnimationFrame(scopeAnimId);
    scopeAnimId = null;
  }
}

function startScopeAnimation() {
  stopScopeAnimation();
  var lastDraw = 0;
  function loop(ts) {
    // MUX-VIS-3: reduced motion redraws the scope as a static plot at 10 fps
    if (!prefersReducedMotion() || !ts || ts - lastDraw >= 100) {
      lastDraw = ts || 0;
      drawScopeFrame();
    }
    if (activeStageView === 'waveform' && isCurrentlyPlaying()) {
      scopeAnimId = requestAnimationFrame(loop);
    } else {
      scopeAnimId = null;
    }
  }
  scopeAnimId = requestAnimationFrame(loop);
}

function drawScopeFrame() {
  var canvas = document.getElementById('waveformCanvas');
  if (!canvas) return;
  var stage = document.getElementById('waveformStage');
  if (!stage) return;

  var rect = canvas.getBoundingClientRect();
  var width = Math.floor(rect.width);
  var height = Math.floor(rect.height);
  if (width <= 0 || height <= 0) {
    rect = stage.getBoundingClientRect();
    width = Math.floor(rect.width);
    height = Math.floor(rect.height);
  }
  if (width <= 0 || height <= 0) return;

  var dpr = getCanvasDpr();
  var pxW = Math.floor(width * dpr);
  var pxH = Math.floor(height * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }

  var ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Background deep cosmic gradient
  var bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#09051c');
  bg.addColorStop(0.5, '#060315');
  bg.addColorStop(1, '#04020e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  var isPlaying = isCurrentlyPlaying();
  var slider = document.getElementById('slider');
  var currentT = slider ? parseInt(slider.value, 10) || 0 : 0;
  var primaryFreq = voicesData.length > 0 ? getFrequency(voicesData[0], currentT) : 10.0;
  if (primaryFreq <= 0) primaryFreq = 10.0;
  var bandName = getBandName(primaryFreq);
  var cycleMs = 1000 / primaryFreq;
  var isIso = entrainmentMode === 'isochronic';

  // Update HUD elements
  var hudBeatVal = document.getElementById('hudBeatVal');
  var hudBandVal = document.getElementById('hudBandVal');
  var hudCarrierVal = document.getElementById('hudCarrierVal');
  var hudCycleVal = document.getElementById('hudCycleVal');
  var hudModeVal = document.getElementById('hudModeVal');
  var hudModeDot = document.getElementById('hudModeDot');
  var scopeFfrBtnLabel = document.getElementById('scopeFfrBtnLabel');

  if (hudBeatVal) hudBeatVal.textContent = primaryFreq.toFixed(1) + ' Hz';
  if (hudBandVal) hudBandVal.textContent = bandName;
  if (hudCarrierVal) hudCarrierVal.textContent = baseFreq + ' Hz';
  if (hudCycleVal) hudCycleVal.textContent = cycleMs.toFixed(1) + ' ms';
  if (hudModeVal) hudModeVal.textContent = isIso ? 'Speakers (Isochronic)' : 'Headphones (Binaural)';
  if (hudModeDot) {
    if (isPlaying) hudModeDot.classList.add('playing');
    else hudModeDot.classList.remove('playing');
  }
  if (scopeFfrBtnLabel) {
    scopeFfrBtnLabel.textContent = isIso ? 'Pulse Envelope' : 'FFR Envelope';
  }

  var isCompact = width <= 640;
  var hudReserve = isCompact ? 14 : 0;
  var effectiveHeight = height - hudReserve;
  var midY = effectiveHeight / 2;
  var nowSec = performance.now() * 0.001;

  if (scopeMode === 'orbit') {
    // -------------------------------------------------------------------------
    // SCOPE MODE: PHASE ORBIT / LISSAJOUS
    // -------------------------------------------------------------------------
    var cx = width / 2;
    var cy = effectiveHeight / 2;
    var maxR = Math.min(width, effectiveHeight) * (isCompact ? 0.33 : 0.38);

    // Draw Polar Radar Grids
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.14)';
    for (var rFrac = 0.25; rFrac <= 1.0; rFrac += 0.25) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * rFrac, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs & 45-degree in-phase / anti-phase lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(cx - maxR * 1.1, cy);
    ctx.lineTo(cx + maxR * 1.1, cy);
    ctx.moveTo(cx, cy - maxR * 1.1);
    ctx.lineTo(cx, cy + maxR * 1.1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx - maxR * 0.9, cy + maxR * 0.9);
    ctx.lineTo(cx + maxR * 0.9, cy - maxR * 0.9);
    ctx.stroke();

    // Axis Labels
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('Left Ear (X) →', cx + maxR * 1.1, cy - 6);

    ctx.fillStyle = '#ff70d9';
    ctx.textAlign = 'center';
    ctx.fillText('↑ Right Ear (Y)', cx, cy - maxR * 1.12);

    // Orbit trajectory
    var phaseOffset = isPlaying ? (nowSec * 2 * Math.PI * primaryFreq) % (Math.PI * 2) : 0;
    var pts = 180;
    var amp = isPlaying ? Math.min(1.0, Math.max(0.2, (toneVolume / 0.35) * 0.85)) : 0.65;
    var orbRadius = maxR * amp;

    if (isIso) {
      // In Isochronic mode: In-phase linear beam pulsing along 45 degree line
      var pulseMod = isPlaying ? 0.5 + 0.5 * Math.sin(phaseOffset) : 0.7;
      var beamLen = orbRadius * pulseMod;
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#c084fc';
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(cx - beamLen, cy + beamLen);
      ctx.lineTo(cx + beamLen, cy - beamLen);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx + beamLen, cy - beamLen, 5, 0, Math.PI * 2);
      ctx.arc(cx - beamLen, cy + beamLen, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(216, 180, 254, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText('In-Phase AM Vector (0.0° Interaural Phase • Pulse Rate: ' + primaryFreq.toFixed(1) + ' Hz)', cx, cy + maxR * 1.15);
    } else {
      // In Binaural mode: Rotating ellipse with angular velocity = beat frequency
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff70d9';
      ctx.shadowBlur = 12;

      var orbitGrad = ctx.createLinearGradient(cx - orbRadius, cy - orbRadius, cx + orbRadius, cy + orbRadius);
      orbitGrad.addColorStop(0, '#38bdf8');
      orbitGrad.addColorStop(0.5, '#c084fc');
      orbitGrad.addColorStop(1, '#ff70d9');
      ctx.strokeStyle = orbitGrad;

      ctx.beginPath();
      for (var p = 0; p <= pts; ++p) {
        var theta = (p / pts) * Math.PI * 2;
        var lx = Math.cos(theta);
        var ry = Math.cos(theta + phaseOffset);
        var px = cx + lx * orbRadius;
        var py = cy - ry * orbRadius;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Current Phase Pointer dot
      var curPx = cx + Math.cos(phaseOffset) * orbRadius;
      var curPy = cy - Math.cos(phaseOffset * 2) * orbRadius;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(curPx, curPy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(216, 180, 254, 0.7)';
      ctx.textAlign = 'center';
      var rotRpm = (primaryFreq * 60).toFixed(0);
      var orbitLabel = isCompact
        ? (primaryFreq.toFixed(1) + ' rev/s (' + rotRpm + ' RPM) • ' + bandName)
        : ('Interaural Phase Orbit: ' + primaryFreq.toFixed(1) + ' rev/sec (' + rotRpm + ' RPM) • ' + bandName + ' Wave');
      ctx.fillText(orbitLabel, cx, cy + maxR * 1.15);
    }

  } else if (scopeMode === 'oscilloscope') {
    // -------------------------------------------------------------------------
    // SCOPE MODE: DUAL OSCILLOSCOPE (HIGH-SPEED REAL-TIME TIME DOMAIN)
    // -------------------------------------------------------------------------
    var windowMs = scopeZoom === 'fast' ? 10 : scopeZoom === 'slow' ? 40 : 20;
    var effectiveAmp = isPlaying ? Math.min(1.0, Math.max(0.15, (toneVolume / 0.35) * 0.75)) : 0.6;
    var plotAmp = (effectiveHeight * (isCompact ? 0.32 : 0.36)) * effectiveAmp;

    // Draw horizontal zero line & amplitude guides
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.moveTo(0, midY - plotAmp);
    ctx.lineTo(width, midY - plotAmp);
    ctx.moveTo(0, midY + plotAmp);
    ctx.lineTo(width, midY + plotAmp);
    ctx.stroke();

    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText('+1.0', 10, midY - plotAmp - 4);
    ctx.fillText(' 0.0', 10, midY - 4);
    ctx.fillText('-1.0', 10, midY + plotAmp + 12);

    // If real analyser data is available and playing
    if (isPlaying && analyserLeft && timeDomainLeft && analyserRight && timeDomainRight) {
      analyserLeft.getFloatTimeDomainData(timeDomainLeft);
      analyserRight.getFloatTimeDomainData(timeDomainRight);
    }

    // Stabilizing trigger: find zero crossing
    var triggerIdx = 0;
    if (timeDomainLeft && isPlaying) {
      for (var tIdx = 0; tIdx < Math.min(512, timeDomainLeft.length - 1); ++tIdx) {
        if (timeDomainLeft[tIdx] <= 0 && timeDomainLeft[tIdx + 1] > 0) {
          triggerIdx = tIdx;
          break;
        }
      }
    }

    var totalPoints = Math.min(800, width);
    var carrierF = baseFreq;
    var beatF = primaryFreq;
    var deltaPhase = isPlaying ? (nowSec * 2 * Math.PI * beatF) : 0;

    // 1. Draw Left Channel (Cyan)
    if (scopeChannels.left) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (var i = 0; i < totalPoints; ++i) {
        var x = (i / (totalPoints - 1)) * width;
        var yVal = 0;
        if (isPlaying && timeDomainLeft) {
          var bufIdx = triggerIdx + Math.floor((i / totalPoints) * 512);
          if (bufIdx < timeDomainLeft.length) {
            yVal = timeDomainLeft[bufIdx] * plotAmp;
          }
        } else {
          var tRel = (i / totalPoints) * (windowMs * 0.001);
          yVal = Math.sin(2 * Math.PI * carrierF * tRel) * plotAmp;
        }
        var y = midY - yVal;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Right Channel (Pink)
    if (scopeChannels.right) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff70d9';
      ctx.shadowColor = '#ff70d9';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (var j = 0; j < totalPoints; ++j) {
        var xj = (j / (totalPoints - 1)) * width;
        var yValR = 0;
        if (isPlaying && timeDomainRight) {
          var bufIdxR = triggerIdx + Math.floor((j / totalPoints) * 512);
          if (bufIdxR < timeDomainRight.length) {
            yValR = timeDomainRight[bufIdxR] * plotAmp;
          }
        } else {
          var tRelR = (j / totalPoints) * (windowMs * 0.001);
          var fRight = isIso ? carrierF : (carrierF + beatF);
          var phaseR = isIso ? 0 : deltaPhase;
          yValR = Math.sin(2 * Math.PI * fRight * tRelR + phaseR) * plotAmp;
        }
        var yj = midY - yValR;
        if (j === 0) ctx.moveTo(xj, yj);
        else ctx.lineTo(xj, yj);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw FFR Neurological Sum (Violet)
    if (scopeChannels.ffr) {
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#e9d5ff';
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (var k = 0; k < totalPoints; ++k) {
        var xk = (k / (totalPoints - 1)) * width;
        var yValSum = 0;
        if (isPlaying && timeDomainLeft && timeDomainRight) {
          var bIdx = triggerIdx + Math.floor((k / totalPoints) * 512);
          if (bIdx < timeDomainLeft.length && bIdx < timeDomainRight.length) {
            yValSum = ((timeDomainLeft[bIdx] + timeDomainRight[bIdx]) * 0.5) * plotAmp;
          }
        } else {
          var tRelS = (k / totalPoints) * (windowMs * 0.001);
          var lVal = Math.sin(2 * Math.PI * carrierF * tRelS);
          var rVal = isIso
            ? Math.sin(2 * Math.PI * carrierF * tRelS)
            : Math.sin(2 * Math.PI * (carrierF + beatF) * tRelS + deltaPhase);
          yValSum = ((lVal + rVal) * 0.5) * plotAmp;
        }
        var yk = midY - yValSum;
        if (k === 0) ctx.moveTo(xk, yk);
        else ctx.lineTo(xk, yk);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Time window calibration badge (desktop only to prevent mobile HUD overlap)
    if (!isCompact) {
      ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
      ctx.textAlign = 'right';
      ctx.fillText('Window: ' + windowMs + ' ms • Carrier: ' + carrierF + ' Hz', width - 14, height - 14);
    }

  } else {
    // -------------------------------------------------------------------------
    // SCOPE MODE: FFR ENVELOPE (BEAT INTERFERENCE & ENVELOPE SHAPE)
    // -------------------------------------------------------------------------
    var spanMs = scopeZoom === 'fast' ? 150 : scopeZoom === 'slow' ? 700 : 350;
    var totalSpanSec = spanMs * 0.001;
    var maxEnvAmp = (effectiveHeight * (isCompact ? 0.32 : 0.36));
    var carrierFreq = baseFreq;
    var beatRate = primaryFreq;
    var envPhase = isPlaying ? (nowSec * 2 * Math.PI * beatRate) : 0;

    // Time Grid & Zero Axis
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();

    // Vertical time grid lines
    var gridStepMs = spanMs <= 200 ? 25 : spanMs <= 400 ? 50 : 100;
    var numSteps = Math.floor(spanMs / gridStepMs);
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';

    for (var s = -Math.floor(numSteps / 2); s <= Math.floor(numSteps / 2); ++s) {
      var gx = (width / 2) + (s * gridStepMs * 0.001 / totalSpanSec) * width;
      if (gx > 10 && gx < width - 10) {
        ctx.strokeStyle = s === 0 ? 'rgba(168, 85, 247, 0.35)' : 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
        var sign = s > 0 ? '+' : '';
        var timeLabelY = isCompact ? (midY + 13) : (height - 12);
        ctx.fillText(sign + (s * gridStepMs) + 'ms', gx, timeLabelY);
      }
    }

    var numX = Math.min(width, 700);

    // 1. Draw High-Density Carrier Wave within the Envelope
    if (scopeChannels.ffr) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.32)';
      ctx.beginPath();
      for (var px = 0; px < numX; ++px) {
        var xPos = (px / (numX - 1)) * width;
        var tRelE = (px / (numX - 1) - 0.5) * totalSpanSec;
        var envVal = 0;
        if (isIso) {
          envVal = 0.5 + 0.5 * Math.cos(2 * Math.PI * beatRate * tRelE + envPhase);
        } else {
          envVal = Math.abs(Math.cos(Math.PI * beatRate * tRelE + envPhase * 0.5));
        }
        var cWave = Math.sin(2 * Math.PI * carrierFreq * tRelE * 0.5 + (nowSec * 15)) * envVal * maxEnvAmp;
        var yPos = midY - cWave;
        if (px === 0) ctx.moveTo(xPos, yPos);
        else ctx.lineTo(xPos, yPos);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Draw Upper & Lower FFR Envelope Lines
    if (scopeChannels.ffr) {
      ctx.save();
      ctx.lineWidth = 2.5;
      var envGrad = ctx.createLinearGradient(0, 0, width, 0);
      envGrad.addColorStop(0, '#ff70d9');
      envGrad.addColorStop(0.5, '#c084fc');
      envGrad.addColorStop(1, '#38bdf8');
      ctx.strokeStyle = envGrad;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 10;

      // Upper Envelope
      ctx.beginPath();
      for (var ux = 0; ux < numX; ++ux) {
        var uXPos = (ux / (numX - 1)) * width;
        var utRel = (ux / (numX - 1) - 0.5) * totalSpanSec;
        var uEnv = isIso
          ? (0.5 + 0.5 * Math.cos(2 * Math.PI * beatRate * utRel + envPhase)) * maxEnvAmp
          : Math.abs(Math.cos(Math.PI * beatRate * utRel + envPhase * 0.5)) * maxEnvAmp;
        var uy = midY - uEnv;
        if (ux === 0) ctx.moveTo(uXPos, uy);
        else ctx.lineTo(uXPos, uy);
      }
      ctx.stroke();

      // Lower Envelope
      ctx.beginPath();
      for (var lx = 0; lx < numX; ++lx) {
        var lXPos = (lx / (numX - 1)) * width;
        var ltRel = (lx / (numX - 1) - 0.5) * totalSpanSec;
        var lEnv = isIso
          ? (0.5 + 0.5 * Math.cos(2 * Math.PI * beatRate * ltRel + envPhase)) * maxEnvAmp
          : Math.abs(Math.cos(Math.PI * beatRate * ltRel + envPhase * 0.5)) * maxEnvAmp;
        var ly = midY + (isIso ? 0 : lEnv);
        if (lx === 0) ctx.moveTo(lXPos, ly);
        else ctx.lineTo(lXPos, ly);
      }
      ctx.stroke();
      ctx.restore();

      // Wavelength Calipers / Dimension Marker
      var lambdaSec = 1 / beatRate;
      var lambdaPix = (lambdaSec / totalSpanSec) * width;
      if (lambdaPix > 40 && lambdaPix < width * 0.9) {
        var calX1 = (width - lambdaPix) / 2;
        var calX2 = calX1 + lambdaPix;
        var calY = midY - maxEnvAmp - (isCompact ? 14 : 18);

        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#f472b6';
        ctx.beginPath();
        ctx.moveTo(calX1, calY);
        ctx.lineTo(calX2, calY);
        ctx.moveTo(calX1, calY - 4);
        ctx.lineTo(calX1, calY + 4);
        ctx.moveTo(calX2, calY - 4);
        ctx.lineTo(calX2, calY + 4);
        ctx.stroke();

        ctx.fillStyle = '#f472b6';
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('λ = ' + cycleMs.toFixed(1) + 'ms (' + beatRate.toFixed(1) + ' Hz ' + bandName + ' Entrainment)', (calX1 + calX2) / 2, calY - 6);
        ctx.restore();
      }
    }
  }

  ctx.restore();
}

function setStageView(view) {
  var v = view === 'waveform' ? 'waveform' : 'curve';
  activeStageView = v;

  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('stageView', activeStageView);
    }
  } catch (e) {}

  var btnCurve = document.getElementById('btnViewCurve');
  var btnWaveform = document.getElementById('btnViewWaveform');
  var chartCanvas = document.getElementById('chartCanvas');
  var waveformStage = document.getElementById('waveformStage');
  var tooltip = document.getElementById('chartTooltip');

  if (btnCurve) {
    if (v === 'curve') btnCurve.classList.add('active');
    else btnCurve.classList.remove('active');
  }
  if (btnWaveform) {
    if (v === 'waveform') btnWaveform.classList.add('active');
    else btnWaveform.classList.remove('active');
  }

  if (v === 'curve') {
    if (waveformStage) waveformStage.classList.add('hidden');
    if (chartCanvas) chartCanvas.style.display = 'block';
    stopScopeAnimation();
    if (chart && typeof chart.replot === 'function') {
      chart.replot();
    }
  } else {
    if (chartCanvas) chartCanvas.style.display = 'none';
    if (tooltip) tooltip.classList.add('hidden');
    if (waveformStage) waveformStage.classList.remove('hidden');
    var scopeIdleOverlay = document.getElementById('scopeIdleOverlay');
    if (scopeIdleOverlay) {
      if (isCurrentlyPlaying()) scopeIdleOverlay.classList.add('hidden');
      else scopeIdleOverlay.classList.remove('hidden');
    }
    drawScopeFrame();
    if (isCurrentlyPlaying()) {
      startScopeAnimation();
    }
  }

  renderLegend();
}

function setScopeMode(mode) {
  if (mode !== 'envelope' && mode !== 'oscilloscope' && mode !== 'orbit') mode = 'envelope';
  scopeMode = mode;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('scopeMode', scopeMode);
    }
  } catch (e) {}

  var btns = document.querySelectorAll('.scope-mode-btn');
  for (var i = 0; i < btns.length; ++i) {
    var sm = btns[i].getAttribute('data-scope');
    if (sm === scopeMode) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }

  drawScopeFrame();
}

function setScopeZoom(zoom) {
  if (zoom !== 'fast' && zoom !== 'med' && zoom !== 'slow') zoom = 'med';
  scopeZoom = zoom;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('scopeZoom', scopeZoom);
    }
  } catch (e) {}

  var btns = document.querySelectorAll('.scope-zoom-btn');
  for (var i = 0; i < btns.length; ++i) {
    var z = btns[i].getAttribute('data-zoom');
    if (z === scopeZoom) btns[i].classList.add('active');
    else btns[i].classList.remove('active');
  }

  drawScopeFrame();
}

function toggleScopeChannel(ch) {
  if (scopeChannels[ch] !== undefined) {
    scopeChannels[ch] = !scopeChannels[ch];
  }
  var btn = document.querySelector('.scope-ch-btn[data-channel="' + ch + '"]');
  if (btn) {
    if (scopeChannels[ch]) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  drawScopeFrame();
}

function clientResize() {
  if (chart !== null && typeof chart.replot === 'function') {
    chart.replot();
  }
  if (activeStageView === 'waveform') {
    drawScopeFrame();
  }
}

function isCurrentlyPlaying() {
  var startBtn = document.getElementById('start');
  return startBtn ? startBtn.getAttribute('data-playing') === 'true' : false;
}

function setPlayingUI(playing, interrupted) {
  var startBtn = document.getElementById('start');
  var audioStatus = document.getElementById('audioStatus');
  var uiState = playing ? 'playing' : interrupted ? 'interrupted' : 'idle';

  if (startBtn) {
    startBtn.textContent = playing ? 'stop' : 'start';
    startBtn.setAttribute('data-playing', playing ? 'true' : 'false');
    startBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    startBtn.setAttribute('aria-label', playing ? 'Stop session' : 'Start session');
    startBtn.setAttribute('data-state', uiState);
    if (playing) {
      startBtn.classList.add('is-playing');
    } else {
      startBtn.classList.remove('is-playing');
    }
  }

  if (audioStatus) {
    var statusText = audioStatus.querySelector('.status-text');
    audioStatus.setAttribute('data-state', uiState);
    if (interrupted) {
      audioStatus.classList.add('interrupted');
    } else {
      audioStatus.classList.remove('interrupted');
    }
    if (playing) {
      audioStatus.classList.add('playing');
      if (statusText) {
        statusText.textContent = entrainmentMode === 'isochronic' ? 'Pulsing Isochronic Tones' : 'Synthesizing Stereo Audio';
      }
    } else {
      audioStatus.classList.remove('playing');
      if (statusText) statusText.textContent = interrupted ? 'Interrupted' : 'Idle';
    }
  }

  var scopeIdleOverlay = document.getElementById('scopeIdleOverlay');
  if (scopeIdleOverlay) {
    if (playing) {
      scopeIdleOverlay.classList.add('hidden');
    } else {
      scopeIdleOverlay.classList.remove('hidden');
    }
  }
  var hudModeDot = document.getElementById('hudModeDot');
  if (hudModeDot) {
    if (playing) {
      hudModeDot.classList.add('playing');
    } else {
      hudModeDot.classList.remove('playing');
    }
  }

  if (activeStageView === 'waveform') {
    if (playing) {
      if (!document.hidden) startScopeAnimation();
    } else {
      drawScopeFrame();
      stopScopeAnimation();
    }
  }
}

function loadProgram(xml) {
  stop();

  if (!xml) return;
  var progNode = null;
  if (xml.getElementsByTagName) {
    var progs = xml.getElementsByTagName('program');
    if (progs && progs.length > 0) {
      progNode = progs[0];
    }
  }
  if (!progNode && xml.querySelector) {
    progNode = xml.querySelector('program');
  }
  if (!progNode && xml.nodeName && xml.nodeName.toLowerCase() === 'program') {
    progNode = xml;
  }
  if (!progNode) return;

  program = progNode;

  var progName = program.getAttribute('name') || 'Custom Program';
  var progDesc = program.getAttribute('description') || '';

  var titleEl = document.getElementById('title');
  var nameEl = document.getElementById('name');
  var descEl = document.getElementById('description');
  var chartDescEl = document.getElementById('chartDescription');

  if (titleEl) {
    titleEl.textContent = progName;
    titleEl.setAttribute('aria-label', progName + '. Choose a program');
  }
  if (nameEl) nameEl.textContent = progName;
  if (descEl) descEl.textContent = progDesc;
  if (chartDescEl) {
    chartDescEl.textContent = progDesc;
    chartDescEl.title = progDesc ? (progDesc + ' (Click to expand/collapse)') : '';
  }

  timeMax = 0;
  maxFreq = 0.0;
  voicesData = [];

  var voiceNodes = program.getElementsByTagName
    ? program.getElementsByTagName('voice')
    : program.querySelectorAll('voice');

  for (var i = 0; i < voiceNodes.length; ++i) {
    var freqs = parseVoiceKeyframes(voiceNodes[i], 'frequency');
    var vols = parseVoiceKeyframes(voiceNodes[i], 'volume');

    for (var j = 0; j < freqs.length; ++j) {
      if (freqs[j].value > maxFreq) maxFreq = freqs[j].value;
      if (freqs[j].time > timeMax) timeMax = Math.round(freqs[j].time);
    }
    for (var k = 0; k < vols.length; ++k) {
      if (vols[k].time > timeMax) timeMax = Math.round(vols[k].time);
    }

    voicesData.push({
      node: voiceNodes[i],
      frequencies: freqs,
      volumes: vols
    });
  }

  var voiceCountBadge = document.getElementById('voiceCountBadge');
  if (voiceCountBadge) {
    voiceCountBadge.textContent = voicesData.length + (voicesData.length === 1 ? ' Voice' : ' Voices');
  }

  var settingsStats = document.getElementById('settingsProgramStats');
  if (settingsStats) {
    var mins = Math.round(timeMax / 60);
    var peakStr = maxFreq > 0 ? ' • Peak ' + maxFreq + ' Hz' : '';
    settingsStats.textContent =
      mins + ' min • ' + voicesData.length + (voicesData.length === 1 ? ' voice' : ' voices') + peakStr;
  }

  var durationEl = document.getElementById('divDuration');
  if (durationEl) {
    durationEl.textContent = getTimeString(timeMax);
  }

  var restoredPos = 0;
  if (pendingRestorePosition) {
    if (pendingRestorePosition.program === currentProgram && pendingRestorePosition.position > 0 && pendingRestorePosition.position < timeMax) {
      restoredPos = Math.floor(pendingRestorePosition.position);
    }
    pendingRestorePosition = null; // only the first program load of a session restores
  }

  var slider = document.getElementById('slider');
  if (slider) {
    slider.setAttribute('max', timeMax);
    slider.value = restoredPos;
  }

  timeStart = restoredPos;
  var posEl = document.getElementById('divPosition');
  if (posEl) {
    posEl.textContent = getTimeString(restoredPos);
  }
  savePosition(restoredPos);

  updateSliderFill();
  updateLiveReadouts(restoredPos);
  renderLegend();

  if (!chart) {
    chart = createProgramChart();
  }
  if (chart) {
    chart.replot();
  }
}

function applyProgramXmlText(filename, xmlText) {
  var parser = new DOMParser();
  var xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  currentProgram = filename;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('currentProgram', filename);
    }
  } catch (e) {}
  var selectProgram = document.getElementById('selectProgram');
  if (selectProgram && selectProgram.value !== filename) {
    selectProgram.value = filename;
  }
  loadProgram(xmlDoc);
}

function clearUrlPresetHash() {
  try {
    if (window.location.hash && window.location.hash.indexOf('#preset=') === 0) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else {
        window.location.hash = '';
      }
    }
  } catch (e) {}
}

function isPageReload() {
  try {
    if (window.performance && typeof window.performance.getEntriesByType === 'function') {
      var navEntries = window.performance.getEntriesByType('navigation');
      if (navEntries && navEntries.length > 0) {
        return navEntries[0].type === 'reload';
      }
    }
    if (window.performance && window.performance.navigation) {
      return window.performance.navigation.type === 1;
    }
  } catch (e) {}
  return false;
}

function changeProgram(filename) {
  clearUrlPresetHash();

  if (typeof filename === 'string' && filename.indexOf('saved:') === 0) {
    var presetId = filename.substring(6);
    var saved = findSavedPresetById(presetId);
    if (saved && saved.xml) {
      if (saved.carrierFreq) {
        applyBaseFrequency(saved.carrierFreq);
      }
      applyProgramXmlText(filename, saved.xml);
      return;
    }
    filename = 'programs/relaxation.xml';
    try {
      if (typeof Storage !== 'undefined') {
        localStorage.setItem('currentProgram', filename);
      }
    } catch (e) {}
  }

  // If running under file:// protocol, fetch() is blocked by browser CORS; use built-in XML directly
  if (window.location.protocol === 'file:' && BUILTIN_PROGRAMS_XML[filename]) {
    applyProgramXmlText(filename, BUILTIN_PROGRAMS_XML[filename]);
    return;
  }

  fetch(filename)
    .then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load program XML: ' + filename);
      }
      return response.text();
    })
    .then(function (xmlText) {
      applyProgramXmlText(filename, xmlText);
    })
    .catch(function (err) {
      if (BUILTIN_PROGRAMS_XML[filename]) {
        applyProgramXmlText(filename, BUILTIN_PROGRAMS_XML[filename]);
      } else {
        console.error(err);
      }
    });
}

function start(preserveTimer, fullFade) {
  if (!context && isAudioSupported) {
    try {
      context = createAudioContext();
    } catch (e) {}
  }
  if (!context || !program) return;

  cancelPendingStop();
  interruptedInfo = null;
  // Always request resume: a preceding stop() may have a suspend() still in flight (state still reads 'running').
  ctxResumePending = true;
  var resumeResult = null;
  try {
    resumeResult = context.resume();
  } catch (e) {}
  var resumeSettled = function () {
    ctxResumePending = false;
    if (isCurrentlyPlaying() && context && context.state !== 'running') {
      enterInterrupted('resume-failed');
    }
  };
  if (resumeResult && typeof resumeResult.then === 'function') {
    resumeResult.then(resumeSettled, resumeSettled);
  } else {
    ctxResumePending = false;
  }

  cleanupAudioNodes();
  setPlayingUI(true);
  timerCompletedStatus = null;

  merger = [];
  gain = [];
  osc = [];

  var slider = document.getElementById('slider');
  timeStart = slider ? parseInt(slider.value, 10) || 0 : 0;
  timeContext = context.currentTime;

  toneMasterGain = context.createGain();
  // Gain ramps 0 -> target over START_FADE_SEC; scheduleAudioEnd() below builds the ramp (and any end fade).
  toneMasterGain.gain.setValueAtTime(0, timeContext);
  toneRampStartAt = timeContext;
  toneRampEndAt = timeContext + (preserveTimer === true && !fullFade ? 0.8 : START_FADE_SEC);
  toneMasterGain.connect(context.destination);
  ensureScopeAnalysers();
  if (analyserSplitter) {
    try {
      toneMasterGain.connect(analyserSplitter);
    } catch (e) {}
  }

  var voices = program.getElementsByTagName
    ? program.getElementsByTagName('voice')
    : program.querySelectorAll('voice');

  var numVoices = Math.max(1, voices.length);

  if (entrainmentMode === 'isochronic') {
    // Isochronic Tones Mode (Speaker & Mobile Friendly):
    // Rhythmic amplitude modulation (raised-cosine AM pulses) of a carrier tone at baseFreq.
    // Audio is routed in-phase to both Left & Right channels, creating brainwave entrainment
    // through room speakers, soundbars, laptop speakers, phone speakers, and headphones alike.
    var scaleIso = 1 / Math.sqrt(numVoices);

    for (var i = 0; i < voices.length; ++i) {
      merger[i] = context.createChannelMerger(2);

      var carrier = context.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(baseFreq, timeContext);

      var pulseLfo = context.createOscillator();
      pulseLfo.type = 'sine';

      // Raised-cosine pulse shaping:
      // pulseGain baseline = 0.5; lfoGain = 0.5.
      // Net pulseGain.gain = 0.5 + 0.5 * sine = 0.0 to 1.0 (smooth, zero clicks/pops).
      var lfoGain = context.createGain();
      lfoGain.gain.setValueAtTime(0.5, timeContext);

      var pulseGain = context.createGain();
      pulseGain.gain.setValueAtTime(0.5, timeContext);

      var voiceGain = context.createGain();

      pulseLfo.connect(lfoGain);
      lfoGain.connect(pulseGain.gain);

      carrier.connect(pulseGain);
      pulseGain.connect(voiceGain);

      // Route in-phase identical audio to both Left and Right channels:
      voiceGain.connect(merger[i], 0, 0); // Left channel
      voiceGain.connect(merger[i], 0, 1); // Right channel

      var initialBeat = getFrequency(voices[i], timeStart);
      var initialVol = getVolume(voices[i], timeStart);

      pulseLfo.frequency.setValueAtTime(Math.max(0.05, initialBeat), timeContext);
      voiceGain.gain.setValueAtTime(initialVol * scaleIso, timeContext);

      // Dynamic frequency ramping on the pulse LFO across keyframes:
      var frequencies = parseVoiceKeyframes(voices[i], 'frequency');
      for (var j = 0; j < frequencies.length; ++j) {
        var tf = frequencies[j].time;
        if (tf > timeStart) {
          var f = frequencies[j].value;
          pulseLfo.frequency.exponentialRampToValueAtTime(
            Math.max(0.05, f),
            timeContext + (tf - timeStart)
          );
        }
      }

      // Dynamic volume ramping on voiceGain across keyframes:
      var volumes = parseVoiceKeyframes(voices[i], 'volume');
      for (var k = 0; k < volumes.length; ++k) {
        var tv = volumes[k].time;
        if (tv > timeStart) {
          var v = volumes[k].value;
          voiceGain.gain.linearRampToValueAtTime(v * scaleIso, timeContext + (tv - timeStart));
        }
      }

      merger[i].connect(toneMasterGain);

      osc[i] = {
        carrier: carrier,
        lfo: pulseLfo,
        lfoGain: lfoGain,
        pulseGain: pulseGain,
        voiceGain: voiceGain
      };
    }
  } else {
    // Equal-power Left/Right summing normalization:
    // In the Left ear, all N voices share identical baseFreq and add coherently (scale = 1/N).
    // In the Right ear, N distinct beat frequencies add incoherently (scale = 1/sqrt(N)).
    // This achieves perfect 0.00 dB interaural energy balance, prevents Left-ear dominance,
    // and prevents multi-voice programs (Relaxation, Schumann) from clipping or masking subtle voices.
    var scaleLeft = 1 / numVoices;
    var scaleRight = 1 / Math.sqrt(numVoices);

    for (var i = 0; i < voices.length; ++i) {
      merger[i] = context.createChannelMerger(2);
      osc[i] = {
        left: context.createOscillator(),
        right: context.createOscillator()
      };
      gain[i] = {
        left: context.createGain(),
        right: context.createGain()
      };

      osc[i].left.type = 'sine';
      osc[i].right.type = 'sine';

      osc[i].left.connect(gain[i].left);
      osc[i].right.connect(gain[i].right);
      gain[i].left.connect(merger[i], 0, 0);
      gain[i].right.connect(merger[i], 0, 1);

      var initialBeat = getFrequency(voices[i], timeStart);
      var initialVol = getVolume(voices[i], timeStart);

      osc[i].left.frequency.setValueAtTime(baseFreq, timeContext);
      osc[i].right.frequency.setValueAtTime(Math.max(1, baseFreq + initialBeat), timeContext);

      gain[i].left.gain.setValueAtTime(initialVol * scaleLeft, timeContext);
      gain[i].right.gain.setValueAtTime(initialVol * scaleRight, timeContext);

      var frequencies = parseVoiceKeyframes(voices[i], 'frequency');
      for (var j = 0; j < frequencies.length; ++j) {
        var tf = frequencies[j].time;
        if (tf > timeStart) {
          var f = frequencies[j].value;
          osc[i].right.frequency.exponentialRampToValueAtTime(
            Math.max(1, baseFreq + f),
            timeContext + (tf - timeStart)
          );
        }
      }

      var volumes = parseVoiceKeyframes(voices[i], 'volume');
      for (var k = 0; k < volumes.length; ++k) {
        var tv = volumes[k].time;
        if (tv > timeStart) {
          var v = volumes[k].value;
          gain[i].left.gain.linearRampToValueAtTime(v * scaleLeft, timeContext + (tv - timeStart));
          gain[i].right.gain.linearRampToValueAtTime(v * scaleRight, timeContext + (tv - timeStart));
        }
      }

      merger[i].connect(toneMasterGain);
    }
  }

  for (var m = 0; m < osc.length; ++m) {
    if (osc[m].carrier && osc[m].lfo) {
      osc[m].carrier.start(0);
      osc[m].lfo.start(0);
    } else if (osc[m].left && osc[m].right) {
      osc[m].left.start(0);
      osc[m].right.start(0);
    }
  }

  startAmbientNoise(preserveTimer === true && !fullFade ? 0.8 : START_FADE_SEC);

  // Program end is on the audio clock: fade + osc.stop at timeMax (see scheduleAudioEnd).
  programEndAt = timeContext + Math.max(0, timeMax - timeStart);
  programFadeSec = Math.min(PROGRAM_FADE_SEC, Math.max(0, timeMax - timeStart) / 2);

  if (timerDurationSec > 0) {
    startSleepTimer(preserveTimer);
  } else {
    scheduleAudioEnd();
    syncTimerUI();
  }

  if (chart) chart.replot();
  if (activeStageView === 'waveform' && !document.hidden) {
    startScopeAnimation();
  }

  if (document.hidden) {
    armHiddenWatch();
  } else {
    startMonitor();
  }
}

// Position/timer/end-of-session UI driver. Everything here is derived from context.currentTime; the interval only
// decides how often we paint, so throttling it (background tabs) cannot move the end of the session.
function startMonitor() {
  if (monitor !== null) clearInterval(monitor);
  monitor = setInterval(monitorTick, 250);
}

function stopMonitor() {
  if (monitor !== null) {
    clearInterval(monitor);
    monitor = null;
  }
}

function getCurrentPositionSec() {
  var slider = document.getElementById('slider');
  if (context && isCurrentlyPlaying()) {
    var t = parseInt(timeStart, 10) + Math.floor(Math.max(0, context.currentTime - timeContext));
    return Math.max(0, Math.min(timeMax, t));
  }
  return slider ? parseInt(slider.value, 10) || 0 : timeStart;
}

// Seconds of sleep timer left, from the audio clock while playing.
function getTimerRemaining() {
  if (sleepEndAt !== null && context && isCurrentlyPlaying()) {
    return Math.max(0, Math.ceil(sleepEndAt - context.currentTime));
  }
  return timerRemainingSec;
}

// Returns true when the session ended (and was torn down).
function checkSessionEnd() {
  if (!context || !isCurrentlyPlaying()) return false;
  var now = context.currentTime;
  var programDone = programEndAt !== null && now >= programEndAt;
  var timerDone = sleepEndAt !== null && now >= sleepEndAt;
  if (!programDone && !timerDone) return false;

  var sliderEl = document.getElementById('slider');
  var posEl = document.getElementById('divPosition');
  if (sliderEl) sliderEl.value = 0;
  if (posEl) posEl.textContent = '0:00';
  timeStart = 0;
  updateSliderFill();
  updateLiveReadouts(0);
  var timerFinished = timerDone && !(programDone && sleepEndAt > programEndAt);
  stop(false, true);
  playChime(false);
  if (timerFinished) {
    timerCompletedStatus = chimeEnabled ? 'Complete (Chime)' : 'Complete (Silent)';
  } else {
    timerCompletedStatus = chimeEnabled ? 'Complete (Chime)' : 'Complete';
  }
  syncTimerUI();
  savePosition(0);
  return true;
}

var lastShownTimerSec = -1;

function monitorTick() {
  if (!context || !isCurrentlyPlaying()) return;
  if (checkSessionEnd()) return;

  var t = getCurrentPositionSec();
  var sliderEl = document.getElementById('slider');
  var posEl = document.getElementById('divPosition');
  // Leave the slider and time label alone while a finger holds the thumb or a seek is mid-fade (MUX-IN-6).
  var userOwnsSlider = sliderHeld || seekRestartId !== null;
  if (sliderEl && !userOwnsSlider) sliderEl.value = t;
  if (posEl && !userOwnsSlider) posEl.textContent = getTimeString(t);
  if (!userOwnsSlider) updateSliderFill();
  if (!userOwnsSlider) updateLiveReadouts(t);
  if (sleepEndAt !== null) {
    var rem = getTimerRemaining();
    if (rem !== lastShownTimerSec) {
      lastShownTimerSec = rem;
      syncTimerUI();
    }
  }
  // The timeline chart is invisible while the scope view is active or the page is hidden.
  if (chart && activeStageView === 'curve' && !document.hidden) chart.replot();
  if (lastPositionSavedAt < 0 || Math.abs(t - lastPositionSavedAt) >= 5) savePosition(t);
}

function getSoundscapeGainScale(type) {
  if (type === 'rain') return 0.22;
  if (type === 'wind') return 0.16;
  return 0.15;
}

function getSoundscapeLabel(type, vol) {
  if (vol <= 0.001) return 'Ambient Off';
  if (type === 'rain') return 'Soft Rain';
  if (type === 'wind') return 'Cosmic Wind';
  return 'Pink Noise';
}

function stopAmbientLfo() {
  if (noiseLfo) {
    try {
      noiseLfo.stop();
      noiseLfo.disconnect();
    } catch (e) {}
    noiseLfo = null;
  }
  if (noiseLfoGain) {
    try {
      noiseLfoGain.disconnect();
    } catch (e) {}
    noiseLfoGain = null;
  }
}

function configureSoundscapeFilter() {
  if (!noiseFilter || !context) return;
  stopAmbientLfo();

  var now = context.currentTime;
  try {
    noiseFilter.frequency.cancelScheduledValues(now);
    noiseFilter.Q.cancelScheduledValues(now);
  } catch (e) {}

  if (ambientType === 'rain') {
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1350, now);
    noiseFilter.Q.setValueAtTime(0.65, now);
  } else if (ambientType === 'wind') {
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(380, now);
    noiseFilter.Q.setValueAtTime(2.2, now);

    // Gentle breathing LFO sweep for Cosmic Wind
    noiseLfo = context.createOscillator();
    noiseLfoGain = context.createGain();
    noiseLfo.type = 'sine';
    noiseLfo.frequency.setValueAtTime(0.14, now);
    noiseLfoGain.gain.setValueAtTime(160, now);
    noiseLfo.connect(noiseLfoGain);
    noiseLfoGain.connect(noiseFilter.frequency);
    noiseLfo.start(now);
  } else {
    // Default 'pink': warm 1/f lowpass at 650 Hz
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(650, now);
    noiseFilter.Q.setValueAtTime(0.7, now);
  }
}

function ensurePinkNoiseBuffer() {
  if (pinkNoiseBuffer || !context) return pinkNoiseBuffer;
  var bufferSize = 2 * context.sampleRate;
  pinkNoiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  var output = pinkNoiseBuffer.getChannelData(0);

  // Paul Kellet's 1/f pink noise filter algorithm
  var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (var i = 0; i < bufferSize; ++i) {
    var white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
    b6 = white * 0.115926;
  }
  return pinkNoiseBuffer;
}

function startAmbientNoise(rampSec) {
  stopAmbientNoise();
  if (!context) return;

  var buffer = ensurePinkNoiseBuffer();
  if (!buffer) return;

  noiseNode = context.createBufferSource();
  noiseNode.buffer = buffer;
  noiseNode.loop = true;

  noiseFilter = context.createBiquadFilter();
  configureSoundscapeFilter();

  noiseGain = context.createGain();
  var now = context.currentTime;
  noiseGain.gain.setValueAtTime(0, now);
  noiseRampStartAt = now;
  noiseRampEndAt = now + (typeof rampSec === 'number' ? rampSec : 0.8);

  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(context.destination);

  noiseNode.start(0);
  // Builds the fade-in (and re-applies any pending end fade, e.g. noise switched on mid-session).
  scheduleAudioEnd();
}

function stopAmbientNoise() {
  stopAmbientLfo();
  if (noiseNode) {
    try {
      noiseNode.stop();
      noiseNode.disconnect();
    } catch (e) {}
    noiseNode = null;
  }
  if (noiseFilter) {
    try {
      noiseFilter.disconnect();
    } catch (e) {}
    noiseFilter = null;
  }
  if (noiseGain) {
    try {
      noiseGain.disconnect();
    } catch (e) {}
    noiseGain = null;
  }
}

function updateAmbientRangeFill(slider) {
  if (!slider) return;
  var min = parseFloat(slider.min) || 0;
  var max = parseFloat(slider.max) || 1;
  var val = parseFloat(slider.value) || 0;
  var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  pct = Math.max(0, Math.min(100, pct));
  slider.style.setProperty('--fill', pct.toFixed(2) + '%');
  setSliderValueText(slider);
}

function syncAmbientUI() {
  var pctText = Math.round(ambientVolume * 100) + '%';
  var ambientSlider = document.getElementById('ambientSlider');
  var quickAmbientSlider = document.getElementById('quickAmbientSlider');
  var ambientVal = document.getElementById('ambientVal');
  var quickAmbientVal = document.getElementById('quickAmbientVal');
  var quickAmbientLabel = document.getElementById('quickAmbientLabel');

  if (ambientSlider) {
    ambientSlider.value = ambientVolume.toFixed(2);
    updateAmbientRangeFill(ambientSlider);
  }
  if (quickAmbientSlider) {
    quickAmbientSlider.value = ambientVolume.toFixed(2);
    updateAmbientRangeFill(quickAmbientSlider);
  }
  if (ambientVal) {
    ambientVal.textContent = pctText;
  }
  if (quickAmbientVal) {
    quickAmbientVal.textContent = pctText;
  }
  if (quickAmbientLabel) {
    quickAmbientLabel.textContent = getSoundscapeLabel(ambientType, ambientVolume);
  }

  var presetBtns = document.querySelectorAll('.soundscape-btn');
  var activePreset = ambientVolume <= 0.001 ? 'off' : ambientType;
  for (var i = 0; i < presetBtns.length; ++i) {
    var mode = presetBtns[i].getAttribute('data-soundscape');
    if (mode === activePreset) {
      presetBtns[i].classList.add('active');
    } else {
      presetBtns[i].classList.remove('active');
    }
  }
}

function setAmbientVolume(vol) {
  var parsed = parseFloat(vol);
  if (isNaN(parsed)) parsed = 0;
  parsed = Math.max(0, Math.min(1, parsed));
  ambientVolume = parsed;

  if (ambientVolume > 0.005) {
    lastNonZeroAmbientVolume = ambientVolume;
  }

  if (noiseGain && context) {
    scheduleAudioEnd();
  } else if (isCurrentlyPlaying() && ambientVolume > 0 && !noiseNode) {
    startAmbientNoise();
  }

  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('ambientVolume', ambientVolume.toFixed(2));
    }
  } catch (e) {}

  syncAmbientUI();
}

function setSoundscapePreset(preset) {
  if (preset === 'off') {
    setAmbientVolume(0);
    return;
  }

  if (preset === 'pink' || preset === 'rain' || preset === 'wind') {
    ambientType = preset;
    try {
      if (typeof Storage !== 'undefined') {
        localStorage.setItem('ambientType', ambientType);
      }
    } catch (e) {}

    if (ambientVolume <= 0.001) {
      var restored = lastNonZeroAmbientVolume > 0.01 ? lastNonZeroAmbientVolume : 0.20;
      setAmbientVolume(restored);
    } else {
      syncAmbientUI();
    }

    if (noiseFilter && context) {
      configureSoundscapeFilter();
      if (noiseGain) {
        scheduleAudioEnd();
      }
    }
  }
}

function updateToneRangeFill(slider) {
  if (!slider) return;
  var min = parseFloat(slider.min) || 0;
  var max = parseFloat(slider.max) || 1;
  var val = parseFloat(slider.value) || 0;
  var pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  pct = Math.max(0, Math.min(100, pct));
  slider.style.setProperty('--fill', pct.toFixed(2) + '%');
  setSliderValueText(slider);
}

function syncToneVolumeUI() {
  var pctText = Math.round(toneVolume * 100) + '%';
  var volumeSlider = document.getElementById('volumeSlider');
  var quickToneSlider = document.getElementById('quickToneSlider');
  var volumeVal = document.getElementById('volumeVal');
  var quickToneVal = document.getElementById('quickToneVal');

  if (volumeSlider) {
    volumeSlider.value = toneVolume.toFixed(2);
    updateToneRangeFill(volumeSlider);
  }
  if (quickToneSlider) {
    quickToneSlider.value = toneVolume.toFixed(2);
    updateToneRangeFill(quickToneSlider);
  }
  if (volumeVal) {
    volumeVal.textContent = pctText;
  }
  if (quickToneVal) {
    quickToneVal.textContent = pctText;
  }

  var toneBtns = document.querySelectorAll('.tone-vol-btn');
  for (var i = 0; i < toneBtns.length; ++i) {
    var btnVal = parseFloat(toneBtns[i].getAttribute('data-tone-vol'));
    if (Math.abs(btnVal - toneVolume) < 0.01) {
      toneBtns[i].classList.add('active');
    } else {
      toneBtns[i].classList.remove('active');
    }
  }
}

function setToneVolume(vol) {
  var parsed = parseFloat(vol);
  if (isNaN(parsed)) parsed = 0.35;
  parsed = Math.max(0, Math.min(1, parsed));
  toneVolume = parsed;

  if (toneMasterGain && context) {
    // Re-applies the level (and any scheduled end fade) from the audio clock.
    scheduleAudioEnd();
  }

  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('toneVolume', toneVolume.toFixed(2));
    }
  } catch (e) {}

  syncToneVolumeUI();
}

function cleanupAudioNodes() {
  stopAmbientNoise();

  if (toneMasterGain) {
    try {
      toneMasterGain.disconnect();
    } catch (e) {}
    toneMasterGain = null;
  }
  isTimerFadingOut = false;
  sleepEndAt = null;
  programEndAt = null;
  lastShownTimerSec = -1;

  if (osc && osc.length > 0) {
    for (var i = 0; i < osc.length; ++i) {
      if (osc[i].left) {
        try {
          osc[i].left.stop();
          osc[i].left.disconnect();
        } catch (e) {}
      }
      if (osc[i].right) {
        try {
          osc[i].right.stop();
          osc[i].right.disconnect();
        } catch (e) {}
      }
      if (osc[i].carrier) {
        try {
          osc[i].carrier.stop();
          osc[i].carrier.disconnect();
        } catch (e) {}
      }
      if (osc[i].lfo) {
        try {
          osc[i].lfo.stop();
          osc[i].lfo.disconnect();
        } catch (e) {}
      }
      if (osc[i].lfoGain) {
        try {
          osc[i].lfoGain.disconnect();
        } catch (e) {}
      }
      if (osc[i].pulseGain) {
        try {
          osc[i].pulseGain.disconnect();
        } catch (e) {}
      }
      if (osc[i].voiceGain) {
        try {
          osc[i].voiceGain.disconnect();
        } catch (e) {}
      }
    }
  }
  if (merger && merger.length > 0) {
    for (var j = 0; j < merger.length; ++j) {
      try {
        merger[j].disconnect();
      } catch (e) {}
    }
  }
  osc = [];
  gain = [];
  merger = [];

  if (monitor !== null) {
    clearInterval(monitor);
    monitor = null;
  }
}

function isNativeApp() {
  return !!(window.BinalityPlatform && window.BinalityPlatform.isNative);
}

function parseTimerSettingToSeconds(val) {
  if (val === '10s') return isNativeApp() ? 0 : 10; // D21: the 10 s test timer is a web-only development aid
  var mins = parseInt(val, 10);
  if (!isNaN(mins) && mins > 0) return mins * 60;
  return 0;
}

function formatTimerCountdown(sec) {
  var sTotal = Math.max(0, Math.floor(sec));
  var mins = Math.floor(sTotal / 60);
  var secs = sTotal % 60;
  var mStr = mins < 10 ? '0' + mins : '' + mins;
  var sStr = secs < 10 ? '0' + secs : '' + secs;
  return mStr + ':' + sStr;
}

function playChime(forcePlay) {
  if (!forcePlay && !chimeEnabled) return;
  if (!context && isAudioSupported) {
    try {
      context = createAudioContext();
    } catch (e) {}
  }
  if (!context) return;

  // Always request resume: stop() may have a suspend() in flight while context.state still reads 'running'.
  try {
    var chimeResume = context.resume();
    if (chimeResume && chimeResume.catch) chimeResume.catch(function () {});
  } catch (e) {}
  // Release the audio hardware again once the chime tail is over, if nothing is playing.
  setTimeout(function () {
    if (context && !isCurrentlyPlaying() && !isTestingStereo) suspendContextIfIdle();
  }, 3900);

  var t = context.currentTime;
  var frequencies = [528, 660, 792]; // Harmonic Solfeggio triad (528 Hz MI + Major 3rd + Perfect 5th)

  for (var idx = 0; idx < frequencies.length; ++idx) {
    (function (freq, i) {
      var chimeOsc = context.createOscillator();
      var chimeGain = context.createGain();
      var startT = t + i * 0.08;

      chimeOsc.type = 'sine';
      chimeOsc.frequency.setValueAtTime(freq, startT);

      chimeGain.gain.setValueAtTime(0.001, startT);
      chimeGain.gain.exponentialRampToValueAtTime(0.18 / (i + 1), startT + 0.05);
      chimeGain.gain.exponentialRampToValueAtTime(0.0001, startT + 3.2);

      chimeOsc.connect(chimeGain);
      chimeGain.connect(context.destination);

      chimeOsc.onended = function () {
        try {
          chimeOsc.disconnect();
          chimeGain.disconnect();
        } catch (e) {}
      };

      chimeOsc.start(startT);
      chimeOsc.stop(startT + 3.5);
    })(frequencies[idx], idx);
  }
}

// Applies the level envelope for one gain param on the audio clock: fade-in continuation, hold at target, and an
// optional linear fade to silence finishing at endAt. Re-callable (volume change, timer change): it restarts from
// the param's current value so there are no jumps.
function applyGainEnvelope(param, target, rampStartAt, rampEndAt, fadeStartAt, endAt) {
  var now = context.currentTime;
  try {
    // param.value is stale (default 1) until the audio thread has rendered, so the very start is known to be 0.
    var v = now <= rampStartAt + 0.02 ? 0 : param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(v, now);
    var cursor = now;
    var rampingIn = now < rampEndAt;
    if (rampingIn && (endAt === null || rampEndAt <= fadeStartAt)) {
      param.linearRampToValueAtTime(target, rampEndAt);
      cursor = rampEndAt;
    } else if (!rampingIn || endAt === null) {
      param.setTargetAtTime(target, now, 0.05);
    }
    if (endAt !== null) {
      if (fadeStartAt > cursor) {
        // Hold the level until the fade starts (cursor == now means we are already near target).
        param.setValueAtTime(target, fadeStartAt);
      }
      param.linearRampToValueAtTime(0, Math.max(endAt, now + 0.01));
    }
  } catch (e) {}
}

// Schedules the end of the session on the audio clock (D8): a linear fade to silence and osc.stop, so it lands on
// time even when JS timers are throttled or suspended. Earliest of sleep timer / program end wins.
// Safe to call repeatedly; also (re)builds the fade-in and tracks live volume changes.
function scheduleAudioEnd() {
  if (!context || !isCurrentlyPlaying()) return;
  var now = context.currentTime;

  var endAt = null;
  var fadeSec = 0;
  if (sleepEndAt !== null) {
    endAt = sleepEndAt;
    fadeSec = sleepFadeSec;
  }
  if (programEndAt !== null && (endAt === null || programEndAt < endAt)) {
    endAt = programEndAt;
    fadeSec = programFadeSec;
  }
  var fadeStartAt = null;
  if (endAt !== null) {
    fadeSec = Math.min(fadeSec, Math.max(0.05, endAt - now));
    fadeStartAt = Math.max(now, endAt - fadeSec);
  }

  if (toneMasterGain) {
    applyGainEnvelope(toneMasterGain.gain, toneVolume > 0.001 ? toneVolume : 0, toneRampStartAt, toneRampEndAt, fadeStartAt, endAt);
  }
  if (noiseGain) {
    applyGainEnvelope(
      noiseGain.gain,
      ambientVolume * getSoundscapeGainScale(ambientType),
      noiseRampStartAt,
      noiseRampEndAt,
      fadeStartAt,
      endAt
    );
  }
  // Oscillators cannot be un-stopped, so only the program end (fixed for this start()) schedules osc.stop; a sleep
  // timer relies on the gain reaching 0 on the audio clock and the oscillators are torn down by checkSessionEnd().
  if (programEndAt !== null && osc) {
    var stopAt = programEndAt + 0.05;
    for (var i = 0; i < osc.length; ++i) {
      var nodes = [osc[i].left, osc[i].right, osc[i].carrier, osc[i].lfo];
      for (var n = 0; n < nodes.length; ++n) {
        if (nodes[n]) {
          try {
            nodes[n].stop(stopAt);
          } catch (e) {}
        }
      }
    }
  }
}

function clearSleepTimer(resetRemaining) {
  var hadEnd = sleepEndAt !== null;
  sleepEndAt = null;
  isTimerFadingOut = false;
  lastShownTimerSec = -1;
  if (resetRemaining) {
    timerRemainingSec = timerDurationSec;
  }
  if (hadEnd) scheduleAudioEnd(); // cancels a pending fade if still playing
}

function startSleepTimer(preserveRemaining) {
  clearSleepTimer(false);
  if (timerDurationSec <= 0 || !context) {
    timerRemainingSec = 0;
    scheduleAudioEnd();
    syncTimerUI();
    return;
  }

  if (!preserveRemaining || timerRemainingSec <= 0) {
    timerRemainingSec = timerDurationSec;
  }

  // End time on the audio clock; the UI countdown is derived from it (getTimerRemaining), never decremented.
  sleepEndAt = context.currentTime + timerRemainingSec;
  sleepFadeSec = Math.min(SLEEP_FADE_SEC, timerRemainingSec / 2);
  scheduleAudioEnd();
  syncTimerUI();
}

function syncTimerUI() {
  var timerSelect = document.getElementById('timerSelect');
  var quickTimerSelect = document.getElementById('quickTimerSelect');
  var timerDisplay = document.getElementById('timerDisplay');
  var quickTimerDisplay = document.getElementById('quickTimerDisplay');
  var chimeToggleBtn = document.getElementById('chimeToggleBtn');
  var chimeToggleLabel = document.getElementById('chimeToggleLabel');

  if (timerSelect && timerSelect.value !== timerSetting) {
    timerSelect.value = timerSetting;
  }
  if (quickTimerSelect && quickTimerSelect.value !== timerSetting) {
    quickTimerSelect.value = timerSetting;
  }

  var presetBtns = document.querySelectorAll('.timer-preset-btn');
  for (var i = 0; i < presetBtns.length; ++i) {
    var val = presetBtns[i].getAttribute('data-timer');
    if (val === timerSetting) {
      presetBtns[i].classList.add('active');
    } else {
      presetBtns[i].classList.remove('active');
    }
  }

  if (chimeToggleBtn) {
    chimeToggleBtn.setAttribute('aria-pressed', chimeEnabled ? 'true' : 'false');
    if (chimeEnabled) {
      chimeToggleBtn.classList.add('active');
    } else {
      chimeToggleBtn.classList.remove('active');
    }
  }
  if (chimeToggleLabel) {
    chimeToggleLabel.textContent = chimeEnabled ? 'Chime: ON' : 'Silent Fade-Out';
  }

  var badgeText = 'Continuous';
  var badgeStateClass = '';

  if (timerCompletedStatus) {
    badgeText = timerCompletedStatus;
    badgeStateClass = 'timer-complete';
  } else if (timerDurationSec > 0) {
    var playingNow = isCurrentlyPlaying();
    var remainingSec = getTimerRemaining();
    var displaySec = (playingNow || interruptedInfo) && remainingSec > 0 ? remainingSec : timerDurationSec;
    badgeText = formatTimerCountdown(displaySec);
    if (playingNow) {
      isTimerFadingOut =
        sleepEndAt !== null && context && context.currentTime >= sleepEndAt - sleepFadeSec;
      if (isTimerFadingOut && remainingSec > 0) {
        badgeStateClass = 'timer-fading';
        badgeText = 'Fade ' + badgeText;
      } else {
        badgeStateClass = 'timer-active';
      }
    }
  }

  if (timerDisplay) {
    timerDisplay.textContent = badgeText;
    timerDisplay.className = 'timer-val-badge' + (badgeStateClass ? ' ' + badgeStateClass : '');
  }
  if (quickTimerDisplay) {
    quickTimerDisplay.textContent = badgeText;
    quickTimerDisplay.className = 'timer-val-badge' + (badgeStateClass ? ' ' + badgeStateClass : '');
  }
}

function setTimerSetting(val) {
  var normalized = String(val || '0');
  var sec = parseTimerSettingToSeconds(normalized);
  if (sec === 0) normalized = '0';

  timerSetting = normalized;
  timerDurationSec = sec;
  timerRemainingSec = sec;
  timerCompletedStatus = null;

  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('timerSetting', timerSetting);
    }
  } catch (e) {}

  if (isCurrentlyPlaying()) {
    if (timerDurationSec > 0) {
      startSleepTimer(false);
    } else {
      clearSleepTimer(true);
      syncTimerUI();
    }
  } else {
    clearSleepTimer(true);
    syncTimerUI();
  }
}

function setChimeEnabled(enabled) {
  chimeEnabled = !!enabled;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('chimeEnabled', chimeEnabled ? 'true' : 'false');
    }
  } catch (e) {}
  syncTimerUI();
}

function renderBreathSteps() {
  var stepsRow = document.getElementById('breathStepsRow');
  if (!stepsRow) return;
  var pattern = BREATH_PATTERNS[breathMode] || BREATH_PATTERNS[lastActiveBreathMode] || BREATH_PATTERNS.box;
  var html = '';
  for (var i = 0; i < pattern.steps.length; ++i) {
    var st = pattern.steps[i];
    var durText = st.duration % 1 === 0 ? st.duration.toFixed(0) + 's' : st.duration.toFixed(1) + 's';
    html +=
      '<span class="breath-step-pill" data-breath-step="' +
      i +
      '">' +
      st.phase +
      ' ' +
      durText +
      '</span>';
  }
  stepsRow.innerHTML = html;
}

function stopBreathAnimation() {
  if (breathAnimId !== null) {
    cancelAnimationFrame(breathAnimId);
    breathAnimId = null;
  }
}

function startBreathAnimation() {
  stopBreathAnimation();
  var pattern = BREATH_PATTERNS[breathMode];
  if (!pattern) return;

  breathStartTime = performance.now();
  renderBreathSteps();

  var totalCycle = 0;
  for (var i = 0; i < pattern.steps.length; ++i) {
    totalCycle += pattern.steps[i].duration;
  }

  var circumference = 2 * Math.PI * 68; // 427.2566

  function stepFrame(now) {
    if (breathMode === 'off' || !BREATH_PATTERNS[breathMode]) {
      breathAnimId = null;
      return;
    }

    var p = BREATH_PATTERNS[breathMode];
    var elapsed = Math.max(0, (now - breathStartTime) * 0.001);
    var cycleCount = Math.floor(elapsed / totalCycle) + 1;
    var cyclePos = elapsed % totalCycle;

    var acc = 0;
    var activeIdx = 0;
    var stepElapsed = 0;
    for (var s = 0; s < p.steps.length; ++s) {
      var d = p.steps[s].duration;
      if (cyclePos <= acc + d || s === p.steps.length - 1) {
        activeIdx = s;
        stepElapsed = Math.max(0, cyclePos - acc);
        break;
      }
      acc += d;
    }

    var activeStep = p.steps[activeIdx];
    var progress = activeStep.duration > 0 ? Math.min(1, stepElapsed / activeStep.duration) : 1;
    var remaining = Math.max(0, activeStep.duration - stepElapsed);

    // Smooth cosine easing for natural diaphragmatic expansion & contraction
    var ease = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    var scale = 0.52;
    if (activeStep.type === 'inhale') {
      scale = 0.52 + 0.48 * ease;
    } else if (activeStep.type === 'hold-full') {
      scale = 1.0 + 0.025 * Math.sin(progress * Math.PI * 2);
    } else if (activeStep.type === 'exhale') {
      scale = 1.0 - 0.48 * ease;
    } else {
      scale = 0.52 + 0.02 * Math.sin(progress * Math.PI * 2);
    }

    if (prefersReducedMotion()) scale = 0.76; // MUX-VIS-3: static orb; the countdown text and ring carry the pacing
    var orb = document.getElementById('breathOrb');
    var aura = document.getElementById('breathAura');
    var ringArc = document.getElementById('breathRingArc');
    var phaseText = document.getElementById('breathPhaseText');
    var countdownText = document.getElementById('breathCountdownText');
    var cycleBadge = document.getElementById('breathCycleBadge');

    if (orb) {
      orb.style.transform = 'scale(' + scale.toFixed(3) + ')';
      orb.style.borderColor = activeStep.color;
    }
    if (aura) {
      var auraScale = scale * 1.12;
      aura.style.transform = 'scale(' + auraScale.toFixed(3) + ')';
      aura.style.opacity = (0.35 + (scale - 0.52) * 0.9).toFixed(2);
    }
    if (ringArc) {
      var offset = circumference * (1 - progress);
      ringArc.style.strokeDashoffset = offset.toFixed(2);
      ringArc.style.stroke = activeStep.color;
    }
    if (phaseText) {
      phaseText.textContent = activeStep.phase;
      phaseText.style.color = activeStep.color;
    }
    if (countdownText) {
      countdownText.textContent = remaining.toFixed(1) + 's';
    }
    if (cycleBadge) {
      cycleBadge.textContent = 'Cycle ' + cycleCount;
    }

    var stepPills = document.querySelectorAll('[data-breath-step]');
    for (var k = 0; k < stepPills.length; ++k) {
      var idx = parseInt(stepPills[k].getAttribute('data-breath-step'), 10);
      if (idx === activeIdx) {
        stepPills[k].classList.add('active');
      } else {
        stepPills[k].classList.remove('active');
      }
    }

    breathAnimId = requestAnimationFrame(stepFrame);
  }

  breathAnimId = requestAnimationFrame(stepFrame);
}

function syncBreathUI() {
  var overlay = document.getElementById('breathOverlay');
  var headerBtn = document.getElementById('headerBreathBtn');
  var headerLabel = document.getElementById('headerBreathLabel');
  var patternTitle = document.getElementById('breathPatternTitle');
  var settingsBadge = document.getElementById('settingsBreathBadge');

  var isActive = breathMode !== 'off' && !!BREATH_PATTERNS[breathMode];
  var activePattern = isActive ? BREATH_PATTERNS[breathMode] : null;

  if (overlay) {
    if (isActive) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
    if (breathCompact) {
      overlay.classList.add('compact-dock');
    } else {
      overlay.classList.remove('compact-dock');
    }
  }

  if (headerBtn) {
    headerBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (isActive) {
      headerBtn.classList.add('active');
    } else {
      headerBtn.classList.remove('active');
    }
  }

  if (headerLabel) {
    headerLabel.textContent = isActive ? activePattern.shortName : 'Breathe';
  }

  if (patternTitle && activePattern) {
    patternTitle.textContent = activePattern.name;
  }

  if (settingsBadge) {
    settingsBadge.textContent = isActive ? activePattern.shortName : 'Off';
    settingsBadge.className = 'timer-val-badge' + (isActive ? ' timer-active' : '');
  }

  var modeBtns = document.querySelectorAll('.breath-mode-btn');
  for (var i = 0; i < modeBtns.length; ++i) {
    var m = modeBtns[i].getAttribute('data-breath');
    if (m === (isActive ? breathMode : lastActiveBreathMode)) {
      modeBtns[i].classList.add('active');
    } else {
      modeBtns[i].classList.remove('active');
    }
  }

  var settingsBtns = document.querySelectorAll('.settings-breath-btn');
  for (var j = 0; j < settingsBtns.length; ++j) {
    var sb = settingsBtns[j].getAttribute('data-breath');
    if (sb === breathMode) {
      settingsBtns[j].classList.add('active');
    } else {
      settingsBtns[j].classList.remove('active');
    }
  }
}

function setBreathMode(mode) {
  if (mode !== 'off' && BREATH_PATTERNS[mode]) {
    breathMode = mode;
    lastActiveBreathMode = mode;
    try {
      if (typeof Storage !== 'undefined') {
        localStorage.setItem('breathMode', breathMode);
        localStorage.setItem('lastActiveBreathMode', lastActiveBreathMode);
      }
    } catch (e) {}
    syncBreathUI();
    startBreathAnimation();
  } else {
    breathMode = 'off';
    try {
      if (typeof Storage !== 'undefined') {
        localStorage.setItem('breathMode', 'off');
      }
    } catch (e) {}
    stopBreathAnimation();
    syncBreathUI();
  }
}

function toggleBreathPacer() {
  if (breathMode === 'off') {
    setBreathMode(lastActiveBreathMode || 'box');
  } else {
    setBreathMode('off');
  }
}

function toggleBreathCompact() {
  breathCompact = !breathCompact;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('breathCompact', breathCompact ? 'true' : 'false');
    }
  } catch (e) {}
  syncBreathUI();
}

function cancelPendingStop() {
  if (pendingStopId !== null) {
    clearTimeout(pendingStopId);
    pendingStopId = null;
  }
}

// Release the audio hardware while idle (saves battery); start()/playChime()/testStereo() resume it.
function suspendContextIfIdle() {
  if (context && context.state === 'running' && !isCurrentlyPlaying() && typeof context.suspend === 'function') {
    try {
      var p = context.suspend();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
}

// Linear fade of both gains to silence over sec on the audio clock, then osc/noise stop at the end of the fade.
function fadeOutNow(sec) {
  var now = context.currentTime;
  var gains = [toneMasterGain && toneMasterGain.gain, noiseGain && noiseGain.gain];
  for (var g = 0; g < gains.length; ++g) {
    if (!gains[g]) continue;
    try {
      var v = gains[g].value;
      gains[g].cancelScheduledValues(now);
      gains[g].setValueAtTime(v, now);
      gains[g].linearRampToValueAtTime(0, now + sec);
    } catch (e) {}
  }
  var stopAt = now + sec + 0.02;
  var sources = [noiseNode];
  for (var i = 0; i < osc.length; ++i) {
    sources.push(osc[i].left, osc[i].right, osc[i].carrier, osc[i].lfo);
  }
  for (var s = 0; s < sources.length; ++s) {
    if (sources[s]) {
      try {
        sources[s].stop(stopAt);
      } catch (e) {}
    }
  }
}

// opts: { immediate: skip the 300 ms fade, keepContext: do not suspend the context (system owns it),
//         interrupted: report UI state 'interrupted' instead of 'idle' }
function stop(preserveTimer, fromTimerComplete, opts) {
  opts = opts || {};
  cancelSeekRestart();
  var wasPlaying = isCurrentlyPlaying();
  var userStop = wasPlaying && !preserveTimer && !fromTimerComplete;

  if (wasPlaying) {
    timerRemainingSec = getTimerRemaining(); // freeze the audio-clock countdown before nodes are torn down
    if (userStop) {
      // Pause = stop + remembered position (taken from the audio clock, not the 250 ms-stale slider).
      var pos = getCurrentPositionSec();
      var sliderEl = document.getElementById('slider');
      if (sliderEl) sliderEl.value = pos;
      timeStart = pos;
      var posEl = document.getElementById('divPosition');
      if (posEl) posEl.textContent = getTimeString(pos);
      updateSliderFill();
      updateLiveReadouts(pos);
    }
  }
  var fade =
    userStop && !opts.immediate && context && context.state === 'running' && toneMasterGain !== null;

  setPlayingUI(false, !!opts.interrupted);
  stopMonitor();
  clearHiddenWatch();
  cancelPendingStop();
  if (!preserveTimer) {
    clearSleepTimer(true);
  }
  if (!fromTimerComplete && !preserveTimer) {
    timerCompletedStatus = null;
    syncTimerUI();
  }
  if (chart) chart.replot();
  if (userStop) savePosition(timeStart);

  var finish = function () {
    cleanupAudioNodes();
    if (!preserveTimer && !opts.keepContext) suspendContextIfIdle();
  };
  if (fade) {
    fadeOutNow(STOP_FADE_SEC);
    pendingStopId = setTimeout(function () {
      pendingStopId = null;
      if (!isCurrentlyPlaying()) finish();
    }, STOP_FADE_SEC * 1000 + 40);
  } else {
    finish();
  }
}


// ---------------------------------------------------------------------------------------------------------------
// Lifecycle (MUX-LIFE-2/3/5/7): audio-clock truth, interruption states, background throttling, persistence.
// UI states: 'idle' | 'playing' | 'interrupted' (data-state on #start and #audioStatus).
// ---------------------------------------------------------------------------------------------------------------

function savePosition(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  lastPositionSavedAt = sec;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('lastPosition', String(sec));
      localStorage.setItem('lastPositionProgram', currentProgram);
    }
  } catch (e) {}
}

function loadSavedPosition() {
  try {
    if (typeof Storage !== 'undefined') {
      var pos = parseInt(localStorage.getItem('lastPosition'), 10);
      var prog = localStorage.getItem('lastPositionProgram');
      if (!isNaN(pos) && pos > 0 && prog) {
        pendingRestorePosition = { program: prog, position: pos };
      }
    }
  } catch (e) {}
}

// Playing -> interrupted: the system (or a failed resume) took the audio. Keeps position and remaining timer.
function enterInterrupted(reason) {
  if (!isCurrentlyPlaying()) return;
  var pos = getCurrentPositionSec();
  var sliderEl = document.getElementById('slider');
  var posEl = document.getElementById('divPosition');
  interruptedInfo = { at: Date.now(), reason: reason || 'unknown' };
  stop(true, false, { immediate: true, keepContext: true, interrupted: true });
  timeStart = pos;
  if (sliderEl) sliderEl.value = pos;
  if (posEl) posEl.textContent = getTimeString(pos);
  updateSliderFill();
  updateLiveReadouts(pos);
  savePosition(pos);
  syncTimerUI();
}

function onContextStateChange() {
  if (!context || ctxResumePending) return;
  if (isCurrentlyPlaying() && context.state !== 'running') {
    enterInterrupted('statechange:' + context.state);
  }
}

var INTERRUPTION_AUTO_RESUME_MAX_MS = 10 * 60 * 1000;

function resumeFromInterruption() {
  interruptedInfo = null;
  start(true, true); // keeps the remaining timer, 3 s fade-in
}

// While hidden there are no rAF loops, no interval and no DOM writes: one low-rate timeout checks the audio-clock
// end of the session (and persists position). The audio itself ends on the audio clock regardless of this timeout.
function clearHiddenWatch() {
  if (hiddenWatchId !== null) {
    clearTimeout(hiddenWatchId);
    hiddenWatchId = null;
  }
}

function armHiddenWatch() {
  clearHiddenWatch();
  if (!context || !isCurrentlyPlaying()) return;
  var delay = 30000;
  var endAt = null;
  if (sleepEndAt !== null) endAt = sleepEndAt;
  if (programEndAt !== null && (endAt === null || programEndAt < endAt)) endAt = programEndAt;
  if (endAt !== null) {
    delay = Math.min(delay, Math.max(250, (endAt - context.currentTime) * 1000 + 300));
  }
  hiddenWatchId = setTimeout(function () {
    hiddenWatchId = null;
    if (!document.hidden) return;
    if (context && isCurrentlyPlaying() && context.state !== 'running' && !ctxResumePending) {
      enterInterrupted('statechange:' + context.state);
      return;
    }
    if (checkSessionEnd()) return;
    if (isCurrentlyPlaying()) {
      savePosition(getCurrentPositionSec());
      armHiddenWatch();
    }
  }, delay);
}

function onPageHidden() {
  if (isCurrentlyPlaying()) {
    savePosition(getCurrentPositionSec());
  } else {
    savePosition(parseInt((document.getElementById('slider') || {}).value, 10) || timeStart || 0);
  }
  stopScopeAnimation();
  stopBreathAnimation();
  stopMonitor();
  armHiddenWatch();
}

function onPageVisible() {
  clearHiddenWatch();
  if (context && isCurrentlyPlaying() && context.state !== 'running' && !ctxResumePending) {
    enterInterrupted('statechange:' + context.state);
  } else if (isCurrentlyPlaying()) {
    if (checkSessionEnd()) {
      // ended while hidden: UI already moved to idle
    } else {
      monitorTick();
      startMonitor();
      if (activeStageView === 'waveform') startScopeAnimation();
    }
  }
  if (breathMode !== 'off' && BREATH_PATTERNS[breathMode]) startBreathAnimation();
  syncTimerUI();
  if (chart) chart.replot();
  if (activeStageView === 'waveform') drawScopeFrame();
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    onPageHidden();
  } else {
    onPageVisible();
  }
});

window.addEventListener('pagehide', function () {
  if (isCurrentlyPlaying()) {
    savePosition(getCurrentPositionSec());
  } else {
    var s = document.getElementById('slider');
    savePosition(s ? parseInt(s.value, 10) || 0 : timeStart);
  }
});

// Hooks for the native wrapper (M2.1 / M2.2). They route into the same stop()/start() paths as the buttons.
window.BinalityApp = window.BinalityApp || {};
window.BinalityApp.getState = function () {
  var btn = document.getElementById('start');
  return btn ? btn.getAttribute('data-state') || 'idle' : 'idle';
};
// System took the audio (call, Siri, other app): pause now, state 'interrupted'.
window.BinalityApp.onInterruptionBegan = function () {
  enterInterrupted('native');
};
// info.shouldResume (default true). Resumes with a 3 s fade-in only if interrupted < 10 min ago; else goes idle.
window.BinalityApp.onInterruptionEnded = function (info) {
  if (!interruptedInfo) return;
  var shouldResume = !info || info.shouldResume !== false;
  var fresh = Date.now() - interruptedInfo.at < INTERRUPTION_AUTO_RESUME_MAX_MS;
  if (shouldResume && fresh) {
    resumeFromInterruption();
  } else {
    interruptedInfo = null;
    setPlayingUI(false, false);
    syncTimerUI();
  }
};
// Headphones unplugged / Bluetooth lost: stop at once, idle, never auto-resume.
window.BinalityApp.onRouteLost = function () {
  if (isCurrentlyPlaying()) {
    enterInterrupted('route-lost');
  }
  interruptedInfo = null;
  setPlayingUI(false, false);
  suspendContextIfIdle();
  var statusText = document.querySelector('#audioStatus .status-text');
  if (statusText) statusText.textContent = 'Headphones disconnected - session stopped';
  syncTimerUI();
};

function onSliderChanged() {
  var slider = document.getElementById('slider');
  if (!slider) return;
  var t = parseInt(slider.value, 10) || 0;
  var posEl = document.getElementById('divPosition');
  if (posEl) {
    posEl.textContent = getTimeString(t);
  }
  updateSliderFill();
  updateLiveReadouts(t);

  if (isCurrentlyPlaying()) {
    restartPlaybackAt(t);
  } else {
    timeStart = t;
    savePosition(t);
    if (chart) chart.replot();
  }
}

function cancelSeekRestart() {
  if (seekRestartId !== null) {
    clearTimeout(seekRestartId);
    seekRestartId = null;
  }
}

// Seeks while playing: 150 ms gain fade to silence, then the usual stop/start restart (which fades back in), so the
// restart never cuts a waveform mid-cycle (MUX-IN-3). Falls back to an immediate restart if there is nothing to fade.
function restartPlaybackAt(t) {
  cancelSeekRestart();
  var restart = function () {
    seekRestartId = null;
    if (!isCurrentlyPlaying()) return; // user stopped during the fade
    var sliderEl = document.getElementById('slider');
    if (sliderEl) sliderEl.value = t; // start() reads its start point from the slider
    stop(true);
    timeStart = t;
    start(true);
  };
  if (context && context.state === 'running' && toneMasterGain !== null) {
    fadeOutNow(SEEK_FADE_SEC);
    seekRestartId = setTimeout(restart, SEEK_FADE_SEC * 1000 + 20);
  } else {
    restart();
  }
}

// Moves the program to second t (slider, readouts, audio). fromChart adds the "Jumped to" toast.
function seekToSecond(t, fromChart) {
  var slider = document.getElementById('slider');
  if (!slider) return;
  slider.value = t;
  onSliderChanged();
  if (fromChart) showToast('Jumped to ' + getTimeString(t));
}

var toastHideId = null;

function showToast(text, ms) {
  var el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  // Force a reflow so a repeated toast restarts its transition.
  void el.offsetWidth;
  el.classList.add('visible');
  if (toastHideId !== null) clearTimeout(toastHideId);
  toastHideId = setTimeout(function () {
    toastHideId = null;
    el.classList.remove('visible');
  }, ms || TOAST_MS);
}

// Confirm sheet for destructive actions (MUX-TAP-7): bottom sheet on Compact, centred card otherwise, 56 px buttons.
// Resolves via onConfirm only on an explicit tap of the destructive button; backdrop, Cancel and Escape dismiss.
function confirmAction(opts, onConfirm) {
  var existing = document.getElementById('confirmSheet');
  if (existing) existing.parentNode.removeChild(existing);

  var sheet = document.createElement('div');
  sheet.id = 'confirmSheet';
  sheet.className = 'confirm-sheet';
  sheet.setAttribute('role', 'alertdialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'confirmSheetTitle');

  var backdrop = document.createElement('div');
  backdrop.className = 'confirm-backdrop';
  var card = document.createElement('div');
  card.className = 'confirm-card';
  var title = document.createElement('h2');
  title.id = 'confirmSheetTitle';
  title.className = 'confirm-title';
  title.textContent = opts.title;
  var body = document.createElement('p');
  body.className = 'confirm-body';
  body.textContent = opts.message || '';
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'confirm-btn confirm-cancel';
  cancelBtn.textContent = 'Cancel';
  var okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'confirm-btn confirm-ok';
  okBtn.textContent = opts.confirmLabel || 'Delete';

  var actions = document.createElement('div');
  actions.className = 'confirm-actions';
  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  sheet.appendChild(backdrop);
  sheet.appendChild(card);
  document.body.appendChild(sheet);
  trapFocus(sheet, document.activeElement);

  function dismiss() {
    document.removeEventListener('keydown', onKey, true);
    releaseFocus(sheet);
    if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // closes only the sheet, not the modal underneath
      dismiss();
    }
  }
  document.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('click', dismiss);
  cancelBtn.addEventListener('click', dismiss);
  okBtn.addEventListener('click', function () {
    dismiss();
    onConfirm();
  });
  cancelBtn.focus();
}

function syncModeUI() {
  var isIso = entrainmentMode === 'isochronic';

  var headerModeBtn = document.getElementById('headerModeBtn');
  var headerModeIcon = document.getElementById('headerModeIcon');
  var headerModeLabel = document.getElementById('headerModeLabel');
  var settingsModeBadge = document.getElementById('settingsModeBadge');
  var btnModeBinaural = document.getElementById('btnModeBinaural');
  var btnModeIsochronic = document.getElementById('btnModeIsochronic');
  var modeHintText = document.getElementById('modeHintText');
  var carrierHintText = document.getElementById('carrierHintText');
  var audioStatus = document.getElementById('audioStatus');

  if (headerModeBtn) {
    if (isIso) {
      headerModeBtn.classList.add('is-isochronic');
    } else {
      headerModeBtn.classList.remove('is-isochronic');
    }
  }
  if (headerModeBtn) {
    headerModeBtn.setAttribute('aria-pressed', isIso ? 'true' : 'false');
    headerModeBtn.setAttribute(
      'aria-label',
      isIso
        ? 'Tone mode: Isochronic, works on speakers. Switch to Binaural'
        : 'Tone mode: Binaural, for stereo headphones. Switch to Isochronic'
    );
  }
  if (headerModeIcon) {
    headerModeIcon.textContent = isIso ? '🔊' : '🎧';
  }
  if (headerModeLabel) {
    headerModeLabel.textContent = isIso ? 'Isochronic' : 'Binaural';
  }

  if (settingsModeBadge) {
    settingsModeBadge.textContent = isIso ? 'Speakers (Isochronic)' : 'Headphones (Binaural)';
    settingsModeBadge.className = 'mode-badge' + (isIso ? ' mode-isochronic' : '');
  }

  if (btnModeBinaural) {
    if (isIso) {
      btnModeBinaural.classList.remove('active');
    } else {
      btnModeBinaural.classList.add('active');
    }
  }
  if (btnModeIsochronic) {
    if (isIso) {
      btnModeIsochronic.classList.add('active');
    } else {
      btnModeIsochronic.classList.remove('active');
    }
  }

  if (modeHintText) {
    if (isIso) {
      modeHintText.innerHTML =
        '<strong>Isochronic Tones:</strong> Carrier pitch modulated by rhythmic amplitude pulses at the program beat frequency. Works on room speakers, soundbars, laptop/phone speakers, and headphones without stereo separation.';
    } else {
      modeHintText.innerHTML =
        '<strong>Binaural Beats:</strong> Two constant tones played separately into Left &amp; Right ears. Beat is synthesized by your brain. Requires stereo headphones.';
    }
  }

  if (carrierHintText) {
    if (isIso) {
      carrierHintText.textContent =
        'Both channels play the Base Frequency carrier tone, rhythmically pulsed at the program beat rate (Speaker compatible).';
    } else {
      carrierHintText.textContent =
        'Left ear plays the Base Frequency; Right ear plays Base Frequency + Program Beat Frequency via stereo headphones.';
    }
  }

  if (audioStatus && isCurrentlyPlaying()) {
    var statusText = audioStatus.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = isIso ? 'Pulsing Isochronic Tones' : 'Synthesizing Stereo Audio';
    }
  }

  renderLegend();
  updateLiveReadouts();
  if (chart && typeof chart.replot === 'function') {
    chart.replot();
  }
}

function setEntrainmentMode(newMode) {
  var mode = newMode === 'isochronic' ? 'isochronic' : 'binaural';
  if (entrainmentMode === mode) return;

  entrainmentMode = mode;
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('entrainmentMode', entrainmentMode);
    }
  } catch (e) {}

  syncModeUI();

  if (isCurrentlyPlaying()) {
    var slider = document.getElementById('slider');
    var currentPos = slider ? parseInt(slider.value, 10) || 0 : timeStart;
    stop(true);
    timeStart = currentPos;
    start(true);
  }
}

function syncHarmonicButtons() {
  var btns = document.querySelectorAll('.harmonic-btn');
  for (var i = 0; i < btns.length; ++i) {
    var f = parseFloat(btns[i].getAttribute('data-freq'));
    if (Math.abs(f - baseFreq) < 0.5) {
      btns[i].classList.add('active');
    } else {
      btns[i].classList.remove('active');
    }
  }
}

var BASE_FREQ_MIN = 20;
var BASE_FREQ_MAX = 1500;

function showBaseFreqMessage(text) {
  var msg = document.getElementById('baseFreqMsg');
  if (!msg) return;
  msg.textContent = text || '';
  if (text) {
    msg.classList.remove('hidden');
  } else {
    msg.classList.add('hidden');
  }
}

function applyBaseFrequency(newFreq) {
  var parsed = parseFloat(newFreq);
  var note = '';
  if (isNaN(parsed)) {
    parsed = baseFreq;
    note = 'Enter a frequency from ' + BASE_FREQ_MIN + ' to ' + BASE_FREQ_MAX + ' Hz. Kept ' + parsed + ' Hz.';
  } else if (parsed < BASE_FREQ_MIN) {
    parsed = BASE_FREQ_MIN;
    note = 'Minimum is ' + BASE_FREQ_MIN + ' Hz. Set to ' + parsed + ' Hz.';
  } else if (parsed > BASE_FREQ_MAX) {
    parsed = BASE_FREQ_MAX;
    note = 'Maximum is ' + BASE_FREQ_MAX + ' Hz. Set to ' + parsed + ' Hz.';
  }
  showBaseFreqMessage(note);
  baseFreq = parsed;

  var baseFreqInput = document.getElementById('baseFreq');
  if (baseFreqInput && parseFloat(baseFreqInput.value) !== baseFreq) {
    baseFreqInput.value = baseFreq;
  }

  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('baseFreq', baseFreq);
    }
  } catch (e) {}

  syncHarmonicButtons();
  renderLegend();
  updateLiveReadouts();

  if (isCurrentlyPlaying()) {
    var slider = document.getElementById('slider');
    var currentPos = slider ? parseInt(slider.value, 10) || 0 : timeStart;
    stop(true);
    timeStart = currentPos;
    start(true);
  }
}

var isTestingStereo = false;

function testStereo() {
  if (isTestingStereo) return;
  if (!context && isAudioSupported) {
    try {
      context = createAudioContext();
    } catch (e) {}
  }
  if (!context) return;

  if (context.state === 'suspended') {
    context.resume();
  }

  // If binaural session is currently playing, stop it so L/R test tones are isolated
  if (isCurrentlyPlaying()) {
    stop();
    // stop() suspends the context; resume it for the test tones (resume is ordered after suspend).
    context.resume();
  }

  isTestingStereo = true;

  var testBtn = document.getElementById('testStereoBtn');
  var headerTestBtn = document.getElementById('headerTestStereoBtn');
  var stereoStatus = document.getElementById('stereoStatus');
  var leftPill = document.getElementById('leftChannelPill');
  var rightPill = document.getElementById('rightChannelPill');
  var audioStatus = document.getElementById('audioStatus');
  var statusText = audioStatus ? audioStatus.querySelector('.status-text') : null;

  if (testBtn) testBtn.disabled = true;
  if (headerTestBtn) headerTestBtn.disabled = true;

  var t = context.currentTime;

  function playIsolatedTone(freq, panChannel, startTime, duration) {
    var dur = duration || 0.7;
    var toneOsc = context.createOscillator();
    var toneGain = context.createGain();
    var toneMerger = context.createChannelMerger(2);

    toneOsc.type = 'sine';
    toneOsc.frequency.setValueAtTime(freq, startTime);

    toneGain.gain.setValueAtTime(0.001, startTime);
    toneGain.gain.exponentialRampToValueAtTime(0.25, startTime + 0.08);
    toneGain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

    toneOsc.connect(toneGain);
    toneGain.connect(toneMerger, 0, panChannel); // 0 = Left, 1 = Right
    toneMerger.connect(context.destination);

    toneOsc.onended = function () {
      try {
        toneOsc.disconnect();
        toneGain.disconnect();
        toneMerger.disconnect();
      } catch (e) {}
    };

    toneOsc.start(startTime);
    toneOsc.stop(startTime + dur + 0.08);
  }

  // Phase 1: Left Ear (440 Hz A4)
  playIsolatedTone(440, 0, t + 0.1, 0.7);
  if (leftPill) leftPill.classList.add('active-left');
  if (rightPill) rightPill.classList.remove('active-right');
  if (stereoStatus) {
    stereoStatus.textContent = 'Playing: 440 Hz in LEFT ear...';
    stereoStatus.className = 'stereo-status visible status-left';
  }
  if (audioStatus) {
    audioStatus.classList.remove('playing', 'testing-right');
    audioStatus.classList.add('testing-left');
    if (statusText) statusText.textContent = 'LEFT Ear • 440 Hz';
  }

  // Phase 2: Right Ear (554 Hz C#5)
  playIsolatedTone(554, 1, t + 1.1, 0.7);
  setTimeout(function () {
    if (leftPill) leftPill.classList.remove('active-left');
    if (rightPill) rightPill.classList.add('active-right');
    if (stereoStatus) {
      stereoStatus.textContent = 'Playing: 554 Hz in RIGHT ear...';
      stereoStatus.className = 'stereo-status visible status-right';
    }
    if (audioStatus) {
      audioStatus.classList.remove('testing-left');
      audioStatus.classList.add('testing-right');
      if (statusText) statusText.textContent = 'RIGHT Ear • 554 Hz';
    }
  }, 1050);

  // Phase 3: Complete
  setTimeout(function () {
    if (leftPill) leftPill.classList.remove('active-left');
    if (rightPill) rightPill.classList.remove('active-right');
    if (stereoStatus) {
      stereoStatus.textContent = '✓ Stereo isolation verified! Ready for entrainment.';
      stereoStatus.className = 'stereo-status visible status-verified';
    }
    if (audioStatus) {
      audioStatus.classList.remove('testing-left', 'testing-right');
      if (!isCurrentlyPlaying() && statusText) {
        statusText.textContent = 'Idle';
      }
    }
    if (testBtn) testBtn.disabled = false;
    if (headerTestBtn) headerTestBtn.disabled = false;
    isTestingStereo = false;
  }, 2200);
}

function openSettings() {
  var selectProgram = document.getElementById('selectProgram');
  var settingsModal = document.getElementById('settings');
  if (selectProgram) {
    selectProgram.value = currentProgram;
  }
  updatePwaStatusUI();
  if (settingsModal) {
    settingsModal.style.display = 'flex';
    trapFocus(settingsModal, document.getElementById('menu'));
  }
  clientResize();
}

function closeSettings() {
  var settingsModal = document.getElementById('settings');
  if (settingsModal) {
    settingsModal.style.display = 'none';
    releaseFocus(settingsModal);
  }
  clientResize();
}

// ==========================================
// Custom Preset Studio
// ==========================================

var STUDIO_TEMPLATES = {
  'theta-flow': {
    name: 'Deep Theta Flow',
    durationMin: 20,
    carrierFreq: 216,
    description: 'Smooth Alpha to Theta meditation ramp for creative insight and deep calm (20 minutes)',
    voices: [
      [
        { time: 0, freq: 10.0 },
        { time: 240, freq: 6.0 },
        { time: 600, freq: 4.5 },
        { time: 960, freq: 6.0 },
        { time: 1200, freq: 10.0 }
      ]
    ]
  },
  'delta-sleep': {
    name: 'Delta Sleep Ramp',
    durationMin: 45,
    carrierFreq: 108,
    description: 'Gradual descent from Theta into deep restorative Delta sleep (45 minutes)',
    voices: [
      [
        { time: 0, freq: 8.0 },
        { time: 300, freq: 4.0 },
        { time: 900, freq: 2.0 },
        { time: 2700, freq: 1.5 }
      ]
    ]
  },
  'alpha-focus': {
    name: 'Alpha Flow State',
    durationMin: 30,
    carrierFreq: 432,
    description: 'Steady 10 Hz Alpha wave for relaxed alertness, reading, and effortless flow (30 minutes)',
    voices: [
      [
        { time: 0, freq: 8.0 },
        { time: 240, freq: 10.5 },
        { time: 900, freq: 12.0 },
        { time: 1560, freq: 10.5 },
        { time: 1800, freq: 8.0 }
      ]
    ]
  },
  'gamma-insight': {
    name: 'Gamma Peak Focus',
    durationMin: 15,
    carrierFreq: 300,
    description: 'High-energy Beta to 40 Hz Gamma cognitive synthesis protocol (15 minutes)',
    voices: [
      [
        { time: 0, freq: 14.0 },
        { time: 150, freq: 40.0 },
        { time: 750, freq: 40.0 },
        { time: 900, freq: 14.0 }
      ]
    ]
  },
  'dual-chord': {
    name: 'Harmonic Dual-Voice Chord',
    durationMin: 25,
    carrierFreq: 216,
    description: 'Dual-voice Theta (6 Hz) and Alpha (10.5 Hz) harmonic entrainment (25 minutes)',
    voices: [
      [
        { time: 0, freq: 8.0 },
        { time: 200, freq: 5.5 },
        { time: 1300, freq: 5.5 },
        { time: 1500, freq: 8.0 }
      ],
      [
        { time: 0, freq: 12.0 },
        { time: 200, freq: 10.5 },
        { time: 750, freq: 13.5 },
        { time: 1300, freq: 10.5 },
        { time: 1500, freq: 12.0 }
      ]
    ]
  }
};

var studioState = {
  id: null,
  activeTemplate: 'theta-flow',
  name: STUDIO_TEMPLATES['theta-flow'].name,
  durationMin: STUDIO_TEMPLATES['theta-flow'].durationMin,
  carrierFreq: STUDIO_TEMPLATES['theta-flow'].carrierFreq,
  description: STUDIO_TEMPLATES['theta-flow'].description,
  voices: cloneVoicesArray(STUDIO_TEMPLATES['theta-flow'].voices)
};

var savedPresets = [];

function cloneVoicesArray(voices) {
  var out = [];
  for (var i = 0; i < voices.length; ++i) {
    var pts = [];
    for (var j = 0; j < voices[i].length; ++j) {
      pts.push({
        time: Math.max(0, Math.round(Number(voices[i][j].time) || 0)),
        freq: Math.max(0.5, Math.min(80, parseFloat(Number(voices[i][j].freq || 10).toFixed(2))))
      });
    }
    out.push(pts);
  }
  return out;
}

function escapeXmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function loadSavedPresetsFromStorage() {
  savedPresets = [];
  try {
    if (typeof Storage !== 'undefined') {
      var raw = localStorage.getItem('binalityCustomPresets');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          savedPresets = parsed;
        }
      }
    }
  } catch (e) {
    savedPresets = [];
  }
  syncSavedPresetsSelect();
}

function persistSavedPresets() {
  try {
    if (typeof Storage !== 'undefined') {
      localStorage.setItem('binalityCustomPresets', JSON.stringify(savedPresets));
    }
  } catch (e) {}
  syncSavedPresetsSelect();
}

function findSavedPresetById(id) {
  for (var i = 0; i < savedPresets.length; ++i) {
    if (savedPresets[i].id === id) {
      return savedPresets[i];
    }
  }
  return null;
}

function syncSavedPresetsSelect() {
  var selectProgram = document.getElementById('selectProgram');
  if (!selectProgram) return;

  var existingGroup = document.getElementById('savedPresetsOptgroup');
  if (existingGroup && existingGroup.parentNode) {
    existingGroup.parentNode.removeChild(existingGroup);
  }

  if (savedPresets.length > 0) {
    var group = document.createElement('optgroup');
    group.id = 'savedPresetsOptgroup';
    group.label = 'My Saved Presets';

    for (var i = 0; i < savedPresets.length; ++i) {
      var opt = document.createElement('option');
      opt.value = 'saved:' + savedPresets[i].id;
      opt.textContent =
        savedPresets[i].name + ' (' + (savedPresets[i].durationMin || 15) + ' min)';
      group.appendChild(opt);
    }

    var firstGroup = selectProgram.querySelector('optgroup');
    if (firstGroup) {
      selectProgram.insertBefore(group, firstGroup);
    } else {
      selectProgram.appendChild(group);
    }
  }

  if (currentProgram && selectProgram.value !== currentProgram) {
    if (currentProgram.indexOf('saved:') === 0 && !findSavedPresetById(currentProgram.substring(6))) {
      currentProgram = 'programs/relaxation.xml';
      try {
        if (typeof Storage !== 'undefined') {
          localStorage.setItem('currentProgram', currentProgram);
        }
      } catch (e) {}
    }
    selectProgram.value = currentProgram;
  }
}

function showStudioStatus(message, isSuccess) {
  var msgEl = document.getElementById('studioStatusMsg');
  if (!msgEl) return;
  msgEl.textContent = message;
  msgEl.className = 'studio-status-msg' + (isSuccess ? ' status-success' : '');
}

function clearStudioStatus() {
  var msgEl = document.getElementById('studioStatusMsg');
  if (!msgEl) return;
  msgEl.textContent = '';
  msgEl.className = 'studio-status-msg hidden';
}

function syncStudioMetaInputs() {
  var nameInput = document.getElementById('studioName');
  var durInput = document.getElementById('studioDurationMin');
  var carrierInput = document.getElementById('studioCarrierFreq');
  var descInput = document.getElementById('studioDescription');

  if (nameInput && nameInput.value !== studioState.name) {
    nameInput.value = studioState.name;
  }
  if (durInput && parseInt(durInput.value, 10) !== studioState.durationMin) {
    durInput.value = studioState.durationMin;
  }
  if (carrierInput && parseFloat(carrierInput.value) !== studioState.carrierFreq) {
    carrierInput.value = studioState.carrierFreq;
  }
  if (descInput && descInput.value !== studioState.description) {
    descInput.value = studioState.description;
  }

  var tplBtns = document.querySelectorAll('.studio-template-btn');
  for (var i = 0; i < tplBtns.length; ++i) {
    var key = tplBtns[i].getAttribute('data-studio-template');
    if (key && key === studioState.activeTemplate) {
      tplBtns[i].classList.add('active');
    } else if (tplBtns[i].id === 'studioCloneActiveBtn' && studioState.activeTemplate === 'cloned') {
      tplBtns[i].classList.add('active');
    } else {
      tplBtns[i].classList.remove('active');
    }
  }
}

function applyStudioTemplate(key) {
  var tpl = STUDIO_TEMPLATES[key];
  if (!tpl) return;
  studioState.id = null;
  studioState.activeTemplate = key;
  studioState.name = tpl.name;
  studioState.durationMin = tpl.durationMin;
  studioState.carrierFreq = tpl.carrierFreq;
  studioState.description = tpl.description;
  studioState.voices = cloneVoicesArray(tpl.voices);

  clearStudioStatus();
  syncStudioMetaInputs();
  renderStudioVoices();
  renderStudioPreview();
}

function cloneCurrentProgramToStudio() {
  var progName = (program && program.getAttribute('name')) || 'Active Program';
  var progDesc = (program && program.getAttribute('description')) || '';
  var durMin = Math.max(1, Math.min(180, Math.round((timeMax || 900) / 60)));
  var durSec = durMin * 60;

  var clonedVoices = [];
  if (voicesData && voicesData.length > 0) {
    for (var i = 0; i < voicesData.length; ++i) {
      var freqs = voicesData[i].frequencies || [];
      var pts = [];
      var scale = timeMax > 0 ? durSec / timeMax : 1;
      for (var j = 0; j < freqs.length; ++j) {
        pts.push({
          time: Math.max(0, Math.min(durSec, Math.round(freqs[j].time * scale))),
          freq: Math.max(0.5, Math.min(80, parseFloat(Number(freqs[j].value).toFixed(2))))
        });
      }
      if (pts.length >= 2) {
        clonedVoices.push(pts);
      }
    }
  }

  if (clonedVoices.length === 0) {
    clonedVoices = cloneVoicesArray(STUDIO_TEMPLATES['theta-flow'].voices);
  }

  studioState.id = null;
  studioState.activeTemplate = 'cloned';
  studioState.name = progName.indexOf('(Custom)') !== -1 ? progName : progName + ' (Custom)';
  studioState.durationMin = durMin;
  studioState.carrierFreq = baseFreq;
  studioState.description = progDesc || 'Customized binaural entrainment recipe (' + durMin + ' minutes)';
  studioState.voices = clonedVoices;

  syncStudioMetaInputs();
  renderStudioVoices();
  renderStudioPreview();
  showStudioStatus('Cloned "' + progName + '" into Studio for customization.', true);
}

function getNormalizedVoicePoints(points, durationSec) {
  var sorted = [];
  for (var i = 0; i < points.length; ++i) {
    sorted.push({
      time: Math.max(0, Math.min(durationSec, Math.round(Number(points[i].time) || 0))),
      freq: Math.max(0.5, Math.min(80, parseFloat(Number(points[i].freq || 10).toFixed(2))))
    });
  }
  sorted.sort(function (a, b) {
    return a.time - b.time;
  });

  if (sorted.length === 0) {
    return [
      { time: 0, freq: 10.0 },
      { time: durationSec, freq: 6.0 }
    ];
  }

  if (sorted[0].time > 0) {
    sorted.unshift({ time: 0, freq: sorted[0].freq });
  }
  if (sorted[sorted.length - 1].time < durationSec) {
    sorted.push({ time: durationSec, freq: sorted[sorted.length - 1].freq });
  }
  return sorted;
}

function buildStudioProgramXml() {
  var durationMin = Math.max(1, Math.min(180, parseInt(studioState.durationMin, 10) || 20));
  var durationSec = durationMin * 60;
  var nameAttr = escapeXmlAttr(studioState.name || 'Custom Entrainment Recipe');
  var descAttr = escapeXmlAttr(
    studioState.description || 'Custom binaural entrainment session (' + durationMin + ' minutes)'
  );
  var fadeSec = Math.min(10, Math.max(2, Math.floor(durationSec * 0.05)));

  var xmlLines = [];
  xmlLines.push('<program name="' + nameAttr + '" description="' + descAttr + '">');

  for (var v = 0; v < studioState.voices.length; ++v) {
    var normPts = getNormalizedVoicePoints(studioState.voices[v], durationSec);
    xmlLines.push('  <voice length="' + durationSec + '">');
    for (var p = 0; p < normPts.length; ++p) {
      xmlLines.push(
        '    <frequency time="' +
          normPts[p].time +
          '">' +
          normPts[p].freq.toFixed(2) +
          '</frequency>'
      );
    }
    xmlLines.push('    <volume time="0">0.0</volume>');
    xmlLines.push('    <volume time="' + fadeSec + '">1.0</volume>');
    xmlLines.push('    <volume time="' + Math.max(fadeSec + 1, durationSec - fadeSec) + '">1.0</volume>');
    xmlLines.push('    <volume time="' + durationSec + '">0.0</volume>');
    xmlLines.push('  </voice>');
  }

  xmlLines.push('</program>');
  return xmlLines.join('\n');
}

function renderStudioPreview() {
  var canvas = document.getElementById('studioPreviewCanvas');
  var statsEl = document.getElementById('studioPreviewStats');
  if (!canvas) return;

  var durationMin = Math.max(1, Math.min(180, parseInt(studioState.durationMin, 10) || 20));
  var durationSec = durationMin * 60;
  var minF = 999;
  var maxF = 0;

  for (var v = 0; v < studioState.voices.length; ++v) {
    for (var p = 0; p < studioState.voices[v].length; ++p) {
      var f = Number(studioState.voices[v][p].freq) || 0;
      if (f < minF) minF = f;
      if (f > maxF) maxF = f;
    }
  }
  if (minF > maxF) {
    minF = 6;
    maxF = 10;
  }

  if (statsEl) {
    var rangeText =
      Math.abs(maxF - minF) < 0.05
        ? maxF.toFixed(1) + ' Hz'
        : minF.toFixed(1) + '–' + maxF.toFixed(1) + ' Hz';
    statsEl.textContent =
      durationMin +
      ' min • ' +
      studioState.voices.length +
      (studioState.voices.length === 1 ? ' Voice' : ' Voices') +
      ' • ' +
      studioState.carrierFreq +
      ' Hz Carrier • ' +
      rangeText;
  }

  var stage = canvas.parentElement;
  var rect = stage ? stage.getBoundingClientRect() : canvas.getBoundingClientRect();
  var w = Math.max(260, Math.floor(rect.width || 640));
  var h = Math.max(110, Math.floor(rect.height || 136));
  var dpr = getCanvasDpr();

  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }

  var ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  var padL = 42;
  var padR = 18;
  var padT = 18;
  var padB = 24;
  var plotW = Math.max(10, w - padL - padR);
  var plotH = Math.max(10, h - padT - padB);
  var yMax = Math.max(15, Math.ceil((maxF + 3) / 5) * 5);

  function tToX(t) {
    return padL + (Math.max(0, Math.min(durationSec, t)) / durationSec) * plotW;
  }
  function fToY(f) {
    return padT + plotH - (Math.max(0, Math.min(yMax, f)) / yMax) * plotH;
  }

  // Subtle horizontal grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  var steps = 3;
  for (var g = 0; g <= steps; ++g) {
    var val = Math.round((yMax / steps) * g);
    var gy = fToY(val);
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(padL + plotW, gy);
    ctx.stroke();
    ctx.fillText(val + 'Hz', padL - 6, gy);
  }

  // Time labels along X axis
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  var tTicks = [0, 0.25, 0.5, 0.75, 1];
  for (var ti = 0; ti < tTicks.length; ++ti) {
    var sec = Math.round(durationSec * tTicks[ti]);
    var tx = tToX(sec);
    ctx.fillText(getTimeString(sec), tx, padT + plotH + 6);
  }

  // Plot each voice curve
  for (var vi = 0; vi < studioState.voices.length; ++vi) {
    var palette = VOICE_COLORS[vi % VOICE_COLORS.length];
    var strokeColor = palette.stroke || '#ff70d9';
    var pts = getNormalizedVoicePoints(studioState.voices[vi], durationSec);

    // Area fill
    var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, palette.fillTop);
    grad.addColorStop(1, palette.fillBottom);

    ctx.beginPath();
    for (var pi = 0; pi < pts.length; ++pi) {
      var x = tToX(pts[pi].time);
      var y = fToY(pts[pi].freq);
      if (pi === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(tToX(pts[pts.length - 1].time), padT + plotH);
    ctx.lineTo(tToX(pts[0].time), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing Stroke line
    ctx.save();
    ctx.beginPath();
    for (var pk = 0; pk < pts.length; ++pk) {
      var lx = tToX(pts[pk].time);
      var ly = fToY(pts[pk].freq);
      if (pk === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // User keyframe dots & frequency labels
    var rawPts = studioState.voices[vi];
    for (var rp = 0; rp < rawPts.length; ++rp) {
      var dx = tToX(rawPts[rp].time);
      var dy = fToY(rawPts[rp].freq);
      ctx.beginPath();
      ctx.arc(dx, dy, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#080417';
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      var freqStr =
        rawPts[rp].freq % 1 === 0 ? rawPts[rp].freq.toFixed(0) + 'Hz' : rawPts[rp].freq.toFixed(1) + 'Hz';
      ctx.font = '600 11px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = rp === 0 ? 'left' : rp === rawPts.length - 1 ? 'right' : 'center';
      var labelY = dy - 9 < padT + 4 ? dy + 11 : dy - 9;
      ctx.textBaseline = 'middle';
      ctx.fillText(freqStr, dx, labelY);
    }
  }
}

function renderStudioVoices() {
  var listEl = document.getElementById('studioVoicesList');
  if (!listEl) return;

  var durationMin = Math.max(1, Math.min(180, parseInt(studioState.durationMin, 10) || 20));
  var durationSec = durationMin * 60;
  var html = '';

  for (var vIdx = 0; vIdx < studioState.voices.length; ++vIdx) {
    var palette = VOICE_COLORS[vIdx % VOICE_COLORS.length];
    var strokeColor = palette.stroke || '#ff70d9';
    var pts = studioState.voices[vIdx];

    html += '<div class="studio-voice-card" data-voice-idx="' + vIdx + '">';
    html += '  <div class="studio-voice-header">';
    html += '    <div class="studio-voice-title">';
    html +=
      '      <span class="voice-dot" style="background:' +
      strokeColor +
      ';box-shadow:0 0 8px ' +
      strokeColor +
      '"></span>';
    html += '      <span>Voice ' + (vIdx + 1) + '</span>';
    html += '      <span class="studio-time-mmss">(' + pts.length + ' keyframes)</span>';
    html += '    </div>';
    html += '    <div class="studio-voice-actions">';
    html +=
      '      <button type="button" class="studio-point-add-btn" data-add-point-voice="' +
      vIdx +
      '">+ Add Point</button>';
    if (studioState.voices.length > 1) {
      html +=
        '      <button type="button" class="studio-voice-remove-btn" data-remove-voice="' +
        vIdx +
        '">Remove Voice</button>';
    }
    html += '    </div>';
    html += '  </div>';

    html += '  <div class="studio-points-list">';
    for (var pIdx = 0; pIdx < pts.length; ++pIdx) {
      var pt = pts[pIdx];
      var band = getBrainwaveBand(pt.freq);
      var sliderVal = Math.max(0.5, Math.min(45, pt.freq));

      html += '    <div class="studio-point-row" data-voice="' + vIdx + '" data-point="' + pIdx + '">';
      html += '      <div class="studio-point-time">';
      html += '        <label>Time (s)</label>';
      html +=
        '        <input type="number" inputmode="decimal" autocomplete="off" class="studio-time-input" min="0" max="' +
        durationSec +
        '" step="5" value="' +
        pt.time +
        '" data-voice="' +
        vIdx +
        '" data-point="' +
        pIdx +
        '">';
      html +=
        '        <span class="studio-time-mmss" data-mmss-voice="' +
        vIdx +
        '" data-mmss-point="' +
        pIdx +
        '">' +
        getTimeString(pt.time) +
        '</span>';
      html += '      </div>';

      html += '      <div class="studio-point-freq">';
      html += '        <label>Beat (Hz)</label>';
      html +=
        '        <input type="number" inputmode="decimal" autocomplete="off" class="studio-freq-input" min="0.5" max="80" step="0.5" value="' +
        pt.freq +
        '" data-voice="' +
        vIdx +
        '" data-point="' +
        pIdx +
        '">';
      html +=
        '        <input type="range" class="studio-freq-slider" min="0.5" max="45" step="0.5" value="' +
        sliderVal +
        '" data-voice="' +
        vIdx +
        '" data-point="' +
        pIdx +
        '">';
      html +=
        '        <span class="studio-band-pill" data-band-voice="' +
        vIdx +
        '" data-band-point="' +
        pIdx +
        '" style="color:' +
        band.color +
        ';border-color:' +
        band.color +
        '">' +
        band.name +
        '</span>';
      html += '      </div>';

      if (pts.length > 2) {
        html +=
          '      <button type="button" class="studio-point-del-btn" title="Remove keyframe" data-del-voice="' +
          vIdx +
          '" data-del-point="' +
          pIdx +
          '">&times;</button>';
      } else {
        html +=
          '      <button type="button" class="studio-point-del-btn" disabled title="Minimum 2 points per voice">&times;</button>';
      }
      html += '    </div>';
    }
    html += '  </div>';
    html += '</div>';
  }

  listEl.innerHTML = html;

  // Bind events for time inputs
  var timeInputs = listEl.querySelectorAll('.studio-time-input');
  for (var ti = 0; ti < timeInputs.length; ++ti) {
    timeInputs[ti].addEventListener('input', function () {
      var v = parseInt(this.getAttribute('data-voice'), 10);
      var p = parseInt(this.getAttribute('data-point'), 10);
      var maxSec = Math.max(1, parseInt(studioState.durationMin, 10) || 20) * 60;
      var val = Math.max(0, Math.min(maxSec, parseInt(this.value, 10) || 0));
      studioState.voices[v][p].time = val;
      var mmss = listEl.querySelector(
        '[data-mmss-voice="' + v + '"][data-mmss-point="' + p + '"]'
      );
      if (mmss) mmss.textContent = getTimeString(val);
      renderStudioPreview();
    });
  }

  // Bind events for frequency numeric inputs
  var freqInputs = listEl.querySelectorAll('.studio-freq-input');
  for (var fi = 0; fi < freqInputs.length; ++fi) {
    freqInputs[fi].addEventListener('input', function () {
      var v = parseInt(this.getAttribute('data-voice'), 10);
      var p = parseInt(this.getAttribute('data-point'), 10);
      var val = parseFloat(this.value);
      if (isNaN(val)) val = 10;
      val = Math.max(0.5, Math.min(80, val));
      studioState.voices[v][p].freq = val;

      var row = this.closest('.studio-point-row');
      if (row) {
        var slider = row.querySelector('.studio-freq-slider');
        if (slider) slider.value = Math.min(45, val);
      }
      var bandEl = listEl.querySelector(
        '[data-band-voice="' + v + '"][data-band-point="' + p + '"]'
      );
      if (bandEl) {
        var band = getBrainwaveBand(val);
        bandEl.textContent = band.name;
        bandEl.style.color = band.color;
        bandEl.style.borderColor = band.color;
      }
      renderStudioPreview();
    });
  }

  // Bind events for frequency range sliders
  var freqSliders = listEl.querySelectorAll('.studio-freq-slider');
  for (var fs = 0; fs < freqSliders.length; ++fs) {
    freqSliders[fs].addEventListener('input', function () {
      var v = parseInt(this.getAttribute('data-voice'), 10);
      var p = parseInt(this.getAttribute('data-point'), 10);
      var val = parseFloat(this.value) || 10;
      studioState.voices[v][p].freq = val;

      var row = this.closest('.studio-point-row');
      if (row) {
        var numInput = row.querySelector('.studio-freq-input');
        if (numInput) numInput.value = val;
      }
      var bandEl = listEl.querySelector(
        '[data-band-voice="' + v + '"][data-band-point="' + p + '"]'
      );
      if (bandEl) {
        var band = getBrainwaveBand(val);
        bandEl.textContent = band.name;
        bandEl.style.color = band.color;
        bandEl.style.borderColor = band.color;
      }
      renderStudioPreview();
    });
  }

  // Add point buttons
  var addPtBtns = listEl.querySelectorAll('[data-add-point-voice]');
  for (var ap = 0; ap < addPtBtns.length; ++ap) {
    addPtBtns[ap].addEventListener('click', function () {
      var v = parseInt(this.getAttribute('data-add-point-voice'), 10);
      var pts = studioState.voices[v];
      var maxSec = Math.max(1, parseInt(studioState.durationMin, 10) || 20) * 60;
      var newTime = Math.round(maxSec / 2);
      var newFreq = 8.0;
      if (pts.length >= 2) {
        var prev = pts[pts.length - 2];
        var last = pts[pts.length - 1];
        newTime = Math.round((prev.time + last.time) / 2);
        newFreq = parseFloat(((prev.freq + last.freq) / 2).toFixed(1));
        pts.splice(pts.length - 1, 0, { time: newTime, freq: newFreq });
      } else {
        pts.push({ time: maxSec, freq: newFreq });
      }
      renderStudioVoices();
      renderStudioPreview();
    });
  }

  // Delete point buttons
  var delPtBtns = listEl.querySelectorAll('[data-del-voice]');
  for (var dp = 0; dp < delPtBtns.length; ++dp) {
    delPtBtns[dp].addEventListener('click', function () {
      var v = parseInt(this.getAttribute('data-del-voice'), 10);
      var p = parseInt(this.getAttribute('data-del-point'), 10);
      if (studioState.voices[v] && studioState.voices[v].length > 2) {
        studioState.voices[v].splice(p, 1);
        renderStudioVoices();
        renderStudioPreview();
      }
    });
  }

  // Remove voice buttons
  var remVoiceBtns = listEl.querySelectorAll('[data-remove-voice]');
  for (var rv = 0; rv < remVoiceBtns.length; ++rv) {
    remVoiceBtns[rv].addEventListener('click', function () {
      var v = parseInt(this.getAttribute('data-remove-voice'), 10);
      if (studioState.voices.length > 1) {
        studioState.voices.splice(v, 1);
        renderStudioVoices();
        renderStudioPreview();
      }
    });
  }
}

function renderSavedPresetsList() {
  var listEl = document.getElementById('studioSavedList');
  var countEl = document.getElementById('studioSavedCount');
  if (!listEl) return;

  if (countEl) {
    countEl.textContent = savedPresets.length;
  }

  if (savedPresets.length === 0) {
    listEl.innerHTML =
      '<div class="studio-empty-saved">No custom presets saved yet. Design a curve above and click "Save to My Presets".</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < savedPresets.length; ++i) {
    var item = savedPresets[i];
    var vCount = item.voices ? item.voices.length : 1;
    html += '<div class="studio-saved-item">';
    html += '  <div class="studio-saved-info">';
    html += '    <span class="studio-saved-name">' + escapeXmlAttr(item.name) + '</span>';
    html +=
      '    <span class="studio-saved-meta">' +
      (item.durationMin || 20) +
      ' min • ' +
      vCount +
      (vCount === 1 ? ' Voice' : ' Voices') +
      ' • ' +
      (item.carrierFreq || 216) +
      ' Hz Carrier</span>';
    html += '  </div>';
    html += '  <div class="studio-saved-actions">';
    html +=
      '    <button type="button" class="studio-saved-load-btn" data-load-preset="' +
      item.id +
      '">Load in Studio</button>';
    html +=
      '    <button type="button" class="studio-saved-load-btn" data-play-preset="' +
      item.id +
      '">Activate</button>';
    html +=
      '    <button type="button" class="studio-saved-del-btn" data-delete-preset="' +
      item.id +
      '">Delete</button>';
    html += '  </div>';
    html += '</div>';
  }

  listEl.innerHTML = html;

  var loadBtns = listEl.querySelectorAll('[data-load-preset]');
  for (var l = 0; l < loadBtns.length; ++l) {
    loadBtns[l].addEventListener('click', function () {
      var id = this.getAttribute('data-load-preset');
      var preset = findSavedPresetById(id);
      if (preset) {
        studioState.id = preset.id;
        studioState.activeTemplate = '';
        studioState.name = preset.name;
        studioState.durationMin = preset.durationMin || 20;
        studioState.carrierFreq = preset.carrierFreq || 216;
        studioState.description = preset.description || '';
        studioState.voices = cloneVoicesArray(preset.voices || STUDIO_TEMPLATES['theta-flow'].voices);
        syncStudioMetaInputs();
        renderStudioVoices();
        renderStudioPreview();
        showStudioStatus('Loaded "' + preset.name + '" into editor.', true);
      }
    });
  }

  var playBtns = listEl.querySelectorAll('[data-play-preset]');
  for (var pb = 0; pb < playBtns.length; ++pb) {
    playBtns[pb].addEventListener('click', function () {
      var id = this.getAttribute('data-play-preset');
      var preset = findSavedPresetById(id);
      if (preset) {
        changeProgram('saved:' + preset.id);
        closeStudio();
      }
    });
  }

  var delBtns = listEl.querySelectorAll('[data-delete-preset]');
  for (var d = 0; d < delBtns.length; ++d) {
    delBtns[d].addEventListener('click', function () {
      var id = this.getAttribute('data-delete-preset');
      var target = findSavedPresetById(id);
      confirmAction(
        {
          title: 'Delete preset?',
          message: target ? '"' + target.name + '" will be removed from My Saved Presets. This cannot be undone.' : 'This cannot be undone.',
          confirmLabel: 'Delete'
        },
        function () {
          deleteSavedPreset(id);
        }
      );
    });
  }
}

function deleteSavedPreset(id) {
  for (var k = 0; k < savedPresets.length; ++k) {
    if (savedPresets[k].id === id) {
      var removedName = savedPresets[k].name;
      savedPresets.splice(k, 1);
      persistSavedPresets();
      renderSavedPresetsList();
      showStudioStatus('Deleted "' + removedName + '" from My Saved Presets.', false);
      clearUrlPresetHash();
      if (currentProgram === 'saved:' + id) {
        changeProgram('programs/relaxation.xml');
      }
      break;
    }
  }
}

function saveStudioPreset() {
  var xmlText = buildStudioProgramXml();
  var presetId = studioState.id;

  // Check if a preset with the exact same name already exists
  for (var i = 0; i < savedPresets.length; ++i) {
    if (
      savedPresets[i].id === presetId ||
      savedPresets[i].name.toLowerCase() === (studioState.name || '').trim().toLowerCase()
    ) {
      presetId = savedPresets[i].id;
      break;
    }
  }

  if (!presetId) {
    presetId = 'preset-' + Date.now();
  }

  studioState.id = presetId;
  var record = {
    id: presetId,
    name: (studioState.name || 'Custom Entrainment Recipe').trim(),
    durationMin: Math.max(1, Math.min(180, parseInt(studioState.durationMin, 10) || 20)),
    carrierFreq: Math.max(20, Math.min(2000, parseFloat(studioState.carrierFreq) || 216)),
    description: (studioState.description || '').trim(),
    voices: cloneVoicesArray(studioState.voices),
    xml: xmlText
  };

  var updated = false;
  for (var j = 0; j < savedPresets.length; ++j) {
    if (savedPresets[j].id === presetId) {
      savedPresets[j] = record;
      updated = true;
      break;
    }
  }
  if (!updated) {
    savedPresets.unshift(record);
  }

  persistSavedPresets();
  renderSavedPresetsList();

  applyBaseFrequency(record.carrierFreq);
  applyProgramXmlText('saved:' + record.id, record.xml);
  showStudioStatus(
    '✓ Saved "' + record.name + '" to My Saved Presets & loaded into synthesizer!',
    true
  );
}

function applyStudioRecipe() {
  clearUrlPresetHash();
  var xmlText = buildStudioProgramXml();
  var carrier = Math.max(20, Math.min(2000, parseFloat(studioState.carrierFreq) || 216));
  applyBaseFrequency(carrier);

  var parser = new DOMParser();
  var xmlDoc = parser.parseFromString(xmlText, 'application/xml');
  loadProgram(xmlDoc);

  var selectProgram = document.getElementById('selectProgram');
  if (studioState.id) {
    currentProgram = 'saved:' + studioState.id;
    try {
      if (typeof Storage !== 'undefined') {
        localStorage.setItem('currentProgram', currentProgram);
      }
    } catch (e) {}
    if (selectProgram) selectProgram.value = currentProgram;
  } else {
    currentProgram = 'custom';
    if (selectProgram) selectProgram.value = 'custom';
  }
  closeStudio();
}

function exportStudioXml() {
  var xmlText = buildStudioProgramXml();
  var slug = (studioState.name || 'binality-preset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'binality-preset';

  var blob = new Blob([xmlText], { type: 'application/xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = slug + '.xml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1500);

  showStudioStatus('✓ Exported "' + slug + '.xml" download.', true);
}

function encodePresetForUrl() {
  var payload = {
    n: studioState.name,
    d: studioState.durationMin,
    c: studioState.carrierFreq,
    s: studioState.description,
    v: studioState.voices
  };
  var json = JSON.stringify(payload);
  return btoa(encodeURIComponent(json));
}

function decodePresetFromUrl(encoded) {
  try {
    var json = decodeURIComponent(atob(encoded));
    var p = JSON.parse(json);
    if (!p || !Array.isArray(p.v) || p.v.length === 0) return null;
    return {
      name: String(p.n || 'Shared Entrainment Recipe'),
      durationMin: Math.max(1, Math.min(180, parseInt(p.d, 10) || 20)),
      carrierFreq: Math.max(20, Math.min(2000, parseFloat(p.c) || 216)),
      description: String(p.s || 'Shared custom binaural recipe'),
      voices: cloneVoicesArray(p.v)
    };
  } catch (e) {
    return null;
  }
}

function shareStudioLink() {
  try {
    var code = encodePresetForUrl();
    var baseUrl = window.location.href.split('#')[0];
    var shareUrl = baseUrl + '#preset=' + code;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(shareUrl)
        .then(function () {
          showStudioStatus('✓ Shareable preset URL copied to clipboard!', true);
        })
        .catch(function () {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, '', '#preset=' + code);
          } else {
            window.location.hash = 'preset=' + code;
          }
          showStudioStatus('✓ Shareable URL updated in your browser address bar!', true);
        });
    } else {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#preset=' + code);
      } else {
        window.location.hash = 'preset=' + code;
      }
      showStudioStatus('✓ Shareable URL updated in your browser address bar!', true);
    }
  } catch (e) {
    showStudioStatus('Unable to generate share link.', false);
  }
}

function checkUrlSharedPreset() {
  var hash = window.location.hash || '';
  if (hash.indexOf('#preset=') !== 0) return false;
  var encoded = hash.substring(8);
  var decoded = decodePresetFromUrl(encoded);
  if (!decoded) return false;

  studioState.id = null;
  studioState.activeTemplate = '';
  studioState.name = decoded.name;
  studioState.durationMin = decoded.durationMin;
  studioState.carrierFreq = decoded.carrierFreq;
  studioState.description = decoded.description;
  studioState.voices = decoded.voices;

  applyBaseFrequency(decoded.carrierFreq);
  var xmlText = buildStudioProgramXml();
  var parser = new DOMParser();
  loadProgram(parser.parseFromString(xmlText, 'application/xml'));
  currentProgram = 'custom';
  var selectProgram = document.getElementById('selectProgram');
  if (selectProgram) {
    selectProgram.value = 'custom';
  }
  clearUrlPresetHash();
  return true;
}

function openStudio() {
  var modal = document.getElementById('studioModal');
  if (!modal) return;
  modal.style.display = 'flex';
  trapFocus(modal, document.getElementById('headerStudioBtn') || document.getElementById('openStudioFromSettingsBtn'));
  clearStudioStatus();
  syncStudioMetaInputs();
  renderStudioVoices();
  renderSavedPresetsList();
  setTimeout(function () {
    renderStudioPreview();
  }, 20);
}

function closeStudio() {
  var modal = document.getElementById('studioModal');
  if (!modal) return;
  modal.style.display = 'none';
  releaseFocus(modal);
  clientResize();
}

// ==========================================================================
// PWA & 100% Offline Service Worker Management
// ==========================================================================

var pwaDeferredPrompt = null;
var swRegistration = null;

function initPwaServiceWorker() {
  if (
    'serviceWorker' in navigator &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('sw.js', { scope: './' })
        .then(function (reg) {
          swRegistration = reg;
          console.log('[Binality PWA] Service Worker registered with scope:', reg.scope);

          // Check for worker updates
          reg.addEventListener('updatefound', function () {
            var newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', function () {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showPwaUpdateToast(reg);
              }
            });
          });

          updatePwaStatusUI();
        })
        .catch(function (err) {
          console.warn('[Binality PWA] Service Worker registration failed:', err);
          updatePwaStatusUI();
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      window.location.reload();
    });
  } else {
    updatePwaStatusUI();
  }

  // Handle BeforeInstallPrompt for Android / Desktop Chrome / Edge
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pwaDeferredPrompt = e;
    var installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
      installBtn.classList.remove('hidden');
    }
  });

  window.addEventListener('appinstalled', function () {
    pwaDeferredPrompt = null;
    var installBtn = document.getElementById('pwaInstallBtn');
    if (installBtn) {
      installBtn.classList.add('hidden');
    }
    updatePwaStatusUI();
  });

  // Online / Offline state listeners
  window.addEventListener('online', function () {
    updatePwaStatusUI();
  });

  window.addEventListener('offline', function () {
    updatePwaStatusUI();
  });

  // Install button click
  var installBtn = document.getElementById('pwaInstallBtn');
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (pwaDeferredPrompt) {
        pwaDeferredPrompt.prompt();
        pwaDeferredPrompt.userChoice.then(function (choiceResult) {
          if (choiceResult && choiceResult.outcome === 'accepted') {
            console.log('[Binality PWA] User accepted the install prompt');
          }
          pwaDeferredPrompt = null;
          installBtn.classList.add('hidden');
        });
      }
    });
  }

  // Toast action buttons
  var reloadBtn = document.getElementById('pwaReloadBtn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', function () {
      if (swRegistration && swRegistration.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        window.location.reload();
      }
    });
  }

  var dismissBtn = document.getElementById('pwaDismissBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function () {
      var toast = document.getElementById('pwaUpdateToast');
      if (toast) toast.classList.add('hidden');
    });
  }
}

function updatePwaStatusUI() {
  var badge = document.getElementById('pwaStatusBadge');
  if (!badge) return;

  var isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (!navigator.onLine) {
    badge.textContent = '⚡ Offline Mode (Cached)';
    badge.className = 'timer-val-badge pwa-badge-offline';
    return;
  }

  if (isStandalone) {
    badge.textContent = '✓ Installed App (100% Offline)';
    badge.className = 'timer-val-badge pwa-badge-ready';
    return;
  }

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    badge.textContent = '✓ 100% Offline Ready';
    badge.className = 'timer-val-badge pwa-badge-ready';
  } else {
    badge.textContent = '✓ Offline Cache Active';
    badge.className = 'timer-val-badge pwa-badge-ready';
  }
}

function showPwaUpdateToast(reg) {
  var toast = document.getElementById('pwaUpdateToast');
  if (!toast) return;
  toast.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', function () {
  var menuBtn = document.getElementById('menu');
  var doneBtn = document.getElementById('done');
  var closeIconBtn = document.getElementById('closeSettingsIcon');
  var settingsBackdrop = document.getElementById('settingsBackdrop');
  var startBtn = document.getElementById('start');
  var selectProgram = document.getElementById('selectProgram');
  var selectCustom = document.getElementById('selectCustom');
  var slider = document.getElementById('slider');
  var baseFreqInput = document.getElementById('baseFreq');
  var testStereoBtn = document.getElementById('testStereoBtn');
  var headerTestStereoBtn = document.getElementById('headerTestStereoBtn');

  if (!isAudioSupported) {
    var titleEl = document.getElementById('title');
    if (titleEl) {
      titleEl.textContent = 'Web Audio API is not supported in this browser.';
    }
    return;
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', openSettings);
  }
  if (doneBtn) {
    doneBtn.addEventListener('click', closeSettings);
  }
  if (closeIconBtn) {
    closeIconBtn.addEventListener('click', closeSettings);
  }
  if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', closeSettings);
  }

  if (testStereoBtn) {
    testStereoBtn.addEventListener('click', testStereo);
  }
  if (headerTestStereoBtn) {
    headerTestStereoBtn.addEventListener('click', testStereo);
  }

  var chartDescEl = document.getElementById('chartDescription');
  if (chartDescEl) {
    chartDescEl.addEventListener('click', function () {
      this.classList.toggle('is-expanded');
      if (typeof clientResize === 'function') {
        clientResize();
      }
    });
  }

  // Mixer drawer (Compact/Medium only; the button is display:none elsewhere). Layout itself is pure CSS (MUX-LAYOUT-2).
  var mixerToggleEl = document.getElementById('mixerToggle');
  if (mixerToggleEl) {
    mixerToggleEl.addEventListener('click', function () {
      var dock = document.querySelector('.transport-dock');
      var open = !(dock && dock.classList.contains('mixer-open'));
      if (dock) {
        dock.classList.toggle('mixer-open', open);
      }
      mixerToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var studioModal = document.getElementById('studioModal');
      if (studioModal && studioModal.style.display !== 'none' && studioModal.style.display !== '') {
        closeStudio();
        return;
      }
      var settingsModal = document.getElementById('settings');
      if (settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '') {
        closeSettings();
      }
    }
  });

  if (startBtn) {
    startBtn.addEventListener('click', function () {
      if (!isCurrentlyPlaying()) {
        start();
      } else {
        stop();
      }
    });
  }

  if (selectProgram) {
    selectProgram.addEventListener('change', function () {
      clearUrlPresetHash();
      if (this.value === 'custom') {
        if (selectCustom) selectCustom.style.display = 'block';
      } else {
        if (selectCustom) selectCustom.style.display = 'none';
        changeProgram(this.value);
      }
    });
  }

  if (selectCustom) {
    selectCustom.addEventListener('change', function (e) {
      if (!e.target.files || !e.target.files[0]) return;
      var reader = new FileReader();
      reader.onload = function (event) {
        var parser = new DOMParser();
        loadProgram(parser.parseFromString(event.target.result, 'application/xml'));
        currentProgram = 'custom';
        clearUrlPresetHash();
      };
      reader.readAsText(e.target.files[0]);
    });
  }

  if (slider) {
    slider.addEventListener('input', function () {
      var t = parseInt(this.value, 10) || 0;
      var posEl = document.getElementById('divPosition');
      if (posEl) posEl.textContent = getTimeString(t);
      updateSliderFill();
      updateLiveReadouts(t);
      if (!isCurrentlyPlaying() && chart) {
        chart.replot();
      }
    });
    slider.addEventListener('change', onSliderChanged);
    slider.addEventListener('pointerdown', function () {
      sliderHeld = true;
    });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'change', 'blur'].forEach(function (evt) {
      slider.addEventListener(evt, function () {
        sliderHeld = false;
      });
    });
  }

  var btnViewCurve = document.getElementById('btnViewCurve');
  var btnViewWaveform = document.getElementById('btnViewWaveform');

  if (btnViewCurve) {
    btnViewCurve.addEventListener('click', function () {
      setStageView('curve');
    });
  }
  if (btnViewWaveform) {
    btnViewWaveform.addEventListener('click', function () {
      setStageView('waveform');
    });
  }

  var scopeModeBtns = document.querySelectorAll('.scope-mode-btn');
  for (var smb = 0; smb < scopeModeBtns.length; ++smb) {
    scopeModeBtns[smb].addEventListener('click', function () {
      var m = this.getAttribute('data-scope');
      setScopeMode(m);
    });
  }

  var scopeZoomBtns = document.querySelectorAll('.scope-zoom-btn');
  for (var szb = 0; szb < scopeZoomBtns.length; ++szb) {
    scopeZoomBtns[szb].addEventListener('click', function () {
      var z = this.getAttribute('data-zoom');
      setScopeZoom(z);
    });
  }

  var scopeChBtns = document.querySelectorAll('.scope-ch-btn');
  for (var scb = 0; scb < scopeChBtns.length; ++scb) {
    scopeChBtns[scb].addEventListener('click', function () {
      var ch = this.getAttribute('data-channel');
      toggleScopeChannel(ch);
    });
  }

  var headerModeBtn = document.getElementById('headerModeBtn');
  var btnModeBinaural = document.getElementById('btnModeBinaural');
  var btnModeIsochronic = document.getElementById('btnModeIsochronic');

  if (headerModeBtn) {
    headerModeBtn.addEventListener('click', function () {
      setEntrainmentMode(entrainmentMode === 'binaural' ? 'isochronic' : 'binaural');
    });
  }
  if (btnModeBinaural) {
    btnModeBinaural.addEventListener('click', function () {
      setEntrainmentMode('binaural');
    });
  }
  if (btnModeIsochronic) {
    btnModeIsochronic.addEventListener('click', function () {
      setEntrainmentMode('isochronic');
    });
  }

  if (baseFreqInput) {
    baseFreqInput.addEventListener('change', function () {
      applyBaseFrequency(this.value);
    });
    baseFreqInput.addEventListener('blur', function () {
      if (parseFloat(this.value) !== baseFreq) applyBaseFrequency(this.value);
    });
    baseFreqInput.addEventListener('input', function () {
      showBaseFreqMessage('');
    });
  }

  var harmonicBtns = document.querySelectorAll('.harmonic-btn');
  for (var i = 0; i < harmonicBtns.length; ++i) {
    harmonicBtns[i].addEventListener('click', function () {
      var freq = parseFloat(this.getAttribute('data-freq'));
      applyBaseFrequency(freq);
    });
  }

  var ambientSlider = document.getElementById('ambientSlider');
  var quickAmbientSlider = document.getElementById('quickAmbientSlider');

  if (ambientSlider) {
    ambientSlider.addEventListener('input', function () {
      setAmbientVolume(this.value);
    });
  }

  if (quickAmbientSlider) {
    quickAmbientSlider.addEventListener('input', function () {
      setAmbientVolume(this.value);
    });
  }

  var soundscapeBtns = document.querySelectorAll('.soundscape-btn');
  for (var s = 0; s < soundscapeBtns.length; ++s) {
    soundscapeBtns[s].addEventListener('click', function () {
      var mode = this.getAttribute('data-soundscape');
      setSoundscapePreset(mode);
    });
  }

  var volumeSlider = document.getElementById('volumeSlider');
  var quickToneSlider = document.getElementById('quickToneSlider');

  if (volumeSlider) {
    volumeSlider.addEventListener('input', function () {
      setToneVolume(this.value);
    });
  }

  if (quickToneSlider) {
    quickToneSlider.addEventListener('input', function () {
      setToneVolume(this.value);
    });
  }

  var toneVolBtns = document.querySelectorAll('.tone-vol-btn');
  for (var tv = 0; tv < toneVolBtns.length; ++tv) {
    toneVolBtns[tv].addEventListener('click', function () {
      var tvVal = parseFloat(this.getAttribute('data-tone-vol'));
      setToneVolume(tvVal);
    });
  }

  var timerSelect = document.getElementById('timerSelect');
  var quickTimerSelect = document.getElementById('quickTimerSelect');
  var chimeToggleBtn = document.getElementById('chimeToggleBtn');
  var previewChimeBtn = document.getElementById('previewChimeBtn');

  if (timerSelect) {
    timerSelect.addEventListener('change', function () {
      setTimerSetting(this.value);
    });
  }

  if (quickTimerSelect) {
    quickTimerSelect.addEventListener('change', function () {
      setTimerSetting(this.value);
    });
  }

  var timerPresetBtns = document.querySelectorAll('.timer-preset-btn');
  for (var tp = 0; tp < timerPresetBtns.length; ++tp) {
    timerPresetBtns[tp].addEventListener('click', function () {
      var tVal = this.getAttribute('data-timer');
      setTimerSetting(tVal);
    });
  }

  if (chimeToggleBtn) {
    chimeToggleBtn.addEventListener('click', function () {
      setChimeEnabled(!chimeEnabled);
    });
  }

  if (previewChimeBtn) {
    previewChimeBtn.addEventListener('click', function () {
      playChime(true);
    });
  }

  var headerBreathBtn = document.getElementById('headerBreathBtn');
  var breathSizeToggleBtn = document.getElementById('breathSizeToggleBtn');
  var breathCloseBtn = document.getElementById('breathCloseBtn');

  if (headerBreathBtn) {
    headerBreathBtn.addEventListener('click', toggleBreathPacer);
  }
  if (breathSizeToggleBtn) {
    breathSizeToggleBtn.addEventListener('click', toggleBreathCompact);
  }
  if (breathCloseBtn) {
    breathCloseBtn.addEventListener('click', function () {
      setBreathMode('off');
    });
  }

  var breathModeBtns = document.querySelectorAll('.breath-mode-btn');
  for (var bm = 0; bm < breathModeBtns.length; ++bm) {
    breathModeBtns[bm].addEventListener('click', function () {
      var bVal = this.getAttribute('data-breath');
      setBreathMode(bVal);
    });
  }

  var settingsBreathBtns = document.querySelectorAll('.settings-breath-btn');
  for (var sb = 0; sb < settingsBreathBtns.length; ++sb) {
    settingsBreathBtns[sb].addEventListener('click', function () {
      var bVal = this.getAttribute('data-breath');
      setBreathMode(bVal);
    });
  }

  // Custom Preset Studio Event Listeners
  var headerStudioBtn = document.getElementById('headerStudioBtn');
  var openStudioFromSettingsBtn = document.getElementById('openStudioFromSettingsBtn');
  var cloneToStudioBtn = document.getElementById('cloneToStudioBtn');
  var closeStudioIcon = document.getElementById('closeStudioIcon');
  var studioBackdrop = document.getElementById('studioBackdrop');
  var studioCloneActiveBtn = document.getElementById('studioCloneActiveBtn');
  var studioAddVoiceBtn = document.getElementById('studioAddVoiceBtn');
  var studioNameInput = document.getElementById('studioName');
  var studioDurationInput = document.getElementById('studioDurationMin');
  var studioCarrierInput = document.getElementById('studioCarrierFreq');
  var studioDescInput = document.getElementById('studioDescription');
  var studioExportXmlBtn = document.getElementById('studioExportXmlBtn');
  var studioShareLinkBtn = document.getElementById('studioShareLinkBtn');
  var studioSaveBtn = document.getElementById('studioSaveBtn');
  var studioApplyBtn = document.getElementById('studioApplyBtn');

  if (headerStudioBtn) {
    headerStudioBtn.addEventListener('click', openStudio);
  }
  if (openStudioFromSettingsBtn) {
    openStudioFromSettingsBtn.addEventListener('click', function () {
      closeSettings();
      openStudio();
    });
  }
  if (cloneToStudioBtn) {
    cloneToStudioBtn.addEventListener('click', function () {
      closeSettings();
      cloneCurrentProgramToStudio();
      openStudio();
    });
  }
  if (closeStudioIcon) {
    closeStudioIcon.addEventListener('click', closeStudio);
  }
  if (studioBackdrop) {
    studioBackdrop.addEventListener('click', closeStudio);
  }

  var studioTplBtns = document.querySelectorAll('[data-studio-template]');
  for (var st = 0; st < studioTplBtns.length; ++st) {
    studioTplBtns[st].addEventListener('click', function () {
      var tplKey = this.getAttribute('data-studio-template');
      applyStudioTemplate(tplKey);
    });
  }

  if (studioCloneActiveBtn) {
    studioCloneActiveBtn.addEventListener('click', cloneCurrentProgramToStudio);
  }

  if (studioNameInput) {
    studioNameInput.addEventListener('input', function () {
      studioState.name = this.value;
    });
  }

  if (studioDurationInput) {
    studioDurationInput.addEventListener('change', function () {
      var oldDurMin = Math.max(1, parseInt(studioState.durationMin, 10) || 20);
      var newDurMin = Math.max(1, Math.min(180, parseInt(this.value, 10) || 20));
      this.value = newDurMin;
      if (oldDurMin !== newDurMin) {
        var scale = (newDurMin * 60) / (oldDurMin * 60);
        for (var v = 0; v < studioState.voices.length; ++v) {
          for (var p = 0; p < studioState.voices[v].length; ++p) {
            studioState.voices[v][p].time = Math.round(studioState.voices[v][p].time * scale);
          }
        }
      }
      studioState.durationMin = newDurMin;
      renderStudioVoices();
      renderStudioPreview();
    });
  }

  if (studioCarrierInput) {
    studioCarrierInput.addEventListener('change', function () {
      var c = Math.max(20, Math.min(2000, parseFloat(this.value) || 216));
      this.value = c;
      studioState.carrierFreq = c;
      renderStudioPreview();
    });
  }

  if (studioDescInput) {
    studioDescInput.addEventListener('input', function () {
      studioState.description = this.value;
    });
  }

  if (studioAddVoiceBtn) {
    studioAddVoiceBtn.addEventListener('click', function () {
      if (studioState.voices.length >= 4) {
        showStudioStatus('Maximum of 4 simultaneous harmonic voices reached.', false);
        return;
      }
      var durSec = Math.max(1, parseInt(studioState.durationMin, 10) || 20) * 60;
      var baseVoice = studioState.voices[0] || [
        { time: 0, freq: 10 },
        { time: durSec, freq: 6 }
      ];
      var newVoice = [];
      for (var i = 0; i < baseVoice.length; ++i) {
        newVoice.push({
          time: baseVoice[i].time,
          freq: Math.min(80, parseFloat((baseVoice[i].freq * 1.5).toFixed(1)))
        });
      }
      studioState.voices.push(newVoice);
      renderStudioVoices();
      renderStudioPreview();
    });
  }

  if (studioExportXmlBtn) {
    studioExportXmlBtn.addEventListener('click', exportStudioXml);
  }
  if (studioShareLinkBtn) {
    studioShareLinkBtn.addEventListener('click', shareStudioLink);
  }
  if (studioSaveBtn) {
    studioSaveBtn.addEventListener('click', saveStudioPreset);
  }
  if (studioApplyBtn) {
    studioApplyBtn.addEventListener('click', applyStudioRecipe);
  }

  loadSavedPresetsFromStorage();

  try {
    if (typeof Storage !== 'undefined') {
      var savedProgram = localStorage.getItem('currentProgram');
      if (savedProgram !== null && savedProgram !== 'custom' && savedProgram.trim() !== '') {
        if (savedProgram.indexOf('saved:') === 0) {
          var checkPresetId = savedProgram.substring(6);
          if (!findSavedPresetById(checkPresetId)) {
            savedProgram = 'programs/relaxation.xml';
            localStorage.setItem('currentProgram', savedProgram);
          }
        }
        currentProgram = savedProgram;
      }
      var savedBaseFreq = localStorage.getItem('baseFreq');
      if (savedBaseFreq !== null) {
        var parsedFreq = parseFloat(savedBaseFreq);
        if (!isNaN(parsedFreq) && parsedFreq >= BASE_FREQ_MIN && parsedFreq <= BASE_FREQ_MAX) {
          baseFreq = parsedFreq;
          if (baseFreqInput) baseFreqInput.value = baseFreq;
        }
      }
      var savedAmbientType = localStorage.getItem('ambientType');
      if (savedAmbientType === 'pink' || savedAmbientType === 'rain' || savedAmbientType === 'wind') {
        ambientType = savedAmbientType;
      }
      var savedAmbientVol = localStorage.getItem('ambientVolume');
      if (savedAmbientVol !== null) {
        var parsedVol = parseFloat(savedAmbientVol);
        if (!isNaN(parsedVol) && parsedVol >= 0 && parsedVol <= 1) {
          ambientVolume = parsedVol;
          if (parsedVol > 0.01) {
            lastNonZeroAmbientVolume = parsedVol;
          }
        }
      }
      var savedToneVol = localStorage.getItem('toneVolume');
      if (savedToneVol !== null) {
        var parsedToneVol = parseFloat(savedToneVol);
        if (!isNaN(parsedToneVol) && parsedToneVol >= 0 && parsedToneVol <= 1) {
          toneVolume = parsedToneVol;
        }
      }
      var savedTimer = localStorage.getItem('timerSetting');
      if (savedTimer !== null) {
        var parsedSec = parseTimerSettingToSeconds(savedTimer);
        timerSetting = parsedSec > 0 ? savedTimer : '0';
        timerDurationSec = parsedSec;
        timerRemainingSec = parsedSec;
      }
      var savedChime = localStorage.getItem('chimeEnabled');
      if (savedChime === 'true' || savedChime === 'false') {
        chimeEnabled = savedChime === 'true';
      }
      var savedLastBreath = localStorage.getItem('lastActiveBreathMode');
      if (savedLastBreath && BREATH_PATTERNS[savedLastBreath]) {
        lastActiveBreathMode = savedLastBreath;
      }
      var savedBreathCompact = localStorage.getItem('breathCompact');
      if (savedBreathCompact === 'true' || savedBreathCompact === 'false') {
        breathCompact = savedBreathCompact === 'true';
      }
      var savedBreathMode = localStorage.getItem('breathMode');
      if (savedBreathMode && BREATH_PATTERNS[savedBreathMode]) {
        breathMode = savedBreathMode;
      }
      var savedMode = localStorage.getItem('entrainmentMode');
      if (savedMode === 'binaural' || savedMode === 'isochronic') {
        entrainmentMode = savedMode;
      }
      var savedStageView = localStorage.getItem('stageView');
      if (savedStageView === 'curve' || savedStageView === 'waveform') {
        activeStageView = savedStageView;
      }
      var savedScopeMode = localStorage.getItem('scopeMode');
      if (savedScopeMode === 'envelope' || savedScopeMode === 'oscilloscope' || savedScopeMode === 'orbit') {
        scopeMode = savedScopeMode;
      }
      var savedScopeZoom = localStorage.getItem('scopeZoom');
      if (savedScopeZoom === 'fast' || savedScopeZoom === 'med' || savedScopeZoom === 'slow') {
        scopeZoom = savedScopeZoom;
      }
    }
  } catch (e) {}

  loadSavedPosition(); // applied once (no autoplay) by the first loadProgram()
  syncHarmonicButtons();
  syncToneVolumeUI();
  syncAmbientUI();
  syncTimerUI();
  syncBreathUI();
  syncModeUI();
  setScopeMode(scopeMode);
  setScopeZoom(scopeZoom);
  setStageView(activeStageView);
  if (breathMode !== 'off' && BREATH_PATTERNS[breathMode]) {
    startBreathAnimation();
  }
  chart = createProgramChart();

  if (isPageReload()) {
    clearUrlPresetHash();
    changeProgram(currentProgram);
  } else if (!checkUrlSharedPreset()) {
    changeProgram(currentProgram);
  }

  if (typeof ResizeObserver !== 'undefined') {
    var chartEl = document.getElementById('chart');
    if (chartEl) {
      var ro = new ResizeObserver(function () {
        clientResize();
      });
      ro.observe(chartEl);
    }
  }

  initPwaServiceWorker();
  initMobileHud();
});

window.addEventListener('resize', function () {
  clientResize();
  var studioModal = document.getElementById('studioModal');
  if (studioModal && studioModal.style.display !== 'none' && studioModal.style.display !== '') {
    renderStudioPreview();
  }
});


// ==========================================================================
// Mobile HUD, accessibility, sheets and first-run notice (M1.5)
// ==========================================================================

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// ---- Sheets: focus trap, inert background, focus returns to the opener (MUX-VIS-6) ----
var sheetStack = [];
var FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisibleEl(el) {
  return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

function getFocusable(root) {
  var list = root.querySelectorAll(FOCUSABLE_SELECTOR);
  var out = [];
  for (var i = 0; i < list.length; ++i) {
    if (isVisibleEl(list[i])) out.push(list[i]);
  }
  return out;
}

function trapFocus(modal, opener) {
  if (!modal) return;
  for (var k = 0; k < sheetStack.length; ++k) {
    if (sheetStack[k].modal === modal) return;
  }
  var entry = { modal: modal, opener: opener || document.activeElement, inerted: [] };
  var kids = document.body.children;
  for (var i = 0; i < kids.length; ++i) {
    var el = kids[i];
    if (el === modal || el.tagName === 'SCRIPT' || el.contains(modal) || el.hasAttribute('inert')) continue;
    el.setAttribute('inert', '');
    entry.inerted.push(el);
  }
  sheetStack.push(entry);
  var focusables = getFocusable(modal);
  var target = modal.querySelector('[data-initial-focus]') || focusables[0];
  if (target) {
    setTimeout(function () {
      target.focus();
    }, 0);
  }
}

function releaseFocus(modal) {
  for (var i = sheetStack.length - 1; i >= 0; --i) {
    if (sheetStack[i].modal !== modal) continue;
    var entry = sheetStack.splice(i, 1)[0];
    for (var j = 0; j < entry.inerted.length; ++j) {
      entry.inerted[j].removeAttribute('inert');
    }
    var opener = entry.opener;
    if (opener && document.body.contains(opener) && typeof opener.focus === 'function') {
      setTimeout(function () {
        opener.focus();
      }, 0);
    }
    return;
  }
}

document.addEventListener('keydown', function (e) {
  if (!sheetStack.length) return;
  var top = sheetStack[sheetStack.length - 1].modal;
  if (e.key === 'Escape') {
    if (top.id === 'noticeModal' && !top.getAttribute('data-dismissable')) return;
    e.preventDefault();
    e.stopPropagation(); // the older window-level Escape handler must not also close the sheet underneath
    closeTopSheet(top);
    return;
  }
  if (e.key !== 'Tab') return;
  var f = getFocusable(top);
  if (!f.length) {
    e.preventDefault();
    return;
  }
  var first = f[0];
  var last = f[f.length - 1];
  if (!top.contains(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function closeTopSheet(top) {
  if (top.id === 'settings') closeSettings();
  else if (top.id === 'studioModal') closeStudio();
  else closeSheet(top);
}

function openSheet(sheet, opener) {
  if (!sheet) return;
  sheet.hidden = false;
  trapFocus(sheet, opener);
}

function closeSheet(sheet) {
  if (!sheet) return;
  sheet.hidden = true;
  releaseFocus(sheet);
}

// ---- Program quick-switch sheet (MUX-IN-7) ----
var programMetaCache = {};

function programMetaFromXml(xmlText) {
  var meta = { name: '', desc: '', mins: 0 };
  try {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var root = doc.documentElement;
    meta.name = root.getAttribute('name') || '';
    meta.desc = (root.getAttribute('description') || '').replace(/\s*\(\d+\s*minutes?\)\s*$/i, '');
    var voices = doc.getElementsByTagName('voice');
    var maxLen = 0;
    for (var i = 0; i < voices.length; ++i) {
      maxLen = Math.max(maxLen, parseFloat(voices[i].getAttribute('length')) || 0);
    }
    meta.mins = Math.round(maxLen / 60);
  } catch (e) {}
  return meta;
}

function loadProgramMeta(filename) {
  if (programMetaCache[filename]) return Promise.resolve(programMetaCache[filename]);
  var done = function (xmlText) {
    programMetaCache[filename] = programMetaFromXml(xmlText);
    return programMetaCache[filename];
  };
  if (BUILTIN_PROGRAMS_XML[filename]) return Promise.resolve(done(BUILTIN_PROGRAMS_XML[filename]));
  return fetch(filename)
    .then(function (r) {
      if (!r.ok) throw new Error('program');
      return r.text();
    })
    .then(done)
    .catch(function () {
      return { name: '', desc: '', mins: 0 };
    });
}

function buildProgramRow(value, name, desc, mins) {
  var li = document.createElement('li');
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'program-row';
  btn.setAttribute('data-program', value);
  if (value === currentProgram) {
    btn.setAttribute('aria-current', 'true');
    btn.classList.add('current');
  }
  var text = document.createElement('span');
  text.className = 'program-row-text';
  var n = document.createElement('span');
  n.className = 'program-row-name';
  n.textContent = name;
  text.appendChild(n);
  if (desc) {
    var d = document.createElement('span');
    d.className = 'program-row-desc';
    d.textContent = desc;
    text.appendChild(d);
  }
  btn.appendChild(text);
  if (mins) {
    var m = document.createElement('span');
    m.className = 'program-row-dur';
    m.textContent = mins + ' min';
    btn.appendChild(m);
  }
  li.appendChild(btn);
  return li;
}

function openProgramSheet() {
  var sheet = document.getElementById('programSheet');
  var list = document.getElementById('programSheetList');
  var select = document.getElementById('selectProgram');
  if (!sheet || !list || !select) return;
  list.innerHTML = '';
  var opener = document.getElementById('title');
  var opts = select.options;
  var rows = [];
  for (var i = 0; i < opts.length; ++i) {
    var v = opts[i].value;
    if (v === 'custom' || v.indexOf('programs/') !== 0) continue;
    var li = buildProgramRow(v, opts[i].textContent, '', 0);
    list.appendChild(li);
    rows.push({ value: v, li: li, label: opts[i].textContent });
  }
  var saved = typeof savedPresets !== 'undefined' ? savedPresets : [];
  for (var s2 = 0; s2 < saved.length; ++s2) {
    list.appendChild(buildProgramRow('saved:' + saved[s2].id, saved[s2].name, 'My saved preset', saved[s2].durationMin || 15));
  }
  openSheet(sheet, opener);
  if (opener) opener.setAttribute('aria-expanded', 'true');
  rows.forEach(function (r) {
    loadProgramMeta(r.value).then(function (meta) {
      var fresh = buildProgramRow(r.value, r.label, meta.desc, meta.mins);
      if (r.li.parentNode) r.li.parentNode.replaceChild(fresh, r.li);
      r.li = fresh;
    });
  });
  var cur = list.querySelector('.program-row.current');
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
}

function chooseProgram(value) {
  var sheet = document.getElementById('programSheet');
  var select = document.getElementById('selectProgram');
  closeSheet(sheet);
  var opener = document.getElementById('title');
  if (opener) opener.setAttribute('aria-expanded', 'false');
  if (value === currentProgram) return;
  if (select) select.value = value;
  changeProgram(value); // stops playback if running, never auto-starts
}

// ---- Slider value text and canvas labels (MUX-VIS-6) ----
function spokenDuration(totalSec) {
  var t = Math.max(0, Math.floor(totalSec));
  var h = Math.floor(t / 3600);
  var m = Math.floor((t % 3600) / 60);
  var sec = t % 60;
  var parts = [];
  if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
  if (m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
  if (sec || !parts.length) parts.push(sec + (sec === 1 ? ' second' : ' seconds'));
  return parts.join(' ');
}

function setSliderValueText(slider) {
  if (!slider || !slider.id) return;
  var text = '';
  var val = parseFloat(slider.value) || 0;
  if (slider.id === 'slider') {
    text = spokenDuration(val) + ' of ' + spokenDuration(parseFloat(slider.max) || 0);
  } else if (slider.id === 'quickToneSlider' || slider.id === 'volumeSlider') {
    text = 'Beats volume ' + Math.round(val * 100) + ' percent';
  } else if (slider.id === 'quickAmbientSlider' || slider.id === 'ambientSlider') {
    text = 'Ambient volume ' + Math.round(val * 100) + ' percent';
  } else {
    return;
  }
  if (slider.getAttribute('aria-valuetext') !== text) slider.setAttribute('aria-valuetext', text);
}

var canvasLabelPending = false;
function updateCanvasLabelsSoon() {
  if (canvasLabelPending) return;
  canvasLabelPending = true;
  setTimeout(function () {
    canvasLabelPending = false;
    var titleEl = document.getElementById('title');
    var badge = document.getElementById('liveFreqBadge');
    var prog = titleEl ? titleEl.textContent : 'Program';
    var hz = badge ? badge.textContent : '';
    var chartC = document.getElementById('chartCanvas');
    var waveC = document.getElementById('waveformCanvas');
    var chartLabel = prog + ' program, beat frequency over time. Now ' + hz;
    var waveLabel = prog + ' live waveform and beat envelope. Now ' + hz;
    if (chartC && chartC.getAttribute('aria-label') !== chartLabel) chartC.setAttribute('aria-label', chartLabel);
    if (waveC && waveC.getAttribute('aria-label') !== waveLabel) waveC.setAttribute('aria-label', waveLabel);
  }, 1000);
}

// ---- First-run notice (MUX-LIFE-10 / -12) ----
var NOTICE_KEY = 'binalityNoticeAck';

function noticeAcknowledged() {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function openNotice(fromSettings) {
  var modal = document.getElementById('noticeModal');
  var ack = document.getElementById('noticeAckBtn');
  var close = document.getElementById('noticeCloseBtn');
  if (!modal) return;
  var already = noticeAcknowledged();
  modal.setAttribute('data-dismissable', already ? 'true' : '');
  if (ack) ack.textContent = already ? 'OK' : 'I understand';
  if (close) close.hidden = true;
  openSheet(modal, fromSettings ? document.getElementById('showNoticeBtn') : null);
  var focusTarget = ack;
  if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 0);
}

function acknowledgeNotice() {
  try {
    localStorage.setItem(NOTICE_KEY, '1');
  } catch (e) {}
  closeSheet(document.getElementById('noticeModal'));
}

function openInfoSheet(opener) {
  var carrier = document.getElementById('infoCarrierVal');
  if (carrier) carrier.textContent = 'Currently ' + baseFreq + ' Hz.';
  openSheet(document.getElementById('infoSheet'), opener);
}

function initMobileHud() {
  // D21: 10 s test timer options are web/dev only
  if (isNativeApp()) {
    var dev = document.querySelectorAll('[data-dev-only]');
    for (var d = 0; d < dev.length; ++d) {
      if (dev[d].parentNode) dev[d].parentNode.removeChild(dev[d]);
    }
  }

  // Program title opens the quick-switch sheet
  var titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.setAttribute('aria-expanded', 'false');
    titleEl.addEventListener('click', openProgramSheet);
    titleEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProgramSheet();
      }
    });
  }
  var list = document.getElementById('programSheetList');
  if (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.program-row') : null;
      if (btn) chooseProgram(btn.getAttribute('data-program'));
    });
  }
  ['programSheet', 'infoSheet'].forEach(function (id) {
    var sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-sheet-close]')) {
        closeSheet(sheet);
        if (id === 'programSheet' && titleEl) titleEl.setAttribute('aria-expanded', 'false');
      }
    });
  });
  // Escape on the program sheet should also reset aria-expanded
  var progSheet = document.getElementById('programSheet');
  if (progSheet && window.MutationObserver) {
    new MutationObserver(function () {
      if (progSheet.hidden && titleEl) titleEl.setAttribute('aria-expanded', 'false');
    }).observe(progSheet, { attributes: true, attributeFilter: ['hidden'] });
  }

  // Info sheet buttons
  var infoBtn = document.getElementById('infoBtn');
  if (infoBtn) {
    infoBtn.addEventListener('click', function () {
      openInfoSheet(infoBtn);
    });
  }
  var settingsInfoBtn = document.getElementById('settingsInfoBtn');
  if (settingsInfoBtn) {
    settingsInfoBtn.addEventListener('click', function () {
      openInfoSheet(settingsInfoBtn);
    });
  }

  // Safety notice
  var ackBtn = document.getElementById('noticeAckBtn');
  if (ackBtn) ackBtn.addEventListener('click', acknowledgeNotice);
  var showBtn = document.getElementById('showNoticeBtn');
  if (showBtn) {
    showBtn.addEventListener('click', function () {
      openNotice(true);
    });
  }
  if (!noticeAcknowledged()) openNotice(false);

  // MUX-HUD-6: icon-only controls with a title get it as their accessible name too
  var titled = document.querySelectorAll('button[title], [role="button"][title], input[title], select[title]');
  for (var t = 0; t < titled.length; ++t) {
    var el = titled[t];
    if (el.id === 'title') continue;
    if (!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.textContent || '').trim()) {
      el.setAttribute('aria-label', el.getAttribute('title'));
    }
  }

  var sl = document.querySelectorAll('input[type="range"]');
  for (var r = 0; r < sl.length; ++r) setSliderValueText(sl[r]);
  updateCanvasLabelsSoon();
}
