const assert = require('assert'),
      nock = require('nock'),
      config = require('../lib/config'),
      logger = require('../lib/logger'),
      sinon = require('sinon')

const geocode = require('../lib/geocode'),
      allstops = require('../gtfs/geojson/stops.json')


describe('Geocode Module', function() {
    before(function(){ nock.disableNetConnect()})
    after(function(){ nock.enableNetConnect()})
    afterEach(function(){
        nock.cleanAll()
    })
    const responses = require('./fixtures/googleMapsResponses')
    let get_stops

    it('Should request the correct Google Maps API URL', function(){
        var address = '632 W. 6th Street'
        var n = nock('https://maps.googleapis.com')
            .get('/maps/api/geocode/json')
            .query({
                address: address, // nock seems to URI encode this for us
                components: `country:US|administrative_area:${config.GOOGLE_GEOCODE_LOCATION}`,
                key: process.env.GOOGLE_MAPS_KEY
            })
            .reply(200, responses.goodResponse)

        return geocode.stops_near_location(address)
        .then(r => n.done(), err => n.done())
    })

    describe('With normal responses', function(){
        beforeEach(function(){
            nock('https://maps.googleapis.com').get(/^\/maps/)
                .reply(200, responses.goodResponse )
            get_stops = geocode.stops_near_location("634 W. 6th Street")
        })
        it('Should return a geocoded address', function(){
            return get_stops
                .then(resp => assert(resp.data.geocodedAddress == responses.goodResponse.results[0].formatted_address))
        })
        it('Should return stops that have a numeric stopId property', function(){
            return get_stops.then(resp => assert(resp.data.stops.every(stop => /^\d+$/.test(stop.stopId))))
        })
        it('Should return stops with a distance property less than NEAREST_BUFFER', function(){
            return get_stops.then(resp => assert(resp.data.stops.every(stop => stop.distance < config.NEAREST_BUFFER)))
        })
        it('Should return an array of no more than NEAREST_MAX stops', function(){
            return get_stops
                .then(resp => assert(Array.isArray(resp.data.stops) && resp.data.stops.length <= config.NEAREST_MAX))
        })
        it('Should return stops with a ll property that parses to a lat/lon', function(){
            var latlonregex = /^[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?),\s*[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)$/
            return get_stops.then(resp => assert(resp.data.stops.every(stop => latlonregex.test(stop.ll))))
        })
        it('Should return stops with a route property', function() {
            return get_stops.then(resp => assert(resp.data.stops.every(stop => stop.route && typeof stop.route == 'string')))
        })
        it('Should return a Not_Found error with no input', function(){
            return geocode.stops_near_location().then(resp =>
                { throw new Error("Promise should not be fulfilled when input is blank")},
                  err => assert(err.type == 'NOT_FOUND'))
        })
    })
    describe('Accurate Timings', function(){
        var timeTick = 100 //ms
        var clock
        beforeEach(function(){
            clock = sinon.useFakeTimers()
            nock('https://maps.googleapis.com').get(/^\/maps/)
                .reply(200, () => (clock.tick(timeTick), responses.goodResponse))
        })
        afterEach(function(){
            clock.restore()
        })
        it('Should report accurate response time for geocoder', function(){
            get_stops = geocode.stops_near_location("634 W. 6th Street")
            return get_stops.then(resp => assert.equal(resp.geocodeTime, timeTick))
        })
    })
    describe('With locations outside the service area ', function() {
        beforeEach(function(){
            nock('https://maps.googleapis.com').get(/^\/maps/)
                .reply(200, responses.glennAlpsLocation )
            get_stops = geocode.stops_near_location("13735 Canyon Rd")
        })

        it('Should return an object with an empty stops array in data', function() {
            return get_stops.then(resp => assert(Array.isArray(resp.data.stops) && resp.data.stops.length ==0))
        })
    })

    describe("With locations that google can't find", function() {
        beforeEach(function(){
            nock('https://maps.googleapis.com').get(/^\/maps/)
                .reply(200, responses.nonspecificResponse )
            get_stops = geocode.stops_near_location("785 Clusterfuddle Lane")
        })
        it('Should return a rejected promise with NOT_FOUND error', function() {
            return get_stops.then(resp => {throw new Error("Promise should not be fulfilled when location isn't found")},
                             err => assert(err.type == 'NOT_FOUND')
            )})
    })
    describe("When it returns a Bad HTTP code", function() {
        var logs
        beforeEach(function(){
            nock('https://maps.googleapis.com').get(/^\/maps/)
                .reply(200, responses.badRequest )
            get_stops = geocode.stops_near_location("632 W. 6th Street")
            logs = sinon.stub(logger, 'error')
        })
        afterEach(function(){
            logs.restore()
        })
        it('Should return a rejected promise with GEOCODER_ERROR error and log an error', function() {
            return get_stops.then(resp => {
                throw new Error("Promise should not be fulfilled when location isn't found")},
                err => {
                    assert(err.type == 'GEOCODER_ERROR')
                    assert(logs.calledWith(err))
                }
            )})
    })
    describe("Find stops by Lat/Lon", function(){
        let aStop = allstops.features[0],
        ll = aStop.geometry.coordinates
        it('Should return an array of stops from a nearby lat/lon', function(){
            assert(Array.isArray(geocode.findNearestStops(ll[1], ll[0])))
        })
        it('Should handle strings gracefully', function(){
            assert(Array.isArray(geocode.findNearestStops(ll[1].toString(), ll[0].toString())))
        })
        it('Should return an array of no more than NEAREST_MAX stops', function(){
            assert(geocode.findNearestStops(ll[1], ll[0]).length <= config.NEAREST_MAX)
        })
        it('Given the exact coordinates of a stop, that stop should be the first returned', function(){
            assert(geocode.findNearestStops(ll[1], ll[0])[0].stopId == aStop.properties.stop_id)
        })
        it('Given distant coordinates, it should return an empty array', function(){
            assert(geocode.findNearestStops(64.754780,-147.343045).length == 0) // Santa's house, North Pole
        })
        it('Should return an empty array when given lat lon that fall outside normal range', function(){
            var ret = geocode.findNearestStops(290, -1000)
            assert(Array.isArray(ret) && ret.length == 0)
        })
    })
})

