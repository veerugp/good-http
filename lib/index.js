'use strict';
// Load modules

const Os = require('os');
const GroupBy = require('lodash.groupby');
const Hoek = require('hoek');
const Stringify = require('json-stringify-safe');
const Squeeze = require('good-squeeze').Squeeze;
const Wreck = require('wreck');

// Declare internals

const internals = {
    defaults: {
        threshold: 20,
        schema: 'good-http',
        wreck: {
            timeout: 60000,
            headers: {}
        },
        mapEvents: true
    },
    host: Os.hostname()
};


internals.createEventMap = function (events) {

    // Group the events by the event
    const result = GroupBy(events, 'event');

    // Sort each collection by the timestamp
    const keys = Object.keys(result);
    const predicate = function (a, b) {

        return a.timestamp - b.timestamp;
    };

    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const eventCollection = result[key];
        eventCollection.sort(predicate);
    }

    return result;
};


module.exports = internals.GoodHttp = function (events, config) {

    if (!(this instanceof internals.GoodHttp)) {
        return new internals.GoodHttp(events, config);
    }

    config = config || {};
    Hoek.assert(config.endpoint, 'config.endpoint must be a string');

    const settings = Hoek.applyToDefaults(internals.defaults, config);

    this._streams = {
        squeeze: Squeeze(events)
    };
    this._eventQueue = [];
    this._settings = settings;
};


internals.GoodHttp.prototype.init = function (stream, emitter, callback) {

    const self = this;

    this._streams.squeeze.on('data', (data) => {

        self._eventQueue.push(data);
        if (self._eventQueue.length >= self._settings.threshold) {
            self._sendMessages();
            self._eventQueue.length = 0;
        }
    });

    this._streams.squeeze.on('end', () => {

        self._sendMessages();
    });

    stream.pipe(this._streams.squeeze);

    callback();
};


internals.GoodHttp.prototype._sendMessages = function () {

    if (!this._eventQueue.length) {
        return;
    }

    const envelope = {
        host: internals.host,
        schema: this._settings.schema,
        timeStamp: Date.now()
    };

    envelope.events = this._settings.mapEvents ?
        internals.createEventMap(this._eventQueue) : this._eventQueue;

    const wreckOptions = {
        payload: Stringify(envelope)
    };

    Object.assign(wreckOptions, this._settings.wreck);

    // Prevent this from user tampering
    wreckOptions.headers['content-type'] = 'application/json';

    Wreck.request('post', this._settings.endpoint, wreckOptions);
};
