// Version 1.5
// Author: Ape42
// Description: xMETAR widget for Flow Pro - displays METAR information for a given ICAO code including wind and cloud diagram.
// Usage: Type "xmetar &lt;ICAO&gt;" in Flow Pro search to get METAR information for the given ICAO code.
//        Type "xmetar -" to clear the widget display.
// Note: Copies the METAR string to clipboard when executed.
// Note: METAR parsing adapted from https://github.com/fboes/metar-parser Copyright (c) 2019 Frank Boës

// Global variables
const debug_on = false;
let xmetar_result = null;
let guid = 'df8f1874-245e-44b6-b017-0a69eeb5c231'
let xmetar_result_uid = 'xmetar_result_uid';
const prefixes = ['xmetar', 'xm'];

// Widget data
const metar_mode = { airport: 0, position: 1 };
this.airport = null;
this.metar = null;
this.mode = metar_mode.airport;

// Wheel data
this.icao = null;
this.metar_icao = null;
this.airport_name = null;

// Widget elements
this.host_el = null;
this.canvas = null;
this.ctx = null;
this.metar_line = null;
this.canvasSize = 450;
this.canvasHeight = this.canvasSize * 0.85;

// Persistent storage for widget settings
this.widgetStore = {
    active: false,
    isLiveWeather: true,
    tempInCelsius: true,
    qnhInHpa: true,
    minRwyLengthFt: 0,
    maxAirportCount: 10,
    copyMetarToClipboard: true,
    keepOpen: true,
    showWidgetAfterMetarFetch: true,
};
this.$api.datastore.import(this.widgetStore);

// Settings definition
settings_define({
    tempInCelsius: {
        label: 'Temperature in °C',
        type: 'checkbox',
        description: 'Choose temperature units: C or F',
        value: this.widgetStore.tempInCelsius,
        changed: (value) => {
            this.widgetStore.tempInCelsius = value;
            this.$api.datastore.export(this.widgetStore);
        }
    },
    qnhInHpa: {
        label: 'QNH in hPa',
        type: 'checkbox',
        description: 'Choose QNH units: hPa or inHg',
        value: this.widgetStore.qnhInHpa,
        changed: (value) => {
            this.widgetStore.qnhInHpa = value;
            this.$api.datastore.export(this.widgetStore);
        }
    },
    minRwyLengthFt: {
        label: 'Minimum Runway Length (ft)',
        type: 'text',
        description: 'Minimum length of runways to consider when listing nearby airports (in feet). Set to 0 to disable filtering. Accepts 0 to 5000 ft.',
        value: this.widgetStore.minRwyLengthFt,
        changed: (value) => {
            // Clamp value between 0 and 5000
            this.widgetStore.minRwyLengthFt = isNaN(parseInt(value)) ? 0 : Math.max(0, Math.min(parseInt(value, 10), 5000));
            this.$api.datastore.export(this.widgetStore);
            debug_on && console.log('Setting minRwyLengthFt to ' + this.widgetStore.minRwyLengthFt);
        }
    },
    maxAirportCount: {
        label: 'Maximum Airport Count',
        type: 'text',
        description: 'Maximum number of nearby airports to list when searching for nearby airports. Accepts 2 to 10.',
        value: this.widgetStore.maxAirportCount,
        changed: (value) => {
            // Clamp value between 2 and 10
            this.widgetStore.maxAirportCount = isNaN(parseInt(value)) ? 10 : Math.max(2, Math.min(parseInt(value, 10), 10));
            this.$api.datastore.export(this.widgetStore);
            debug_on && console.log('Setting maxAirportCount to ' + this.widgetStore.maxAirportCount);
        }
    },
    copyMetarToClipboard: {
        label: 'Copy METAR',
        type: 'checkbox',
        description: 'If enabled, the METAR string will be copied to clipboard when the widget is executed.',
        value: this.widgetStore.copyMetarToClipboard,
        changed: (value) => {
            this.widgetStore.copyMetarToClipboard = value;
            this.$api.datastore.export(this.widgetStore);
        }
    },
    keepOpen: {
        label: 'Keep Otto',
        type: 'checkbox',
        description: 'If enabled, the search bar remain open after executing a search, displaying the METAR information.',
        value: this.widgetStore.keepOpen,
        changed: (value) => {
            this.widgetStore.keepOpen = value;
            this.$api.datastore.export(this.widgetStore);
        }
    },
    showWidgetAfterMetarFetch: {
        label: 'Show widget',
        type: 'checkbox',
        description: 'If enabled, the widget will be shown automatically after fetching METAR data.',
        value: this.widgetStore.showWidgetAfterMetarFetch,
        changed: (value) => {
            this.widgetStore.showWidgetAfterMetarFetch = value;
            this.$api.datastore.export(this.widgetStore);
        }
    }
});

