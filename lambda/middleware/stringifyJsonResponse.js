const stringify = require('json-stringify-safe');

module.exports = () => {
    return {
        after: (handler, next) => {
            try {
                handler.response.body = stringify(handler.response.body);
            } catch (e) {
                console.log('stringifyJsonResponse error', e);
            }
            next();
        }
    }
}

module.exports.toString = () => 'stringifyJsonResponse';