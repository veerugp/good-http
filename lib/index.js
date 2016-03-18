'use strict';
// Load modules

const Stream = require('stream');
const Os = require('os');

const Stringify = require('json-stringify-safe');
const Wreck = require('wreck');

// Declare internals

const internals = {
    defaults: {
        threshold: 20,
        schema: 'good-http',
        wreck: {
            timeout: 60000,
            headers: {}
        }
    },
    host: Os.hostname()
};

class GoodHttp extends Stream.Writable {
    constructor(endpoint, config) {

        config = config || {};
        const settings = Object.assign({}, internals.defaults, config);

        super({ objectMode: true, decodeStrings: false });
        this._settings = settings;
        this._endpoint = endpoint;
        this._data = [];

        // Standard users
        this.once('finish', () => {

            this._sendMessages();
        });
    }
    _write(data, encoding, callback) {

        this._data.push(data);
        if (this._data.length >= this._settings.threshold) {
            this._sendMessages((err) => {

                // always clear the data so we don't buffer this forever if there is ever a failed POST
                this._data = [];
                return callback(err);
            });
        }
        else {
            setImmediate(callback);
        }
    }
    _sendMessages(callback) {

        const envelope = {
            host: internals.host,
            schema: this._settings.schema,
            timeStamp: Date.now(),
            events: this._data
        };

        const wreckOptions = Object.assign({}, this._settings.wreck, {
            payload: Stringify(envelope)
        });

        // Prevent this from user tampering
        wreckOptions.headers['content-type'] = 'application/json';
        Wreck.request('post', this._endpoint, wreckOptions, callback);
    }
}


module.exports = GoodHttp;
