const
    AWSXRay = require('aws-xray-sdk');

module.exports = (log) => {
    return {
        before: (handler, next) => {
            AWSXRay.captureHTTPsGlobal(require('http'));
            next();
        }
    }
}