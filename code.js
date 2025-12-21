// Version 0.2
// Author: Ape42

let xmetar_result = null;
let guid = 'df8f1874-245e-44b6-b017-0a69eeb5c231'
let xmetar_result_uid = 'xmetar_result_uid';
const prefixes = ['xmetar', 'xm'];

// Widget elements
this.host_el = null;
this.canvas = null;
this.ctx = null;
this.metar_line = null;
this.canvasSize = 450;
this.canvasHeight = this.canvasSize * 0.85;
// let canvas = null;
// let ctx = null;
// let canvasSize = 450;

this.widgetStore = {
    active: false
};

// const resizeWidget = () => {
//     if (this.host_el && this.canvas) {
//         widget.style.width = `${canvasSize}px`;
//         widget.style.height = `${canvasSize}px`;
//         canvas.width = canvasSize;
//         canvas.height = canvasSize;
//     }
// };


// Helper conversion functions

function mps2kt(mps) { return mps * 0.868976; }
function miles2meters(miles) { return miles * 1609.344; }
function meters2miles(meter) { return meter / 1609.344; }
function celsius2fahrenheit(celsius) { return celsius * 1.8 + 32; }
function inhg2hpa(inhg) { return inhg * 33.863889532611; }
function hpa2inhg(hpa) { return hpa * 0.02952998057228; }
function parseCloud(code, height) {
    return { 'code': code, 'height': height,  };
}

function fixWindUnits(unit) {
    if (unit === "MPS") {
        console.log("Wind unit " + unit + ". Please report");
    } else if (unit === "KMH") {
        console.log("Wind unit " + unit + ". Please report");
    }
}