// Check for live Weather and add/remove class for metar bar in widget.
loop_1hz(() => {
    const weather = this.$api.weather.get_weather();
    const live = weather.sPresetName == 'TT:MENU.WEATHERTYPE_0DYNAMIC';
    if (live != this.widgetStore.isLiveWeather) {
        if (this.metar_line) {
            if (live) {
                this.metar_line.classList.remove('no_live_weather');
            } else {
                this.metar_line.classList.add('no_live_weather');
            }
        }
        this.widgetStore.isLiveWeather = live;
    }
});

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
            mode = 3; // no wind reported, skipping to visibility
            // console.log('No wind reported');
        }
        if (mode < 5 && metar_parts[i].match(/^(FEW|SCT|BKN|OVC|VV)(\d+)?/)) {
            mode = 5; // no visibility or conditions reported, skipping to clouds
            // console.log('No visibility reported');
        }
        if (mode < 6 && metar_parts[i].match(/(^(M?\d+)\/(M?\d+)$)|(^\/\/\/\/\/)/)) {
            mode = 6; // end of clouds, skipping to temperature
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
                // Wind, skipt AUTO if present
                if (metar_parts[i] != 'AUTO') {
                    match = metar_parts[i].match(/^(\d\d\d|VRB)P?(\d+)(?:G(\d+))?(KT|MPS|KMH)/);
                    if (match) {
                        metar_data.wind = {};
                        metar_data.wind.degrees = match[1] === "VRB" ? "VRB" : Number(match[1]);
                        metar_data.wind.speed = Number(match[2]);
                        metar_data.wind.gusts = (match[3] && match[3].length > 0 ? Number(match[3]) : null);

                        if (metar_parts[i+1] && metar_parts[i+1] !== "CAVOK" && metar_parts[i+1].indexOf("V", 0) >= 0) {
                            const match2 = metar_parts[i+1].match(/^(\d\d\d)V(\d\d\d)/);
                            if (match2) {
                                metar_data.wind.from = Number(match2[1]);
                                metar_data.wind.to = Number(match2[2]);
                                i += 1;
                            }
                        }
                        // fixWindUnits(match[4]); // TODO: implement unit conversion if needed, but in which case?

                        mode = 3;
                    } else {
                        debug_on && console.log(`xMETAR: No wind info found in '${metar_parts[i]}'`);
                    }
                }
                break;
            case 3:
                // Visibility
                match = metar_parts[i].match(/^(\d+)(?:\/(\d+))?(SM)?$/);
                metar_data.visibility = {};
                if (metar_parts[i] === "CAVOK" || metar_parts[i] === "CLR") {
                    metar_data.visibility.source = "CAVOK";
                    metar_data.visibility.m = 9999;
                    metar_data.visibility.sm = 10;
                    mode = 5; // no clouds & no conditions reported
                } else if (match) {
                    if (match[3]) { // unit is SM
                        metar_data.visibility.source = "SM";
                        if (match[2]) { // visibility contains a fraction
                            metar_data.visibility.sm = Number(match[1])/Number(match[2]);
                            metar_data.visibility.sm_original = match[0];
                            // TODO: if you want to keep the string format
                            var whole = Math.floor(match[1] / match[2]);
                            var part = match[1] % match[2];
                            metar_data.visibility.sm_original = "" + (whole == 0 ? "" : whole + " ") + part + "/" + match[2];
                        } else { // visibility contains a whole number.
                            metar_data.visibility.sm = Number(match[1]);
                        }

                        metar_data.visibility.m = Math.ceil(miles2meters(metar_data.visibility.sm));
                    } else { // no unit -> meters
                        metar_data.visibility.source = "m";
                        metar_data.visibility.m = Number(match[1]);
                        metar_data.visibility.sm = metar_data.visibility.m == 9999 ? 10 : meters2miles(metar_data.visibility.m);
                    }
                    mode = 4;
                } else {
                    debug_on && console.log("No vis match");
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
                match = metar_parts[i].match(/^(FEW|SCT|BKN|OVC|VV)(\d+)?/);
                if (match) {
                    if (!isNaN(match[2])) {
                        console.log(`xMETAR: Cloud match: ${match[1]} at ${match[2]}00 ft`);
                        metar_data.clouds.push({'code': match[1], 'height': match[2] ? Number(match[2]) * 100 : null});
                    }
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
    if (this.widgetStore.active) {
        this.host_el.classList.remove('visible');
        this.widgetStore.active = false;
    } else {
        if (!this.icao) {
            this.$api.command.open_search(); 
        } else {
            this.host_el.classList.add('visible');
            this.widgetStore.active = true;
        }
    }
});

function rad2Deg(rad) {
    return rad * (180 / Math.PI);
}

function getAircraftPosition() {
    const longitude = this.$api.variables.get('A:PLANE LONGITUDE', 'Radians');
    const latitude = this.$api.variables.get('A:PLANE LATITUDE', 'Radians');
    return [rad2Deg(latitude), rad2Deg(longitude)];
}

function getMETAR(metar_raw, result, callback) {
    // console.log('METAR: ' + JSON.stringify(metar_raw));
    // Test METAR strings
    // metar_raw.metarString = "EDDB 211420Z AUTO 10010KT 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
    // metar_raw.metarString = "EDDB 211420Z AUTO 10001KT 060V140 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
    // metar_raw.metarString = "EDDB 211420Z AUTO VRB21KT 9000 OVC006 BKN016 SCT026 FEW050 07/06 Q1018 NOSIG";
    // metar_raw.metarString = "EDDB 211420Z AUTO 10021KT 9000 CAVOK 07/06 Q1018 NOSIG";
    // metar_raw.metarString = "ENDU 220920Z VRB01KT 9999 1800W BCFG FEW001 SCT004 BKN045 OVC5100 M01/M01 Q1026 TEMPO 1200 PRFG BKN004 RMK WIND 1374FT 24003KT WIND 2165FT 27008KT";
    // metar_raw.metarString = "ENDU 220920Z VRB01KT 9999 1800W BCFG OVC5100 M01/M01 Q1026 TEMPO 1200 PRFG BKN004 RMK WIND 1374FT 24003KT WIND 2165FT 27008KT";
    // metar_raw.metarString = "KLAX 220853Z 00000KT 6SM BR FEW003 FEW008 SCT250 13/13 A3004 RMK AO2 SLP172 T01330128 57006 $";
    // metar_raw.metarString = "KLAX 221436Z 10006KT 1 3/4SM R25L/4500VP6000FT BCFG BR BKN270 11/10 A3001 RMK AO2 VIS SE-S 1 FG SCT000 T01060100 $";
    // metar_raw.metarString = "ETMN 281320Z 25006KT 0050 FZFG VV000 M00/M00 Q1030 RED"; // For VV testing
    // metar_raw.metarString = "EDWE 281420Z AUTO 24003KT 210V270 0600 R25/0800N FG VV/// 02/02 Q1031"; // For VV/// tesing
    // metar_raw.metarString = "LOWS 281420Z 35004KT 0900 R15/1400D R33/1500U FZFG VV002 M03/M03 Q1028 TEMPO 0600 FZFG"; // For runway visual range testing:
    
    this.metar = parse_metar(metar_raw.metarString);
    console.log('Parsed METAR: ' + JSON.stringify(this.metar));
    // Check for live weather
    result.subtext = this.widgetStore.isLiveWeather ? '' : '<p>WARNING: Weather preset is active.</p>';
    
    if (this.airport) {
        if (this.mode == metar_mode.airport) {
            result.subtext += '<p>No METAR for <i>' + this.airport.icao + '</i> using <i>' + metar_raw.icao + '</i></p>';
        } else if (this.airport.icao != metar_raw.icao) {
            result.subtext += '<p>METAR for current position using <i>' + metar_raw.icao + '</i></p>';
        }
    }
    if (!this.airport) {
        result.subtext = '<p>METAR for current position using <i>' + metar_raw.icao + '</i></p>';
    }
    result.is_note = true;
    if (this.widgetStore.copyMetarToClipboard) {
        this.$api.command.copy_text(metar_raw.metarString);
    }
    
    this.metar_line.innerHTML = metar_raw.metarString;
    
    // Store current ICAO and airport name for info()
    this.icao = this.airport ? this.airport.icao : 'Pos.';
    this.airport_name = this.airport ? this.airport.name : '';
    this.metar_icao =  this.metar.icao;

    result.subtext += '<p>' + metar_raw.metarString + '</p>';
    try {
        if (this.widgetStore.showWidgetAfterMetarFetch) {
            this.widgetStore.active = true; // show widget
        }
        doRender.call(this, this.metar);
    } catch (e) {
        console.error('xMETAR: Error during rendering: ' + e);
    }

    if (this.widgetStore.keepOpen) {
        debug_on && console.log('xMETAR: Keeping widget open after search');
        callback([result]);
    }
}

function getDistance(lat1, lon1, lat2, lon2) {

    // Convert degrees to radians
    function toRad(deg) {
        return deg * Math.PI / 180;
    }

    lat1 = toRad(lat1);
    lon1 = toRad(lon1);
    lat2 = toRad(lat2);
    lon2 = toRad(lon2);

    var dLat = lat2 - lat1;
    var dLon = lon2 - lon1;

    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Earth radii
    var km = 6371.0088 * c;
    var miles = 3958.7613 * c;
    var nautical = 3440.065 * c;

    return {
        kilometers: km,
        miles: miles,
        nauticalMiles: nautical
    };
}

function getBearing(lat1, lon1, lat2, lon2) {

    function toRad(deg) {
        return deg * Math.PI / 180;
    }

    function toDeg(rad) {
        return rad * 180 / Math.PI;
    }

    lat1 = toRad(lat1);
    lat2 = toRad(lat2);
    lon1 = toRad(lon1);
    lon2 = toRad(lon2);

    var dLon = lon2 - lon1;

    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    var brng = toDeg(Math.atan2(y, x));

    // Normalize to 0–360
    brng = (brng + 360) % 360;

    return brng;
}

function bearingToCompass(bearing) {

    var directions = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW"
    ];

    var index = Math.round(bearing / 22.5) % 16;
    return directions[index];
}

