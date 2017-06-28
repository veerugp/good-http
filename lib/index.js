'use strict';
// Load modules

const Stream = require('stream');
const Os = require('os');

const Stringify = require('fast-safe-stringify');
const Wreck = require('wreck');

// Declare internals

const internals = {
    defaults: {
        threshold: 20,
        errorThreshold: 0,
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

        if (settings.errorThreshold === null) {
            settings.errorThreshold = -Infinity;
        }

        super({ objectMode: true, decodeStrings: false });
        this._settings = settings;
        this._endpoint = endpoint;
        this._data = [];
        this._failureCount = 0;

        // Standard users
        this.once('finish', () => {

            this._sendMessages();
        });
    }
    _write(data, encoding, callback) {

        this._data.push(data);
        if (this._data.length >= this._settings.threshold) {
            this._sendMessages((err, res) => {
                
                if (err) {
                  console.log(err);
                }

                if (res) {
                  res.on('data', data => {
                    const parsed = JSON.parse(data.toString('utf8'));
                    console.log(`${res.client._host}${res.req.path}`);
                    console.log(JSON.stringify(res.headers, null, 2));
                    console.log(JSON.stringify(parsed, null, 2));
                  });
                }

                if (err && this._failureCount < this._settings.errorThreshold) {
                    this._failureCount++;
                    return callback();
                }

                this._data = [];
                this._failureCount = 0;

                return callback(this._settings.errorThreshold !== -Infinity && err);
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
        console.log(this._endpoint);
        Wreck.request('post', this._endpoint, wreckOptions, callback);
    }
}


module.exports = GoodHttp;