// METAR parsing function
function parse_metar(metar) {
    // Example METAR: KJFK 121651Z 18015G25KT 10SM FEW020 SCT250 30/22 A2992 RMK AO2 SLP134 T03000217

    metar = metar.replace(/^METAR\S*?\s/, '').replace(/(\s)(\d)\s(\d)\/(\d)(SM)/, function (all, a, b, c, d, e) {
      return a + (Number(b) * Number(d) + Number(c)) + '/' + d + e;});

    let metar_parts = metar.split(' ');

    let mode = 0, match;
    let metar_data = {};
    metar_data.clouds = [];
    metar_data.conditions = [];
    for (let i = 0; i < metar_parts.length; i++) {
        // Preconditions for missing parts
        if (mode < 3 && metar_parts[i].match(/^(\d+)(?:\/(\d+))?(SM)?$/)) { // /^[0-9]{2}\/[0-9]{2}$/
            mode = 3; // no wind reported
            // console.log('No wind reported');
        }
        if (mode < 5 && metar_parts[i].match(/^(FEW|SCT|BKN|OVC)(\d+)?/)) {
            mode = 5; // no visibility or conditions reported
            // console.log('No visibility reported');
        }
        if (mode < 6 && metar_parts[i].match(/(^(M?\d+)\/(M?\d+)$)|(^\/\/\/\/\/)/)) {
            mode = 6; // end of clouds
            // console.log('End of cloud report');
        }
        // console.log(`metar_parts[${i}] = ${metar_parts[i]}, mode = ${mode}`);
        switch (mode) {
            case 0:
                // ICAO code
                metar_data.icao = metar_parts[i];
                mode = 1;
                break;
            case 1:
                // Day & Time
                match = metar_parts[i].match(/^(\d\d)(\d\d)(\d\d)Z$/);
                if (match) {
                    let now = new Date();
                    metar_data.time = new Date(Date.parse(`${now.getUTCFullYear()}-${now.getUTCMonth()+1}-${match[1]}T${match[2]}:${match[3]}:00Z`));
                    // console.log(`xMETAR: metar_data.time: ${metar_data.time.toUTCString()}`);
                    mode = 2;
                } else {
                    // console.error(`xMETAR: Failed parsing date '${metar_parts[i]}'`);
                }
                break;
            case 2:
                // Wind
                if (metar_parts[i] != 'AUTO') {
                    match = metar_parts[i].match(/^(\d\d\d|VRB)P?(\d+)(?:G(\d+))?(KT|MPS|KMH)/);
                    if (match) {
                        metar_data.wind = {};
                        metar_data.wind.degrees = match[1] === "VRB" ? "VRB" : Number(match[1]);
                        metar_data.wind.speed = Number(match[2]);
                        metar_data.wind.gusts = (match[3] && match[3].length > 0 ? Number(match[3]) : null);

                        if (metar_parts[i+1] != "CAVOK" && metar_parts[i+1].indexOf("V", 0) >= 0) {
                            var match2 = metar_parts[i+1].match(/^(\d\d\d)V(\d\d\d)/);
                            // metar_data.wind.degrees = {};
                            metar_data.wind.from = Number(match2[1]);
                            metar_data.wind.to = Number(match2[2]);
                            i += 1;
                        }
                        // fixWindUnits(match[4]); // TODO: implement unit conversion if needed, but in which case?

                        mode = 3;
                    } else {
                        console.log(`xMETAR: No wind info found in`);
                    }
                } else { // is AUTO
                    // console.log(`xMETAR: Auto generated METAR`);
                }
                break;
            case 3:
                // Visibility
                match = metar_parts[i].match(/^(\d+)(?:\/(\d+))?(SM)?$/);
                metar_data.visibility = {};
                if (metar_parts[i] === "CAVOK" || metar_parts[i] === "CLR") {
                    metar_data.visibility.m = 9999;
                    metar_data.visibility.sm = 10;
                    mode = 5; // no clouds & no conditions reported
                } else if (match) {
                    if (match[3]) { // unit is SM
                        if (match[2]) { // visibility contains a fraction
                            metar_data.visibility.sm = Number(match[1])/Number(match[2]);
                            // TODO: if you want to keep the string format
                            // var whole = Math.floor(match[1] / match[2]);
                            // var part = match[1] % match[2];
                            // metar_data.visibility.sm_string = "" + (whole == 0 ? "" : whole + " ") + part + "/" + match[2];
                        } else { // visibility contains a whole number.
                            metar_data.visibility.sm = Number(match[1]);
                        }

                        metar_data.visibility.m = Math.ceil(miles2meters(metar_data.visibility.sm));
                    } else { // no unit -> meters
                        metar_data.visibility.m = match[1];
                        metar_data.visibility.sm = metar_data.visibility.m == 9999 ? 10 : meters2miles(metar_data.visibility.m);
                    }
                    mode = 4;
                } else {
                    console.log("No vis match");
                }
                break;
            case 4:
                // Conditions
                match = metar_parts[i].match(/^(\+|-|VC|RE)?([A-Z][A-Z])([A-Z][A-Z])?([A-Z][A-Z])?$/);
                if (match) {
                    // console.log(`Condition match: ${match}`);
                    match
                        .filter((m, index) => {
                            return index !== 0 && m;
                        })
                        .forEach((m) => {
                            metar_data.conditions.push({ code: m });
                        });
                    // may occur multiple times
                }
                break;
            case 5:
                // Clouds
                match = metar_parts[i].match(/^(FEW|SCT|BKN|OVC)(\d+)?/);
                if (match) {
                    metar_data.clouds.push({'code': match[1], 'height': match[2] ? Number(match[2]) * 100 : null});
                    // may occur multiple times
                }
                break;
            case 6:
                // Temperature
                match = metar_parts[i].match(/^(M?\d+)\/(M?\d+)$/);
                if (match) {
                    metar_data.temp = { temp: {}, dew: {} };
                    // console.log(`xMETAR: Temperature match: ${match[1]} / ${match[2]}`);
                    match[1] = Number(match[1].replace('M', '-'));
                    match[2] = Number(match[2].replace('M', '-'));
                    metar_data.temp.temp.c = match[1];
                    metar_data.temp.dew.c = match[2];
                    metar_data.temp.temp.f = celsius2fahrenheit(match[1]);
                    metar_data.temp.dew.f = celsius2fahrenheit(match[2]);
                    mode = 7;
                }
                break;
            case 7:
                // Pressure
                match = metar_parts[i].match(/^(Q|A)(\d+)/);
                if (match) {
                    metar_data.press = {};
                    if (match[1] === "Q") {
                        metar_data.press.hpa = Number(match[2]);
                        metar_data.press.inhg = Math.round(hpa2inhg(Number(match[2])) * 100) / 100;
                    } else {
                        metar_data.press.hpa = Math.round(inhg2hpa(Number(match[2]) / 100));
                        metar_data.press.inhg = Number(match[2]) / 100;
                    }
                    mode = 8;
                }
                break;
        }
    }

    return metar_data;
}

// Widget toggle function
// Hides and shows the widget on each run() call
run(() => {
    console.log('xMETAR: Widget run()');
    if (this.widgetStore.active) {
        this.host_el.classList.remove('visible');
        this.widgetStore.active = false;
    } else {
        this.host_el.classList.add('visible');
        this.widgetStore.active = true;
    }
});

