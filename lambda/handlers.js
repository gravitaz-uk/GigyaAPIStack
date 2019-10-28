/**
    # Gigya Proxy handler
    Provides an proxy layer between OIDC RP and Gigya endpoints. Features:
    1. hides Gigya configuration from clients - API keys, client ID, client and partner secrets
    2. Inserts an Authorisation header if not present formed from client id and secret
    3. Supports AWS X-Ray (not tested)
    4. Provides a mechanism for implementing additional security/services not supported by Gigya e.g.
    4.1 PKCE (sort of)
    4.2 Dynamic Client registration (not yet)

    Config parameters are currently stored in SSM and accessed within lambda. An alternative is to handle these within CDK.
 */

const
    crypto                  = require('crypto'),
    middy                   = require('middy'),
    stringify               = require('json-stringify-safe'),
    truthy                  = require('truthy'),
    unirest                 = require('unirest'),
    pkce                    = require('./pkce'),
    jwks                    = require('./jwks'),
    httpHeaderDefaults      = require('./middleware/httpHeaderDefaults'),
    stringifyJsonResponse   = require('./middleware/stringifyJsonResponse'),
    logTrace                = require('./middleware/logTrace'),
    awsXRay                 = require('./middleware/awsXRay'),
    { Router }              = require('./router'),
    { httpHeaderNormalizer, jsonBodyParser, httpErrorHandler, urlEncodeBodyParser, httpPartialResponse } 
                            = require('middy/middlewares');

pkce.setTableName(process.env.VERIFIER_TABLE_NAME);
var log = function () { if (truthy(process.env.DEBUG)) { console.log(...arguments) } };

let handlers = {
    sign: async function (event, context) {
        const hash = crypto.createHmac(PROCESS.env.GIGYA_SIGNATURE_ALGORITHM, Buffer.from(process.env.GIGYA_PARTNER_SECRET || "TIM", 'base64'));
        const consent_str = stringify(event.body.consent ? event.body.consent : 'default');
        const sig = hash.update(stringify(consent_str)).digest('base64').replace(/=$/g, '').replace(/\//g, '_').replace(/[+]/g, '-');
        return {
            statusCode: 200,
            body: sig
        };
    },
    showConfig: async (event, context) => {
        return {
            statusCode: 200,
            headers: { 'content-type': "application/json", pragma: 'nocache' },
            body: {
                "API_KEY": process.env.GIGYA_API_KEY,
                "CLIENT_ID": process.env.GIGYA_CLIENT_ID
            }
        };
    },
    redirectToGigya: async (event, context) => {
        if (event.queryStringParameters && event.queryStringParameters.code_challenge) {
            await pkce.saveCodeRequest(event.queryStringParameters)
        }
        const queryParams = event.queryStringParameters ?
            '?' + Object.keys(event.queryStringParameters).map(i => `${i}=${event.queryStringParameters[i]}`).join('&') : "";
        const gigyaAuthorize = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.GIGYA_API_KEY}/authorize${queryParams}`;
        log('Redirecting to ', stringify(gigyaAuthorize));
        return {
            statusCode: 302,
            headers: { 'location': gigyaAuthorize }
        }
    },
    forwardToGigya: async (event, context) => {
        let endpoint = event.path == '/userinfo' ? '/userinfo': '/token';
        let uri = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.GIGYA_API_KEY}${endpoint}`;
        delete event.headers.Host;
        if (endpoint == '/token' && event && event.body && event.body.response_type == 'code') {
            let verified = await pkce.verifyCodeChallenge(event.body);
            if (!verified) {
                log('PKCE check failed');
                return {
                    statusCode: 403,
                    body: {
                        errMsg: 'PKCE verification failure'
                    }
                }
            }
            log('PKCE check OK');
        }
        let response = await unirest(
            event.httpMethod || 'POST',
            uri,
            event.headers,
            event.body);
        if (truthy(process.env.EMBED_STATUS_CODE) && response.body && response.statusCode != 200) {
            response.body.proxyStatusCode = response.statusCode;
            response.statusCode = 200
        }
        return {
            statusCode: response.statusCode,
            body: response.body
        };
    },
    jwtdecode: async (event, context) => {
        let token = (handler.event.body && handler.event.body.token) || handler.event.queryStringParameters.token;
        let verify = handler.event.queryStringParameters && truthy(handler.event.queryStringParameters.verify);

        return await jwks.jwtdecode(token, verify);
    },
    awsAssertion: async (event, context) => {
        let id_token = handler.event.body.id_token;

    }
}

// create router and set the default handler
const router = new Router(handlers.forwardToGigya);

router
    .post('/token')
    .post('/userinfo')
    .get('/authorize',    handlers.redirectToGigya)
    .post('/sign',        handlers.sign)
    .get('/showConfig',   handlers.showConfig)
    .post('/decode',      handlers.jwtdecode)

const eventHandler = async (event, context) => {
    return router.handle(event, context);
}

const defaultHeaders = { Authorization: `Basic ${Buffer.from(process.env.GIGYA_CLIENT_ID + ":" + process.env.GIGYA_CLIENT_SECRET).toString('base64')}` };

let handler = middy(eventHandler)
    .use(awsXRay())
    .use(httpHeaderNormalizer())
    .use(httpHeaderDefaults(defaultHeaders))
    .use(jsonBodyParser())
    .use(urlEncodeBodyParser())
    .use(httpErrorHandler())
    .use(httpPartialResponse())
    .use(stringifyJsonResponse())
    .use(logTrace(log));

module.exports.proxyHandler = handler;