// Main search function for Flow Pro
search(prefixes, (query, callback) => {
    let xmetar_result = {
        uid: xmetar_result_uid,
        label: 'XMETAR &lt;ICAO&gt;',
        subtext: 'Enter ICAO code to get METAR information',
        execute: null
    };
    let xmetar_result_current_position = {
        uid: xmetar_result_uid + "_current_position",
        label: 'XMETAR .',
        subtext: 'Get METAR close to current aircraft position',
        execute: null
    };
    let xmetar_result_airports = {
        uid: xmetar_result_uid + "_airports",
        label: 'XMETAR ?',
        subtext: 'List nearby airports with distance and bearing',
        execute: null
    };
    let xmetar_result_show_hide = {
        uid: xmetar_result_uid + "_show_hide",
        label: 'xMETAR +|-|*',
        subtext: 'Shows, hides or toggles the xMETAR widget',
        execute: null
    };
    
    // test if any query is given
    if (!query) { 
        return; 
    }

    // test if query has sufficient parameters
    let data = query.toLowerCase().split(' ');
    if (data.length == 1 || !data[1] ) {
        callback([xmetar_result, xmetar_result_current_position, xmetar_result_airports, xmetar_result_show_hide]);
        return;
    }
    
    if (['-', '+', '*'].indexOf(data[1]) > -1) {
        xmetar_result_show_hide.execute = () => {
            if (data[1] === '*') {
                this.widgetStore.active = !this.widgetStore.active;
            } else if (data[1] === '-') {
                this.widgetStore.active = false;
            } else if (data[1] === '+') {
                this.widgetStore.active = true;
            }
            this.$api.datastore.export(this.widgetStore);
        }
        callback([xmetar_result_show_hide]);
        return true;
    }

    if (data[1] == '?') {
        this.$api.airports.find_airports_by_coords(guid, ...getAircraftPosition.call(this).reverse(), 1000000, 1000,
        (airports) => {
            let results = [];
            console.log('Found ' + airports.length + ' nearby airports');
            const filtered_airports =  airports
                .filter(a => a.runways.length > 0)
                .filter(a => a.runways.some(rwy => rwy.length >= this.widgetStore.minRwyLengthFt))
                .slice(0, this.widgetStore.maxAirportCount);
            if (filtered_airports.length == 0) {
                xmetar_result_airports.subtext = '<p>No nearby airports found with runways longer than ' + this.widgetStore.minRwyLengthFt + ' ft.</p>';
                results.push(xmetar_result_airports);
                callback(results);
                return;
            }
            filtered_airports.forEach((airport) => {
                let distance_m = getDistance(
                    airport.lat, airport.lon,
                    ...getAircraftPosition.call(this)
                );
                let bearing_deg = getBearing(
                    ...getAircraftPosition.call(this),
                    airport.lat, airport.lon
                );
                let longest_runway = airport.runways.reduce((max, runway) => runway.length > max.length ? runway : max);
                let bearing_compass = bearingToCompass(bearing_deg);
                // console.log(distance_m, bearing_deg, bearing_compass);
                results.push({
                    uid: xmetar_result_uid + '_airport_' + airport.icao,
                    label: airport.icao + ' (' + airport.name + ')',
                    subtext: 'Distance: ' + Math.round(distance_m.nauticalMiles) + ' mi, Bearing: ' + Math.round(bearing_deg) + '° ' + bearing_compass + ', RWY ' + longest_runway.primaryName + '-' + longest_runway.secondaryName + ': ' + Math.round(longest_runway.length) + ' ft',
                    execute: () => {
                        this.mode = metar_mode.airport;
                        this.airport = airport;
                        this.$api.weather.find_metar_from_coords(airport.lat, airport.lon, (metar_callback) => {
                            this.debug_on && console.log('METAR from airport ' + airport.icao + ': ' + JSON.stringify(metar_callback));
                            getMETAR.call(this, metar_callback, xmetar_result_airports, callback);
                            return true;
                        });
                    }
                });
            });
            callback(results);
        }, (callback_removed) => {
        }, (callback_failed) => {
            console.error('Failed finding nearby airports: ' + JSON.stringify(callback_failed));
        },
        true);
        callback([xmetar_result_airports]);
        return true;
    }

    if (data[1] == '.') {
        xmetar_result_current_position = {
            uid: xmetar_result_uid,
            label: 'XMETAR .',
            subtext: 'Get METAR close to current aircraft position',
            execute: () => {
                this.mode = metar_mode.position;
                const [lat, lon] = getAircraftPosition.call(this);
                // find nearest airports within 100km, limit 1
                this.$api.airports.find_airports_by_coords(guid, lon, lat, 100000, 1,
                    (callback_added) => {
                        this.airport = callback_added[0];
                        this.$api.weather.find_metar_from_coords(lat, lon, (metar_callback) => {
                            this.debug_on && console.log('METAR from aircraft position: ' + JSON.stringify(metar_callback));
                            getMETAR.call(this, metar_callback, xmetar_result_current_position, callback);
                            return true;
                        });
                    }, (callback_removed) => {
                    }, (callback_failed) => {
                        console.error('Failed from aircraft position: ' + JSON.stringify(callback_failed));
                    },
                    true);
            }
        }
        callback([xmetar_result_current_position]);
        return true;
    }
    
    let icao = data[1].toUpperCase();
    if (icao == '' || icao.length < 3) {
        xmetar_result.label = 'XMETAR ' + data[1];
        is_note = false;
        callback([xmetar_result]);
        return;
    } 
    
    xmetar_result = {
        uid: xmetar_result_uid,
        label: 'XMETAR ' + data[1],
        subtext: 'Enter ICAO code to get METAR information',
        execute: () => {
            console.log('Executing XMETAR for ' + icao);
            this.mode = metar_mode.airport;
            this.$api.airports.find_airport_by_icao(guid, icao, (airports) => {
                if (!airports || airports.length == 0) {
                    debug_on && console.log('No airport found for ICAO code ' + icao);
                    xmetar_result.subtext = '<p>No airport found for ICAO code <i>' + icao + '</i></p>';
                    xmetar_result.is_note = true;
                    callback([xmetar_result]);
                    return;
                }
                // console.log('Airport found: ' + JSON.stringify(airports[0]));
                // console.log('Airport found: airportClass=' + JSON.stringify(airports[0].airportClass));
                console.log('Airport found: ' + airports[0].lat + ' - ' + airports[0].lon);

                this.airport = airports[0];
                this.$api.weather.find_metar_from_coords(this.airport.lat, this.airport.lon, (metar_callback) => {
                    getMETAR.call(this, metar_callback, xmetar_result, callback);
                    return true;
                })
            })
            return true;
        }
    };
    
    callback([xmetar_result]);
    return true;
});

