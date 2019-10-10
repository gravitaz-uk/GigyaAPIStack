const stringify = require('json-stringify-safe');

var log = console.log;

module.exports = (defaultHeaders) => {
    return {
        before: (handler, next) => {
            if (!handler || !handler.event || !handler.event.headers) {
                next();
            }
            try {
                // properties in defaultHeaders are applied if not already there
                handler.event.headers = {...defaultHeaders, ...handler.event.headers}
            } catch (e) {
                log('error in setDefaultHeaders middleware', e);
            }
            // insert a basic authorisation header if not supplied by caller

            if (process.env.DEBUG) log('defaultHeaders - event headers', stringify(handler.event.headers));
            next();
        }
    }
}

module.exports.toString = () => 'httpHeaderDefaults';