// Version 0.2
// Author: Ape42

let xmetar_result = null;
let guid = 'df8f1874-245e-44b6-b017-0a69eeb5c231'
let xmetar_result_uid = 'xmetar_result_uid';
const prefixes = ['xmetar'];

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
    for (let i = 0; i < metar_parts.length; i++) {
        // Preconditions for missing parts
        if (mode < 3 && metar_parts[i].match(/^(\d+)(?:\/(\d+))?(SM)?$/)) { // /^[0-9]{2}\/[0-9]{2}$/
            mode = 3; // no wind reported
            console.log('No wind reported');
        }
        if (mode < 5 && metar_parts[i].match(/^(FEW|SCT|BKN|OVC|NCD)\s+?/)) {
            mode = 5; // no visibility or conditions reported
            console.log('No visibility reported');
        }
        if (mode < 6 && metar_parts[i].match(/(^(M?\d+)\/(M?\d+)$)|(^\/\/\/\/\/)/)) {
            mode = 6; // end of clouds
            console.log('End of cloud report');
        }
        console.log(`metar_parts[${i}] = ${metar_parts[i]}, mode = ${mode}`);
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
                    console.log(`xMETAR: metar_data.time: ${metar_data.time.toUTCString()}`);
                    mode = 2;
                } else {
                    console.error(`xMETAR: Failed parsing date '${metar_parts[i]}'`);
                }
                break;
            case 2:
                // Wind
                if (metar_parts[i] != 'AUTO') {
                    match = metar_parts[i].match(/^(\d\d\d|VRB)P?(\d+)(?:G(\d+))?(KT|MPS|KMH)/);
                    if (match) {
                        metar_data.wind = {};
                        metar_data.wind.degrees = match[1] === "VRB" ? 180 : match[1];
                        metar_data.wind.speed = Number(match[2]);
                        metar_data.wind.gusts = (match[3] && match[3].length > 0 ? Number(match[3]) : null);

                        if (metar_parts[i+1] != "CAVOK" && metar_parts[i+1].indexOf("V", 0) >= 0) {
                            var match2 = metar_parts[i+1].match(/^(\d\d\d)V(\d\d\d)/);
                            metar_data.wind.degrees = {};
                            metar_data.wind.degrees.from = Number(match2[1]);
                            metar_data.wind.degrees.to = Number(match2[2]);
                            i += 1;
                        }
                        // fixWindUnits(match[4]);

                        mode = 3;
                    } else {
                        console.log(`xMETAR: No wind info found in`);
                    }
                } else { // is AUTO
                    console.log(`xMETAR: Auto generated METAR`);
                }
                break;
            case 3:
                // Visibility
                match = metar_parts[i].match(/^(\d+)(?:\/(\d+))?(SM)?$/);
                metar_data.visibility = {};
                if (metar_parts[i] === "CAVOK") {
                    metar_data.visibility.m = 9999;
                    metar_data.visibility.sm = 10;
                } else if (match) {
                    // AaoCmd.log(match[0] + "-" + match[1] + "-" + match[2] + "-" + match[3]);
                    if (match[3]) { // unit is SM
                        if (match[2]) { // visibility contains a fraction
                            metar_data.visibility.sm = Number(match[1])/Number(match[2]);
                            // var whole = Math.floor(match[1] / match[2]);
                            // var part = match[1] % match[2];
                            // metar_data.visibility.sm, String) = "" + (whole == 0 ? "" : whole + " ") + part + "/" + match[2];
                        } else { // visibility contains a whole number.
                            metar_data.visibility.sm = Number(match[1]);
                        }

                        metar_data.visibility.m = Math.ceil(miles2meters(metar_data.visibility.sm));
                    } else { // no unit -> meters
                        // AaoCmd.log(match[0] + "-" + match[1] + " " + match[2] + " " + match[3]);
                        metar_data.visibility.m = match[1];
                        metar_data.visibility.sm = metar_data.visibility.m == 9999 ? 10 : meters2miles(metar_data.visibility.m);
                    }
                    mode = 4;
                } else {
                    console.log("No vis match");
                }
                break;
            case 4:
                // Weather conditions
                if (metar_parts[i].match(/^(FEW|SCT|BKN|OVC|NCD)\s+?/)) {
                    mode = 5;
                }
                break;
            case 5:
                // Sky conditions
                if (metar_parts[i].match(/(^(M?\d+)\/(M?\d+)$)|(^\/\/\/\/\/)/)) {
                    mode = 6;
                }
                break;
            case 6:
                // Temperature
                break;
            case 7:
                // Pressure
                break;
        }
    }

    return metar_data;

    // let icao = metar_parts[0];
    // let time = metar_parts[1];
    // let wind = metar_parts[2];
    // let visibility = metar_parts[3];
    // let weather = '';
    // let sky_conditions = [];
    // let temperature = '';
    // let pressure = '';  
    // for (let part of metar_parts.slice(4)) {
    //     if (part.match(/^[0-9]{2}\/[0-9]{2}$/)) {
    //         temperature = part;
    //     } else if (part.startsWith('A') && part.length == 5) {
    //         pressure = part;
    //     } else if (part.match(/^(FEW|SCT|BKN|OVC)[0-9]{3}$/)) {
    //         sky_conditions.push(part);
    //     } else {
    //         weather += part + ' ';
    //     }
    // }
}

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
            this.$api.airports.find_airport_by_icao(guid, icao, (airports) => {
                let lat = airports[0].lat;
                let lon = airports[0].lon;

                this.$api.weather.find_metar_from_coords(lat, lon, (metar_callback) => {
                    console.log('METAR: ' + JSON.stringify(metar_callback.metarString));
                    if (airports[0].icao != metar_callback.icao) {
                        xmetar_result.subtext = '<p>No METAR for <i>' + icao + '</i> using <i>' + metar_callback.icao + '</i></p>';
                    }
                    xmetar_result.subtext += '<p>' + metar_callback.metarString + '</p>';
                    xmetar_result.is_note = true;

                    metar = parse_metar(metar_callback.metarString);
                    console.log('Parsed METAR: ' + JSON.stringify(metar));

                    callback([xmetar_result]);
                })
            })
            return false;
        }
    };
    
    callback([xmetar_result]);
});