// Executed when the tile in the wheel is hovered or selected
// Shows the ICAO and airport name in the tile info area
info(() => {
    if (!this.icao) { return "xMETAR"; }
    result = this.icao;
    if (this.icao != this.metar_icao) { result += `/${this.metar_icao}`; }
    result += `<br/>${this.airport_name && this.airport_name.substring(0,20) + (this.airport_name.length > 20 ? '...' : '')}`;
    return result;
});

style(() => { 
    if (this.host_el) {
        if (this.widgetStore.active) {
            this.host_el.classList.add('visible');
        }
        else {
            this.host_el.classList.remove('visible');
        }
    }
    if (this.widgetStore.active) {
        return 'active';
    } else {
        if (this.icao) {
            return 'armed';
        } else {
            return null;
        }
    }
})

// Constants for Canvas
const font_size = 13;

// Drawing functions
const cloudCounts = {
  FEW: 2,
  SCT: 4,
  BKN: 7,
  OVC: 10,
  VV: 20,
};

function drawCloudLayer(x, yBottom, width, rowH, layer) {
    const count = cloudCounts[layer.code] || 3;
    const radius = 10; 

    // Convert altitude to pixel Y
    const baseFt = Math.min(layer.height, 5000);
    const yBase = yBottom - (baseFt / 5000) * (rowH * 5);

    const spacing = width / count;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(255,255,255,0.6)";

    if (layer.code === 'VV') {
        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 64, 64, 0.6)";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, yBase);
        this.ctx.lineTo(x + width, yBase);
        this.ctx.stroke();
        this.ctx.restore();
    } else {
        for (let i = 0; i < count; i++) {
            const cx = x + spacing * i + spacing / 2;
            const cy = yBase - radius; // bottom touches cloud base

            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "bold 12px sans-serif";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(layer.code, x + width + 6, yBase - (layer.code === 'VV' ? 0 : radius));

    this.ctx.restore();
}

function drawCloudDiagram(x, yBottom, width, height, clouds) {
    const maxFt = 5000;
    const stepFt = 1000;
    const rows = maxFt / stepFt;
    const rowH = height / rows;

    this.ctx.save();

    // Grid + labels
    this.ctx.strokeStyle = "#ccc";
    this.ctx.lineWidth = 1;
    this.ctx.font = "11px sans-serif";
    this.ctx.fillStyle = "#000";

    for (let i = 0; i <= rows; i++) {
        const y = yBottom - i * rowH;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + width, y);
        this.ctx.stroke();

        this.ctx.fillText(`${i * stepFt}`, x - 30, y + 4);
    }

    // Draw clouds
    this.ctx.fillStyle = "#fff";
    this.ctx.font = "bold 14px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    if (!clouds || clouds.length === 0) {
        this.ctx.fillText("CAVOK / NSC", x + width / 2, yBottom - height / 2);
    } else {
        const filteredClouds = clouds.filter(layer => layer.height <= 5000);
        if (filteredClouds.length === 0) {
            this.ctx.fillText("Clouds above 5000 ft", x + width / 2, yBottom - height - rowH / 2);
        } else {
            filteredClouds.forEach(layer => {
                drawCloudLayer.call(this, x, yBottom, width, rowH, layer);
            });
        }
    }

    this.ctx.restore();
}