// Main search function for Flow Pro
search(prefixes, (query, callback) => {
    xmetar_result = {
        uid: xmetar_result_uid,
        label: 'XMETAR &lt;ICAO&gt;',
        subtext: 'Enter ICAO code to get METAR information',
        execute: null
    };
    
    // test if any query is given
    if (!query) { 
        callback([xmetar_result]);
        return; 
    }
    
    // test if query has sufficient parameters
    let data = query.toLowerCase().split(' ');
    if (data.length == 1 || !data[1] ) {
        callback([xmetar_result]);
        return;
    }
    
    if (data[1] === '-') {
        xmetar_result = {
            uid: xmetar_result_uid,
            label: 'xMETAR - Clear widget',
            subtext: 'Clears the xMETAR widget display',
            execute: () => {
                console.log('Clearing xMETAR widget');
                this.widgetStore.active = false;
                callback([xmetar_result]);
                return true;
            }
        };
    }
    
    let icao = data[1].toUpperCase();
    if (icao == '' || icao.length != 4) {
        xmetar_result.label = 'XMETAR ' + data[1];
        is_note = false;
        callback([xmetar_result]);
        return;
    } 
    
    xmetar_result = {
        uid: xmetar_result_uid,
        label: 'XMETAR ' + data[1],
        subtext: '',
        execute: () => {
            console.log('Executing XMETAR for ' + icao);
            this.$api.airports.find_airport_by_icao(guid, icao, (airports) => {
                let lat = airports[0].lat;
                let lon = airports[0].lon;

                this.$api.weather.find_metar_from_coords(lat, lon, (metar_callback) => {
                    // console.log('METAR: ' + JSON.stringify(metar_callback));
                    // metar_callback.metarString = "EDDB 211420Z AUTO 10010KT 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
                    // metar_callback.metarString = "EDDB 211420Z AUTO 10010KT 060V140 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
                    // metar_callback.metarString = "EDDB 211420Z AUTO VRB01KT 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
                    // metar_callback.metarString = "EDDB 211420Z AUTO 10010KT 9000 CAVOK 07/06 Q1018 NOSIG";
                    if (airports[0].icao != metar_callback.icao) {
                        xmetar_result.subtext = '<p>No METAR for <i>' + icao + '</i> using <i>' + metar_callback.icao + '</i></p>';
                    }
                    xmetar_result.subtext += '<p>' + metar_callback.metarString + '</p>';
                    xmetar_result.is_note = true;

                    metar = parse_metar(metar_callback.metarString);
                    console.log('Parsed METAR: ' + JSON.stringify(metar));

                    const container = document.createElement('div');
                    container.innerHTML = `${metar.icao}`;
                    this.host_el.appendChild(container);
                    // for (cloud of metar.clouds) {
                    //     xmetar_result.subtext += `<p>Clouds: ${cloud.code} at ${cloud.height ? cloud.height + ' ft' : 'N/A'}</p>`;
                    // }
                    this.metar_line.innerHTML = metar_callback.metarString;

                    this.widgetStore.active = true;

                    // console.log(`x: ${JSON.stringify(airports[0].runways[0].direction)}`);
                    doRender.call(this, airports[0], metar);

                    callback([xmetar_result]);
                    return true;
                })
            })
            return true;
        }
    };
    
    callback([xmetar_result]);
    return true;
});

style(() => { 
    if (this.host_el) {
        if (this.widgetStore.active) {
            this.host_el.classList.add('visible');
            // console.log('show');
        }
        else {
            this.host_el.classList.remove('visible');
            // console.log('hide');
        }
    }
    return this.widgetStore.active ? 'active' : null;
})

// Drawing functions
const cloudCounts = {
  FEW: 2,
  SCT: 4,
  BKN: 7,
  OVC: 10,
};


function drawCloudLayer(ctx, x, yBottom, width, rowH, layer) {
    const count = cloudCounts[layer.code] || 3;
    const radius = 10; 

    // Convert altitude to pixel Y
    const baseFt = Math.min(layer.height, 5000);
    const yBase = yBottom - (baseFt / 5000) * (rowH * 5);

    const spacing = width / count;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.6)";

    for (let i = 0; i < count; i++) {
        const cx = x + spacing * i + spacing / 2;
        const cy = yBase - radius; // bottom touches cloud base

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(layer.code, x + width + 6, yBase - radius);

    ctx.restore();
}


function drawCloudDiagram(ctx, x, yBottom, width, height, clouds) {
  const maxFt = 5000;
  const stepFt = 1000;
  const rows = maxFt / stepFt;
  const rowH = height / rows;

  ctx.save();

  // Grid + labels
  ctx.strokeStyle = "#ccc";
  ctx.lineWidth = 1;
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "#000";

  for (let i = 0; i <= rows; i++) {
    const y = yBottom - i * rowH;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();

    ctx.fillText(`${i * stepFt}`, x - 30, y + 4);
  }

  // Draw clouds
  if (!clouds || clouds.length === 0) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CAVOK / NSC", x + width / 2, yBottom - height / 2);
  } else {
    clouds.filter(layer => layer.height <= 5000).forEach(layer => {
        drawCloudLayer(ctx, x, yBottom, width, rowH, layer);
    });
  }

  ctx.restore();
}


function degToRad(deg) {
    return (deg - 90) * (Math.PI / 180);
}

