'use strict';
// Load modules

const EventEmitter = require('events').EventEmitter;
const Stream = require('stream');
const Http = require('http');
const Code = require('code');
const Lab = require('lab');
const lab = exports.lab = Lab.script();
const GoodHttp = require('..');
const Hoek = require('hoek');

// Declare internals

const internals = {};

internals.isSorted = function (elements) {

    let i = 0;

    while (i < elements.length && elements[i + 1]) {

        if (elements[i].timestamp > elements[i + 1].timestamp) {
            return false;
        }
        ++i;
    }
    return true;
};

internals.getUri = function (server) {

    const address = server.address();

    return 'http://' + address.address + ':' + address.port;
};

internals.readStream = (done) => {

    const result = new Stream.Readable({ objectMode: true });
    result._read = Hoek.ignore;

    if (typeof done === 'function') {
        result.once('end', done);
    }

    return result;
};

// Test shortcuts

const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('GoodHttp', () => {

    it('allows creation without using new', (done) => {

        const reporter = GoodHttp({ log: '*' }, { endpoint: true });
        expect(reporter).to.exist();
        done();
    });

    it('allows creation using new', (done) => {

        const reporter = new GoodHttp({ log: '*' }, { endpoint: true });
        expect(reporter).to.exist();
        done();
    });

    it('throws an error if missing endpoint', (done) => {

        expect(() => {

            GoodHttp(null, null);
        }).to.throw('config.endpoint must be a string');
        done();
    });

    it('does not report if the event queue is empty', (done) => {

        const reporter = GoodHttp({ log: '*' }, { endpoint: 'http://localhost:31337', threshold: 5 });
        const result = reporter._sendMessages();
        expect(result).to.not.exist();
        done();
    });

    it('honors the threshold setting and sends the events in a batch', (done) => {

        const stream = internals.readStream();
        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            let data = '';
            hitCount++;

            req.on('data', (chunk) => {

                data += chunk;
            });
            req.on('end', () => {

                const payload = JSON.parse(data);
                const events = payload.events.log;

                expect(req.headers['x-api-key']).to.equal('12345');
                expect(payload.schema).to.equal('good-http');
                expect(events.length).to.equal(5);

                if (hitCount === 1) {
                    expect(events[4].id).to.equal(4);
                    expect(events[4].event).to.equal('log');
                    res.end();
                }
                else if (hitCount === 2) {
                    expect(events[4].id).to.equal(9);
                    expect(events[4].event).to.equal('log');

                    res.end();
                    server.close(done);
                }
            });
        });

        server.listen(0, '127.0.0.1', () => {

            const reporter = GoodHttp({ log: '*' }, {
                endpoint: internals.getUri(server),
                threshold: 5,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                }
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                for (let i = 0; i < 10; ++i) {
                    stream.push({
                        id: i,
                        value: 'this is data for item ' + 1,
                        event: 'log'
                    });
                }
            });
        });
    });

    it('sends each event individually if threshold is 0', (done) => {

        const stream = internals.readStream();
        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            let data = '';
            req.on('data', (chunk) => {

                data += chunk;
            });
            req.on('end', () => {

                hitCount++;
                const payload = JSON.parse(data);

                expect(payload.events).to.exist();
                expect(payload.events.log).to.exist();
                expect(payload.events.log.length).to.equal(1);
                expect(payload.events.log[0].id).to.equal(hitCount - 1);

                res.writeHead(200);
                res.end();
                if (hitCount === 10) {
                    server.close(done);
                }
            });
        });

        server.listen(0, '127.0.01', () => {

            const reporter = new GoodHttp({ log: '*' }, {
                endpoint: internals.getUri(server),
                threshold: 0
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                for (let i = 0; i < 10; ++i) {

                    stream.push({
                        id: i,
                        value: 'this is data for item ' + 1,
                        event: 'log'
                    });
                }
            });
        });
    });

    it('sends the events in an envelop grouped by type and ordered by timestamp', (done) => {

        const stream = internals.readStream();
        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            hitCount++;
            let data = '';

            req.on('data', (chunk) => {

                data += chunk;
            });

            req.on('end', () => {

                const payload = JSON.parse(data);
                const events = payload.events;

                expect(req.headers['x-api-key']).to.equal('12345');
                expect(payload.schema).to.equal('good-http');

                expect(events.log).to.exist();
                expect(events.request).to.exist();

                expect(internals.isSorted(events.log)).to.equal(true);
                expect(internals.isSorted(events.request)).to.equal(true);

                if (hitCount === 1) {
                    expect(events.log.length).to.equal(3);
                    expect(events.request.length).to.equal(2);
                    res.end();
                }
                else if (hitCount === 2) {
                    expect(events.log.length).to.equal(2);
                    expect(events.request.length).to.equal(3);
                    res.end();
                    server.close(done);
                }
            });
        });

        server.listen(0, '127.0.0.1', () => {

            const reporter = new GoodHttp({
                log: '*',
                request: '*'
            }, {
                endpoint: internals.getUri(server),
                threshold: 5,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                }
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                for (let i = 0; i < 10; ++i) {

                    const eventType = i % 2 === 0 ? 'log' : 'request';

                    stream.push({
                        id: i,
                        value: 'this is data for item ' + 1,
                        timestamp: Math.floor(Date.now() + (Math.random() * 10000000000)),
                        event: eventType
                    });
                }
            });
        });
    });

    it('won\'t group events when mapEvents is false', (done) => {

        const stream = internals.readStream();
        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            hitCount++;
            let data = '';

            req.on('data', (chunk) => {

                data += chunk;
            });

            req.on('end', () => {

                const payload = JSON.parse(data);
                const events = payload.events;

                expect(req.headers['x-api-key']).to.equal('12345');
                expect(payload.schema).to.equal('good-http');

                expect(events.log).to.not.exist();
                expect(events.request).to.not.exist();

                if (hitCount === 1) {
                    res.end();
                }
                else if (hitCount === 2) {
                    expect(events.length).to.equal(5);
                    res.end();
                    server.close(done);
                }
            });
        });

        server.listen(0, '127.0.0.1', () => {

            const reporter = new GoodHttp({
                log: '*',
                request: '*'
            }, {
                endpoint: internals.getUri(server),
                threshold: 5,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                },
                mapEvents: false
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                for (let i = 0; i < 10; ++i) {

                    const eventType = i % 2 === 0 ? 'log' : 'request';

                    stream.push({
                        id: i,
                        value: 'this is data for item ' + 1,
                        timestamp: Math.floor(Date.now() + (Math.random() * 10000000000)),
                        event: eventType
                    });
                }
            });
        });
    });

    it('handles circular object references correctly', (done) => {

        const stream = internals.readStream();
        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            let data = '';
            hitCount++;

            req.on('data', (chunk) => {

                data += chunk;
            });
            req.on('end', () => {

                let events = JSON.parse(data);
                events = events.events;

                expect(events).to.exist();
                expect(events.log).to.exist();
                expect(events.log.length).to.equal(5);
                expect(events.log[0]._data).to.equal('[Circular ~.events.log.0]');

                expect(hitCount).to.equal(1);

                res.end();

                server.close(done);
            });
        });

        server.listen(0, '127.0.0.1', () => {

            const reporter = new GoodHttp({ log: '*' }, {
                endpoint: internals.getUri(server),
                threshold: 5
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                for (let i = 0; i < 5; ++i) {

                    const data = {
                        event: 'log',
                        timestamp: Date.now(),
                        id: i
                    };

                    data._data = data;

                    stream.push(data);
                }
            });
        });
    });

    it('makes a last attempt to send any remaining log entries when the read stream ends', (done) => {

        let hitCount = 0;
        const ee = new EventEmitter();
        const server = Http.createServer((req, res) => {

            let data = '';
            hitCount++;

            req.on('data', (chunk) => {

                data += chunk;
            });
            req.on('end', () => {

                const payload = JSON.parse(data);
                const events = payload.events;

                expect(events.log).to.exist();
                expect(events.log.length).to.equal(2);

                res.end();
                server.close(done);
            });
        });

        server.listen(0, '127.0.0.1', () => {

            const stream = internals.readStream();
            const reporter = new GoodHttp({ log: '*' }, {
                endpoint: internals.getUri(server),
                threshold: 3,
                wreck: {
                    headers: {
                        'x-api-key': 12345
                    }
                }
            });

            reporter.init(stream, ee, (err) => {

                expect(err).to.not.exist();

                stream.push({
                    event: 'log',
                    timestamp: Date.now(),
                    id: 1
                });
                stream.push({
                    event: 'log',
                    timestamp: Date.now(),
                    id: 2
                });
                stream.push(null);
            });
        });
    });
});