function degToRad(deg) {
    return (deg - 90) * (Math.PI / 180);
}

function degToCanvasRad(deg) {
    return deg * (Math.PI / 180);
}

function drawCircle(x, y, radius, color) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    lineWidth = 2;
    // this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.fill();
}

function drawCompassLabel(cx, cy, r, deg) {
    const labels = {270: "N", 0: "E", 90: "S", 180: "W" };

    const a = degToCanvasRad(deg);
    const inset = 18;

    this.ctx.save();
    this.ctx.font = "bold 12px sans-serif";
    this.ctx.fillStyle = "#FFF";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    this.ctx.fillText(
        labels[deg],
        cx + Math.cos(a) * (r - inset),
        cy + Math.sin(a) * (r - inset)
    );

    this.ctx.restore();
}

function drawCompassRose(cx, cy, r) {
  this.ctx.save();

  for (let deg = 0; deg < 360; deg += 10) {
    const a = degToCanvasRad(deg);

    const isMajor = deg % 30 === 0;
    const tickLen = isMajor ? 10 : 5;

    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r - tickLen);
    const y2 = cy + Math.sin(a) * (r - tickLen);

    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.lineWidth = isMajor ? 2 : 1;
    this.ctx.strokeStyle = "#FFF";
    this.ctx.stroke();

    // Cardinal labels
    if (deg % 90 === 0) {
      drawCompassLabel.call(this, cx, cy, r, deg);
    }
  }

  this.ctx.restore();
}