function degToCanvasRad(deg) {
    return deg * (Math.PI / 180);
}

function drawCircle(ctx, x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    lineWidth = 2;
    // ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.fill();
}

function drawCompassLabel(ctx, cx, cy, r, deg) {
  const labels = {
    270: "N",
    0: "E",
    90: "S",
    180: "W"
  };

  const a = degToCanvasRad(deg);
  const inset = 18;

  ctx.save();
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillText(
    labels[deg],
    cx + Math.cos(a) * (r - inset),
    cy + Math.sin(a) * (r - inset)
  );

  ctx.restore();
}

function drawCompassRose(ctx, cx, cy, r) {
  ctx.save();

  for (let deg = 0; deg < 360; deg += 10) {
    const a = degToCanvasRad(deg);

    const isMajor = deg % 30 === 0;
    const tickLen = isMajor ? 10 : 5;

    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r - tickLen);
    const y2 = cy + Math.sin(a) * (r - tickLen);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.strokeStyle = "#FFF";
    ctx.stroke();

    // Cardinal labels
    if (deg % 90 === 0) {
      drawCompassLabel(ctx, cx, cy, r, deg);
    }
  }

  ctx.restore();
}

function drawRunwayText(ctx, x, y, text) {
  ctx.save();
  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function runwayLabelPositions(cx, cy, r, angleDeg) {
  const d = r * 0.88;
  const angleRad = degToRad(angleDeg);
  return [
    {
      x: cx + Math.cos(angleRad) * d,
      y: cy + Math.sin(angleRad) * d,
    },
    {
      x: cx - Math.cos(angleRad) * d,
      y: cy - Math.sin(angleRad) * d,
    }
  ];
}

function drawRunway (ctx, cx, cy, r, runway) {
    // runway.direction + 90, runway.primaryName, runway.secondaryName
    const angleDeg = runway.direction; // + 90;
    const a = degToRad(runway.direction); // + 90);

    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx - Math.cos(a) * r;
    const y2 = cy - Math.sin(a) * r;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 10;
    ctx.stroke();

    // Draw runway designators without letters.
    const [p1, p2] = runwayLabelPositions(cx, cy, r, angleDeg);
    const designators = runway.designation.split('-');
    drawRunwayText(ctx, p1.x, p1.y, designators[1]);
    drawRunwayText(ctx, p2.x, p2.y, designators[0]);
}

function drawArrow(ctx, x, y, angle, length) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-length, 0);
  ctx.lineTo(-length + 10, -6);
  ctx.moveTo(-length, 0);
  ctx.lineTo(-length + 10, 6);

  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawWind(ctx, cx, cy, r, wind, length = 40) {
    if (wind.degrees === "VRB") {
        ctx.save();
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = "red";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("VRB", cx, cy);
        ctx.restore();
        return;
    }
    const a = degToRad(wind.degrees);

    if (wind.from && wind.to) {
        const startRad = degToRad(wind.from + 180);
        const endRad = degToRad(wind.to + 180);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, length + 5, startRad, endRad);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,90,90,0.25)";
        ctx.fill();
        console.log(`Drawing wind variation arc from ${wind.from} to ${wind.to}`);
    }
    drawArrow(ctx, cx, cy, degToRad(wind.degrees), length);
}

function doRender(airport, metar) {
    if (!this.ctx) {
        console.log('xMETAR: No canvas context for rendering');
        return;
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const radius = 120;
    const cx = radius + 10;
    const cy = radius + 10;
    
    drawCircle(this.ctx, cx, cy, radius, '#004000');
    // console.log(`Airport runways: ${JSON.stringify(airport)}`);
    for (const runway of airport.runways) {
        // console.log(`Drawing runway at ${runway.direction}`);
        drawRunway(this.ctx, cx, cy, radius - 25, runway, runway.primaryName.replace(/[0-9]/g, ''));
        // drawRunway(this.ctx, cx, cy, radius, (runway.direction + 180) % 360);
    }
    // drawRunway(this.ctx, cx, cy, radius, 60 + 90);
    // drawRunway(this.ctx, cx, cy, radius, 90);
    drawWind(this.ctx, cx, cy, radius, metar.wind, 50);
    
    drawCompassRose(this.ctx, cx, cy, radius);

    drawCloudDiagram(this.ctx, 290, 180, 170, 150, metar.clouds);
}

html_created(el => {
    this.host_el = el.querySelector('#Ape42_xmetar');
    this.canvas = el.querySelector('#Ape42_xmetar_canvas');
    // console.log(`canvas: ${this.canvas}`)
    this.metar_line = el.querySelector('#Ape42_xmetar_container');

    if (!this.canvas) {
        console.log('xMETAR: Canvas not found');
        return;
    }
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
        console.log('xMETAR: Canvas context not found');
        return;
    }
    console.log('xMETAR: Canvas context initialized');
});