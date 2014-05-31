var chart;
var monitor;
var program;

var currentProgram = "relaxation.xml";
var baseRate = 440.0;

var timeStart = 0;
var timeContext = 0;
var timeMax = 0;			

var context = null;
try {
	context = new AudioContext();
} catch(e) {}

var merger, gain, osc;

window.AudioContext = window.AudioContext||window.webkitAudioContext;

function getTimeString(t) {
	var h = parseInt(t / 3600);
	var m = parseInt((t % 3600) / 60);
	var s = (t % 3600) % 60;
	
	var str = "";
	if ( h > 0 )
		str += h.toString() + ":";
	if ( m > 9 )
		str += m.toString() + ":";
	else {
		if ( h > 0 )
			str += "0";
		str += m.toString() + ":";
	}
	if ( s < 10 )
		str += "0";
	str += s.toString();
	
	return str;
}

function setFontSize(s, h) {
	$(s).css("line-height", h + "px");
	$(s).css("font-size", parseInt(h * 0.8) + "px");
}

function clientResize() {
	setFontSize("#header", $("#header").height() * 0.5);
	setFontSize("#control", $("#control").height());
	
	$('#icon').css("height", $("#header").height() * 0.5 + "px");
	$('#icon').css("width", $("#header").height() * 0.5 + "px");
	
	$("#divPosition").css("width", parseInt($("#control").height() * 0.8) * 3.5 + "px");
	$("#divSlider").css("width", $("#control").width() - $("#divPosition").width() - 8 + "px");
	$("#start").css("font-size", $("#header").height() * 0.5 + "px");
	$("#done").css("font-size", $("#header").height() * 0.5 + "px");
	
	var w = $("#body").width();
	var h = $("#body").height();
	$("#chart").attr("width", w + "px");
	$("#chart").attr("height", h + "px");

	if (chart != null)
		chart.replot();
}

function getFrequency(v, t) {
	var f = $(v).find("frequency");
	for ( var i = 0; i < f.length - 1; ++i ) {
		var t0 = parseFloat($(f[i]).attr("time"));
		var t1 = parseFloat($(f[i + 1]).attr("time"));
		if ( t0 <= t && t1 > t ) {
			var d = (t - t0) / (t1 - t0);
			var f0 = parseFloat($(f[i]).html());
			var f1 = parseFloat($(f[i + 1]).html());
			return f0 + (f1 - f0) * d;
		}				
	}
	return 0.0;
}

function loadProgram(xml) {
	stop();
	
	program = $(xml).find("program")[0];

	$("#title").html($(program).attr("name"));
	$("#name").html($(program).attr("name"));
	$("#description").html($(program).attr("description"));
	$("#chart").empty();
	
	// update chart
	timeMax = 0;
	var maxFreq = 0.0;
	var data = [];
	var voices = $(program).find("voice");
	for ( var i = 0; i < voices.length; ++i ) {
		data[i] = [];
		var frequencies = $(voices[i]).find("frequency");
		for ( var j = 0; j < frequencies.length; ++j ) {
			var t = parseInt($(frequencies[j]).attr("time"));
			var f = parseFloat($(frequencies[j]).html());
			data[i][j] = [ t, f ];

			if ( f > maxFreq )
				maxFreq = f;
			if ( t > timeMax )
				timeMax = t;
		}
	}
	
	var options = {
		grid: {
			drawGridlines:false,
			background:'black'
		},
		seriesDefaults: {
			showMarker:false,
			shadow:false,
			rendererOptions: {
				smooth:true
			}
		},
		axes: {
			yaxis: {
				labelRenderer: $.jqplot.CanvasAxisLabelRenderer,
				fontSize: '8pt',
				min: 0,
				max: maxFreq * 1.25,
				tickOptions: {
					formatString:'%d'
				}
			},
			xaxis: {
				labelRenderer: $.jqplot.CanvasAxisLabelRenderer,
				label: 'frequency/time(s)',
				fontSize: '8pt',
				min:0,
				max: timeMax,
				tickOptions: {
					formatString:'%d'
				}
			}
		}
	};
	chart = $.jqplot("chart", data, options);
	
	// set slider/display
	$("#slider").attr("max", timeMax);
	$("#slider").val(0);
	$("#slider").trigger("change");
}

