'use strict';

const request        = require('request');
const parser         = require('xml2json');
const logger         = require('./logger')

const bustracker_URL = "http://bustracker.muni.org/InfoPoint/XML/"
const xml_file       = "vehiclelocation.xml"

function getLatestBusInfo (callback) {
    request(bustracker_URL+xml_file, function (err, response, body) {
        if (err) {
            logger.error(err)
            return callback(err)
        }
        const parsed_data = JSON.parse(parser.toJson(body));
        const bus_object = parsed_data['vehicle-locations'].vehicle.find(item => item.name == '60303')
        const no_service_statuses = ['out-of-service', 'not-in-service', 'none']
        if (no_service_statuses.includes(bus_object['op-status'])){
            callback(null, null);
        } else {
            callback(null, bus_object);
        }
    })
}

module.exports = {
    getLatestBusInfo: getLatestBusInfo
}