function drawRunwayText(x, y, text) {
  this.ctx.save();
  this.ctx.font = "bold 14px sans-serif";
  this.ctx.fillStyle = "#FFF";
  this.ctx.textAlign = "center";
  this.ctx.textBaseline = "middle";
  this.ctx.fillText(text, x, y);
  this.ctx.restore();
}

function runwayLabelPositions(cx, cy, r, angleDeg) {
  const d = r * 0.83;
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

const runwayColors = {
    0: { "name": "concrete", "color": "#9e9e9e"},
    1: { "name": "grass", "color": "#4f7f4f"},
    4: { "name": "asphalt", "color": "#4a4a4a"},
    5: { "name": "grass", "color": "#4f7f4f"},
    12: { "name": "dirt", "color": "#8b6b4f"},
    14: { "name": "gravel", "color": "#b5a27a"},
    17: { "name": "bituminous", "color": "#5f6f7f"},
    34: { "name": "unknown", "color": "#777777"},
    255: { "name": "unknown", "color": "#777777"},
}

function mapSurfaceToColor(surface, icao) {
    if (!surface || !runwayColors[surface]) {
        if (!runwayColors[surface]) {
            console.warn(`xMETAR: Unknown surface at ${icao}: ${surface}`);
        }
        return runwayColors[34].color;
    } else {
        return runwayColors[surface].color;
    }
}

function runwayLateralOffset(letter, spacing, icao) {
  switch (letter) {
    case "L": return  spacing;
    case "R": return -spacing;
    case "C": return  0;
    case "":  return  0;
    default:  
        console.warn(`xMETAR: Unknown runway designator at ${icao}: '${letter}'`);
        return  0;
  }
}

function drawRunway(cx, cy, r, runway, icao) {
    const angleDeg = runway.direction;
    const a = degToRad(runway.direction);
    const suffix1 = runway.primaryName.replace(/[0-9]/g, '');
    const suffix2 = runway.secondaryName.replace(/[0-9]/g, '');

    // Direction vector
    const dx = Math.cos(a);
    const dy = Math.sin(a);

    // Lateral normal (perpendicular)
    const nx = -dy;
    const ny = dx;

    // Offset magnitude
    const lateralOffset = runwayLateralOffset(suffix1, 25, icao);

    // Offset centerline
    const ox = cx + nx * lateralOffset;
    const oy = cy + ny * lateralOffset;

    // Runway endpoints
    const x1 = ox + dx * r;
    const y1 = oy + dy * r;
    const x2 = ox - dx * r;
    const y2 = oy - dy * r;

    // Draw runway
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = mapSurfaceToColor(runway.surface, icao);
    this.ctx.lineWidth = 10;
    this.ctx.stroke();

    // Draw runway designators without letters.
    const [p1, p2] = runwayLabelPositions(ox, oy, r, angleDeg);
    const designators = runway.designation.split('-');
    drawRunwayText.call(this, p1.x, p1.y, designators[1].padStart(2, '0') + suffix1);
    drawRunwayText.call(this, p2.x, p2.y, designators[0].padStart(2, '0') + suffix2);
}

function drawArrow(x, y, angle, length, color = "red") {
    const half = length / 2;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    this.ctx.beginPath();
    this.ctx.moveTo(-half, 0);
    this.ctx.lineTo(half, 0);
    this.ctx.moveTo(-half, 0);
    this.ctx.lineTo(-half + 10, 6);
    this.ctx.moveTo(-half, 0);
    this.ctx.lineTo(-half + 10, -6);

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.restore();
}

function drawWindSpeed(cx, cy, angleRad, arrowLength, speed, color = "red") {
    if (speed == null) return;

    const offset = -5; // distance beyond arrow tip

    const tx = cx + Math.cos(angleRad) * (arrowLength + offset);
    const ty = cy + Math.sin(angleRad) * (arrowLength + offset);

    this.ctx.save();
    this.ctx.font = "bold 13px sans-serif";
    this.ctx.fillStyle = color;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    this.ctx.fillText(`${speed}`, tx, ty);
    this.ctx.restore();
}

function drawWind(cx, cy, r, wind, length = 40) {
    let color = "red", fillColor = "rgba(255,90,90,0.25)";

    if (!isNaN(wind.speed)) {
        if (wind.speed <= 10) { color = "lime"; fillColor = "rgba(90,255,90,0.15)"; }
        if (wind.speed > 10 && wind.speed <= 20) { color = "yellow"; fillColor = "rgba(255,255,90,0.25)"; }
        if (wind.speed > 20 && wind.speed <= 30) { color = "darkOrange"; fillColor = "rgba(255,165,0,0.25)"; }
    }
    
    if (wind.degrees === "VRB" || wind.speed == 0) {
        this.ctx.save();
        this.ctx.font = "bold 18px sans-serif";
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(wind.speed == 0 ? "No Wind" : "VRB", cx, cy);
        this.ctx.restore();
        drawWindSpeed.call(this, cx, cy - 15, degToRad(0), 10, wind.speed + "kt", color);
    } else {
        const a = degToRad(wind.degrees);

        if (wind.from && wind.to) {
            const startRad = degToRad(wind.from + 180);
            const endRad = degToRad(wind.to + 180);
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.arc(cx, cy, length + 5, startRad, endRad);
            this.ctx.closePath();
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
            debug_on && console.log(`Drawing wind variation arc from ${wind.from} to ${wind.to}`);
        }
        drawArrow.call(this, cx, cy, degToRad(wind.degrees), length, color);
        drawWindSpeed.call(this, cx, cy, degToRad(wind.degrees + 180), length, wind.speed + "kt", color);
    }
}

function formatVisibility(visibility) {
    // visibility = {m: Number, sm: Number, source: String, sm_original: String};

    if (!visibility) return null;

    if (visibility.source == "m") {
        if (visibility.m >= 9999) return "VIS >= 10 km";
        return `VIS ${visibility.m} m`;
    } else if (visibility.source == "SM") {
        if (visibility.sm_original) {
            return `VIS ${visibility.sm_original} SM`;
        } else {
            if (visibility.sm >= 10) return "VIS >= 10 SM";
            return `VIS ${visibility.sm} SM`;
        }
    } else {
        return "VIS ≥10km";
    }
}

function drawVisibility(x, y, width, visibility) {
    const text = formatVisibility(visibility);
    if (!text) return;

    this.ctx.save();
    this.ctx.fillStyle = "#fff";
    this.ctx.font = `${font_size}px sans-serif`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    this.ctx.fillText(text, x, y);
    this.ctx.restore();
}

function drawAirportId(x, y, width, airport) {
    this.ctx.save();
    this.ctx.fillStyle = "#e0e0ff";
    this.ctx.font = `bold ${font_size}px sans-serif`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    if (airport) {
        this.ctx.fillText(`${this.mode == metar_mode.position ? 'Near: ' : ''}${airport.icao} ${airport.name}`, x, y);
    } else {
        this.ctx.fillText('In Air', x, y);
    }
    this.ctx.restore();
}

function calcRelativeHumidity(tempC, dewpointC) {
  const a = 17.625;
  const b = 243.04;

  const alphaT = (a * tempC) / (b + tempC);
  const alphaTd = (a * dewpointC) / (b + dewpointC);

  return Math.round(100 * Math.exp(alphaTd - alphaT));
}

function drawTempDewRh(x, y, width, temp) {
    const rh = calcRelativeHumidity(temp.temp.c, temp.dew.c);

    this.ctx.save();
    this.ctx.fillStyle = "#fff";
    this.ctx.font = `${font_size}px sans-serif`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    let text = '';
    if (this.widgetStore.tempInCelsius) {
        text = `T/D ${Math.round(temp.temp.c)}C/${Math.round(temp.dew.c)}C  RH ${rh}%`;
    } else {
        text = `T/D ${Math.round(temp.temp.f)}F/${Math.round(temp.temp.f)}F  RH ${rh}%`;
    }
    this.ctx.fillText(text, x, y);

    this.ctx.restore();
}

function drawQnhAltimeter(x, y, width, pressure) {
    // pressure = {'hpa': Number, 'inhg': Number}
    this.ctx.save();

    this.ctx.fillStyle = "#fff";
    this.ctx.font = `${font_size}px sans-serif`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    let text = "";
    if (this.widgetStore.qnhInHpa) {
        text += `QNH ${Math.round(pressure.hpa)}`;
    } else {
        text += `QNH ${pressure.inhg.toFixed(2)}`
    }

    this.ctx.fillText(text, x, y);
    this.ctx.restore();
}

function getFlightCategory(metar) {
    const allowedCloudCodes = ['BKN', 'OVC'];
    const first = (metar.clouds || []).find(cloud => allowedCloudCodes.includes(cloud.code)) || null;
    const ceilingFt = first ? first.height : 99999;
    const visibilitySm = metar.visibility ? metar.visibility.sm : 10;

    if (ceilingFt < 500 || visibilitySm < 1) return "LIFR";
    if (ceilingFt < 1000 || visibilitySm < 3) return "IFR";
    if (ceilingFt < 3000 || visibilitySm < 5) return "MVFR";
    return "VFR";
}

const flightCategoryColors = {
    VFR: "#00c853",
    MVFR: "#2979ff",
    IFR: "#d50000",
    LIFR: "#aa00ff"
};

function drawFlightCategoryBadge(x, y, category) {
    const w = 48;
    const h = 20;
    const r = 6;

    this.ctx.save();
    this.ctx.fillStyle = flightCategoryColors[category] || "#777";

    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = "#fff";
    this.ctx.font = `bold ${font_size}px sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(category, x + w / 2, y + h / 2);

    this.ctx.restore();
}

function doRender() {
    if (!this.ctx) {
        console.error('xMETAR: No canvas context for rendering');
        return;
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const radius = 120;
    const cx = radius + 10;
    const cy = radius + 10;
    
    drawCircle.call(this, cx, cy, radius, '#004000'); // ok
    if (this.metar) {
        if (this.airport) {
            for (const runway of this.airport.runways) {
                drawRunway.call(this, cx, cy, radius - 30, runway, this.airport.icao); // ok
            }
        }
        drawWind.call(this, cx, cy, radius, this.metar.wind, 50); // ok
        
        drawCloudDiagram.call(this, 290, 175, 170, 150, this.metar.clouds); // ok
        
        const lineHeight = 17, start = 183;
        drawTempDewRh.call(this, 290, start, 170, this.metar.temp); // ok
        drawQnhAltimeter.call(this, 290, start + lineHeight, 170, this.metar.press); // ok
        drawVisibility.call(this, 290, start + 2 * lineHeight, 170, this.metar.visibility); // ok
        drawAirportId.call(this, 290, start + 3 * lineHeight, 170, this.airport); // ok
        
        drawFlightCategoryBadge.call(this, 440, 210, getFlightCategory(this.metar)); // ok
    }
    drawCompassRose.call(this, cx, cy, radius);
}

html_created(el => {
    this.host_el = el.querySelector('#Ape42_xmetar');
    this.canvas = el.querySelector('#Ape42_xmetar_canvas');
    this.metar_line = el.querySelector('#Ape42_xmetar_container');

    if (!this.canvas) {
        console.error('xMETAR: Canvas not found');
        return;
    }
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
        console.error('xMETAR: Canvas context not found');
        return;
    }

    // HiDPI scaling
    try {
        const dpr = this.host_el.devicePixelRatio || 1;
        const cssWidth = this.canvas.clientWidth || 500;
        const cssHeight = this.canvas.clientHeight || 340;
        this.canvas.width = Math.round(cssWidth * dpr);
        this.canvas.height = Math.round(cssHeight * dpr);
        this.canvas.style.width = cssWidth + 'px';
        this.canvas.style.height = cssHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        debug_on && console.log(`xMETAR: Set HiDPI scaling with DPR=${dpr}`);
    } catch (e) {
        debug_on && console.error('xMETAR: Error setting HiDPI scaling: ' + e);
    }

    debug_on && console.log('xMETAR: Canvas context initialized');
    doRender.call(this);
});