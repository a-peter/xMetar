// Version 0.1
// Author: Ape42

let xmetar_result = null;
let guid = 'df8f1874-245e-44b6-b017-0a69eeb5c231'
let xmetar_result_uid = 'xmetar_result_uid';
const prefixes = ['xmetar'];

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
                    callback([xmetar_result]);
                })
            })
            return false;
        }
    };
    
    callback([xmetar_result]);
});
