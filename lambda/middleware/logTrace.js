const stringify = require('json-stringify-safe');

module.exports = (log) => {
    if (!log) log = console.log;
    return {
        before: (handler, next) => {
            if (!handler || !handler.event) {
                log('logTrace before - no event in handler');
                next();
            }

            log('logTrace before', stringify(handler.event));
            next();
        },
        after: (handler, next) => {
            if (!handler || !handler.response) {
                log('logTrace after - no response in handler');
                next();
            }
            log('logTrace after', stringify(handler.response));
            next();
        }
    }
}

module.exports.toString = () => 'logTrace';