function changeProgram(filename) {
	$.ajax({
		type: "GET",
		url: filename,
		dataType: "xml",
		success: function(xml) { 
			currentProgram = filename;
			if ( typeof(Storage) !== "undefined" )
				localStorage.setItem("currentProgram", filename);
			loadProgram(xml);
		}
	});
}

function start() {
	$("#start").html("stop");
	$("#start").data("playing", true);

	// reset webAudio objects
	merger = [];
	gain = [];
	osc = [];
	
	timeStart = $("#slider").val();
	timeContext = context.currentTime;
	
	var voices = $(program).find("voice");
	for ( var i = 0; i < voices.length; ++i ) {
		merger[i] = context.createChannelMerger(2);
		osc[i] = { left: context.createOscillator(), right: context.createOscillator() };
		gain[i] = { left: context.createGain(), right: context.createGain() };

		osc[i].left.connect(gain[i].left);
		osc[i].right.connect(gain[i].right);
		gain[i].left.connect(merger[i], 0, 0);
		gain[i].right.connect(merger[i], 0, 1);

		osc[i].left.frequency.value = baseRate;
		osc[i].right.frequency.value = baseRate;
		gain[i].left.gain.value = 0;
		gain[i].right.gain.value = 0;
		
		var frequencies = $(voices[i]).find("frequency");
		for ( var j = 0; j < frequencies.length; ++j ) {
			var t = parseInt($(frequencies[j]).attr("time"));
			var f = parseFloat($(frequencies[j]).html());
			osc[i].right.frequency.exponentialRampToValueAtTime(baseRate + f, t - timeStart);
		}
		
		var volumes = $(voices[i]).find("volume");
		for ( var j = 0; j < volumes.length; ++j ) {
			var t = parseInt($(volumes[j]).attr("time"));
			var v = parseFloat($(volumes[j]).html());
			gain[i].left.gain.linearRampToValueAtTime(v, t - timeStart);
			gain[i].right.gain.linearRampToValueAtTime(v, t - timeStart);
		}
		
		merger[i].connect(context.destination);
	}

	for ( var i = 0; i < osc.length; ++i ) {
		osc[i].left.start(0);
		osc[i].right.start(0);
	}
	
	monitor = setInterval(function() {
		var t = parseInt(timeStart) + parseInt(context.currentTime - timeContext);
		if ( t > timeMax ) {
			$("#slider").val(0);
			$("#divPosition").html('0:00');
			stop();
		} else {
			$("#slider").val(t);
			$("#divPosition").html(getTimeString(t));
		}
	}, 1000);
}

function stop() {
	$("#start").html("start");
	$("#start").data("playing", false);
	
	// stop webAudio
	if ( osc ) {
		for ( var i = 0; i < osc.length; ++i ) {
			osc[i].left.stop();
			osc[i].right.stop();
		}
	}
	
	clearInterval(monitor);
}

$(document).ready(function() {
	if ( context !== null ) {
		$("#menu").click(function() {
			$("#selectProgram").val(currentProgram);
			$("#settings").css("display", "block");
		});
		$("#done").click(function() {
			$("#settings").css("display", "none");
		});
		$("#start").click(function() {
			if ( $("#start").html() == "start" )
				start();
			else
				stop();
		});
		$("#selectProgram").change(function() {
			if ( $(this).val() === 'custom' )
				$("#selectCustom").fadeIn();
			else
			{
				$("#selectCustom").fadeOut();
				changeProgram($("#selectProgram").val());
			}
		});
		$("#selectCustom").change(function(e) {
			var reader = new FileReader();
			reader.onload = function(event) {
				parser = new DOMParser();
				loadProgram(parser.parseFromString(event.target.result, "application/xml"));
				currentProgram = "custom";
			};
			reader.readAsText(event.target.files[0]);
		});
		$("#slider").change(function() {
			var t = parseInt(parseInt($(this).val()));
			if ( $("#start").data("playing") === true ) {
				stop();
				timeStart = t;
				start();
			} else
				timeStart = t;
			$("#divPosition").html(getTimeString(t));
		});

		if ( typeof(Storage) !== "undefined" && localStorage.getItem("currentProgram") !== null )
			currentProgram = localStorage.getItem("currentProgram");
		changeProgram(currentProgram);
	} else
		$("#title").html("Web Audio API is not supported in this browser.");
		
	clientResize();	
});

$(window).resize(function() { clientResize(); });
