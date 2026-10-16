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

var context = null;
var isAudioSupported = typeof window.AudioContext !== 'undefined';
try {
  if (isAudioSupported) {
    context = new AudioContext();
  }
} catch (e) {
  context = null;
}

var merger = [];
var gain = [];
var osc = [];

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
  slider.style.background =
    'linear-gradient(90deg, #ff70d9 0%, #a855f7 ' +
    pct.toFixed(2) +
    '%, rgba(255, 255, 255, 0.14) ' +
    pct.toFixed(2) +
    '%, rgba(255, 255, 255, 0.14) 100%)';
}

function updateLiveReadouts(t) {
  var currentT = typeof t === 'number' ? t : parseInt(document.getElementById('slider').value, 10) || 0;
  var liveFreqBadge = document.getElementById('liveFreqBadge');
  var activeBandBadge = document.getElementById('activeBandBadge');
  var carrierBadge = document.getElementById('carrierBadge');

  if (carrierBadge) {
    carrierBadge.textContent = baseFreq + ' Hz Carrier';
  }

  if (voicesData.length > 0) {
    var primaryFreq = getFrequency(voicesData[0], currentT);

    if (liveFreqBadge) {
      if (voicesData.length === 1) {
        liveFreqBadge.textContent = primaryFreq.toFixed(2).replace(/\.00$/, '.0') + ' Hz Beat';
      } else {
        var parts = [];
        for (var i = 0; i < Math.min(voicesData.length, 3); ++i) {
          parts.push(getFrequency(voicesData[i], currentT).toFixed(1) + ' Hz');
        }
        if (voicesData.length > 3) {
          parts.push('+' + (voicesData.length - 3) + ' more');
        }
        liveFreqBadge.textContent = parts.join(' • ');
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

  var html = '<div class="legend-voices">';
  for (var i = 0; i < voicesData.length; ++i) {
    var color = VOICE_COLORS[i % VOICE_COLORS.length];
    var f0 = getFrequency(voicesData[i], parseInt(document.getElementById('slider').value, 10) || 0);
    var label = voicesData.length > 1 ? 'Voice ' + (i + 1) : 'Beat Frequency';
    html +=
      '<span class="legend-item">' +
      '<span class="legend-swatch" style="background:' + color.stroke + '; box-shadow: 0 0 8px ' + color.stroke + ';"></span>' +
      '<span>' + label + ': <strong style="color:#fff;" data-voice-freq="' + i + '">' + f0.toFixed(1) + ' Hz</strong></span>' +
      '</span>';
  }
  html += '</div>';
  html +=
    '<div class="legend-hint">Left Ear: <strong style="color:#a5b4fc;">' +
    baseFreq +
    ' Hz</strong> • Right Ear: <strong style="color:#f9a8d4;">' +
    baseFreq +
    ' Hz + Beat</strong></div>';

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
    var padLeft = isCompact ? 38 : 48;
    var padRight = isCompact ? 16 : 24;
    var padTop = isCompact ? 16 : 22;
    var padBottom = isCompact ? 32 : 38;
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

    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
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
    ctx.font = '500 10px "JetBrains Mono", monospace';

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
      ctx.fillText(xVal + 's', px, padTop + plotH + 6);
    }

    ctx.fillStyle = 'rgba(203, 213, 225, 0.65)';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('frequency/time(s)', padLeft + plotW / 2, height - 13);

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

  function handlePointerMove(clientX, clientY) {
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
        var label = voicesData.length > 1 ? 'Voice ' + (i + 1) : 'Beat';
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
      var leftPos = x + 14;
      if (leftPos + tipRect.width > rect.width - 8) {
        leftPos = x - tipRect.width - 14;
      }
      var topPos = Math.max(8, Math.min(rect.height - tipRect.height - 8, y - tipRect.height / 2));
      tooltip.style.left = Math.max(8, leftPos) + 'px';
      tooltip.style.top = topPos + 'px';
    }

    replot();
  }

  canvas.addEventListener('mousemove', function (e) {
    handlePointerMove(e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseleave', function () {
    hoverTime = null;
    if (tooltip) tooltip.classList.add('hidden');
    replot();
  });

  canvas.addEventListener('click', function (e) {
    var rect = container.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var layout = getLayout(rect.width, rect.height);
    if (x >= layout.padLeft && x <= layout.padLeft + layout.plotW && timeMax > 0) {
      var ratio = (x - layout.padLeft) / layout.plotW;
      var seekSec = Math.max(0, Math.min(timeMax, Math.round(ratio * timeMax)));
      var slider = document.getElementById('slider');
      if (slider) {
        slider.value = seekSec;
        onSliderChanged();
      }
    }
  });

  return {
    replot: replot
  };
}

function clientResize() {
  if (chart !== null && typeof chart.replot === 'function') {
    chart.replot();
  }
}

function isCurrentlyPlaying() {
  var startBtn = document.getElementById('start');
  return startBtn ? startBtn.getAttribute('data-playing') === 'true' : false;
}

function setPlayingUI(playing) {
  var startBtn = document.getElementById('start');
  var audioStatus = document.getElementById('audioStatus');

  if (startBtn) {
    startBtn.textContent = playing ? 'stop' : 'start';
    startBtn.setAttribute('data-playing', playing ? 'true' : 'false');
    if (playing) {
      startBtn.classList.add('is-playing');
    } else {
      startBtn.classList.remove('is-playing');
    }
  }

  if (audioStatus) {
    var statusText = audioStatus.querySelector('.status-text');
    if (playing) {
      audioStatus.classList.add('playing');
      if (statusText) statusText.textContent = 'Synthesizing Stereo Audio';
    } else {
      audioStatus.classList.remove('playing');
      if (statusText) statusText.textContent = 'Idle';
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

  if (titleEl) titleEl.textContent = progName;
  if (nameEl) nameEl.textContent = progName;
  if (descEl) descEl.textContent = progDesc;
  if (chartDescEl) chartDescEl.textContent = progDesc;

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

  var slider = document.getElementById('slider');
  if (slider) {
    slider.setAttribute('max', timeMax);
    slider.value = 0;
  }

  timeStart = 0;
  var posEl = document.getElementById('divPosition');
  if (posEl) {
    posEl.textContent = getTimeString(0);
  }

  updateSliderFill();
  renderLegend();
  updateLiveReadouts(0);

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

function changeProgram(filename) {
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

function start() {
  if (!context && isAudioSupported) {
    try {
      context = new AudioContext();
    } catch (e) {}
  }
  if (!context || !program) return;

  if (context.state === 'suspended') {
    context.resume();
  }

  cleanupAudioNodes();
  setPlayingUI(true);

  merger = [];
  gain = [];
  osc = [];

  var slider = document.getElementById('slider');
  timeStart = slider ? parseInt(slider.value, 10) || 0 : 0;
  timeContext = context.currentTime;

  var voices = program.getElementsByTagName
    ? program.getElementsByTagName('voice')
    : program.querySelectorAll('voice');

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

    gain[i].left.gain.setValueAtTime(initialVol, timeContext);
    gain[i].right.gain.setValueAtTime(initialVol, timeContext);

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
        gain[i].left.gain.linearRampToValueAtTime(v, timeContext + (tv - timeStart));
        gain[i].right.gain.linearRampToValueAtTime(v, timeContext + (tv - timeStart));
      }
    }

    merger[i].connect(context.destination);
  }

  for (var m = 0; m < osc.length; ++m) {
    osc[m].left.start(0);
    osc[m].right.start(0);
  }

  if (chart) chart.replot();

  monitor = setInterval(function () {
    var t = parseInt(timeStart, 10) + Math.floor(context.currentTime - timeContext);
    var sliderEl = document.getElementById('slider');
    var posEl = document.getElementById('divPosition');

    if (t > timeMax) {
      if (sliderEl) sliderEl.value = 0;
      if (posEl) posEl.textContent = '0:00';
      updateSliderFill();
      updateLiveReadouts(0);
      stop();
    } else {
      if (sliderEl) sliderEl.value = t;
      if (posEl) posEl.textContent = getTimeString(t);
      updateSliderFill();
      updateLiveReadouts(t);
      if (chart) chart.replot();
    }
  }, 250);
}

function cleanupAudioNodes() {
  if (osc && osc.length > 0) {
    for (var i = 0; i < osc.length; ++i) {
      try {
        osc[i].left.stop();
        osc[i].left.disconnect();
      } catch (e) {}
      try {
        osc[i].right.stop();
        osc[i].right.disconnect();
      } catch (e) {}
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

function stop() {
  setPlayingUI(false);
  cleanupAudioNodes();
  if (chart) chart.replot();
}

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
    stop();
    timeStart = t;
    start();
  } else {
    timeStart = t;
    if (chart) chart.replot();
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

function applyBaseFrequency(newFreq) {
  var parsed = parseFloat(newFreq);
  if (isNaN(parsed) || parsed < 20) parsed = 20;
  if (parsed > 2000) parsed = 2000;
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
    stop();
    timeStart = currentPos;
    start();
  }
}

function openSettings() {
  var selectProgram = document.getElementById('selectProgram');
  var settingsModal = document.getElementById('settings');
  if (selectProgram) {
    selectProgram.value = currentProgram;
  }
  if (settingsModal) {
    settingsModal.style.display = 'flex';
  }
  clientResize();
}

function closeSettings() {
  var settingsModal = document.getElementById('settings');
  if (settingsModal) {
    settingsModal.style.display = 'none';
  }
  clientResize();
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

  window.addEventListener('keydown', function (e) {
    var settingsModal = document.getElementById('settings');
    if (e.key === 'Escape' && settingsModal && settingsModal.style.display !== 'none' && settingsModal.style.display !== '') {
      closeSettings();
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
  }

  if (baseFreqInput) {
    baseFreqInput.addEventListener('change', function () {
      applyBaseFrequency(this.value);
    });
  }

  var harmonicBtns = document.querySelectorAll('.harmonic-btn');
  for (var i = 0; i < harmonicBtns.length; ++i) {
    harmonicBtns[i].addEventListener('click', function () {
      var freq = parseFloat(this.getAttribute('data-freq'));
      applyBaseFrequency(freq);
    });
  }

  try {
    if (typeof Storage !== 'undefined') {
      var savedProgram = localStorage.getItem('currentProgram');
      if (savedProgram !== null && savedProgram !== 'custom' && savedProgram.trim() !== '') {
        currentProgram = savedProgram;
      }
      var savedBaseFreq = localStorage.getItem('baseFreq');
      if (savedBaseFreq !== null) {
        var parsedFreq = parseFloat(savedBaseFreq);
        if (!isNaN(parsedFreq) && parsedFreq >= 20 && parsedFreq <= 2000) {
          baseFreq = parsedFreq;
          if (baseFreqInput) baseFreqInput.value = baseFreq;
        }
      }
    }
  } catch (e) {}

  syncHarmonicButtons();
  chart = createProgramChart();
  changeProgram(currentProgram);

  if (typeof ResizeObserver !== 'undefined') {
    var chartEl = document.getElementById('chart');
    if (chartEl) {
      var ro = new ResizeObserver(function () {
        clientResize();
      });
      ro.observe(chartEl);
    }
  }
});

window.addEventListener('resize', function () {
  clientResize();
});
