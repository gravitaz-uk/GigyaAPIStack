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
    crypto = require('crypto'),
    middy = require('middy'),
    stringify = require('json-stringify-safe'),
    truthy = require('truthy'),
    unirest = require('unirest'),
    pkce = require('./pkce'),
    httpHeaderDefaults = require('./middleware/httpHeaderDefaults'),
    stringifyJsonResponse = require('./middleware/stringifyJsonResponse'),
    logTrace = require('./middleware/logTrace'),
    awsXRay = require('./middleware/awsXRay'),
    jwt = require('jsonwebtoken'),
    jwks = require('jwks-rsa'),
    { httpHeaderNormalizer, jsonBodyParser, httpErrorHandler, urlEncodeBodyParser, httpPartialResponse } = require('middy/middlewares');

pkce.setTableName(process.env.VERIFIER_TABLE_NAME);
let jwksClients = {}; // TODO refactor to use a proper managed cache

var log = function () { if (truthy(process.env.DEBUG)) { console.log(...arguments) } };

let private = {
    findJwksClient: (issuer) => {
        let jwksClient = jwksClients[issuer];
        if (!jwksClient) {
            let jwksUri = issuer + '/.well-known/jwks.json';
            jwksClient = jwks({ 
                jwksUri: jwksUri, 
                cache: true,
                rateLimit: true    
            });
            jwksClients[issuer]=jwksClient;    
        };
        return jwksClient
    },
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
        if (event.queryStringParameters.code_challenge) {
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
    forwardToGigya: async (event, context, endpoint = '/token') => {
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
        let decoded, status, verified = false;
        let token = (handler.event.body && handler.event.body.token) || handler.event.queryStringParameters.token;
        try {
            status = 200;
            decoded = jwt.decode(token, { complete: true });
            log('jwtdecode - unverified token', stringify(decoded));
            let verify = handler.event.queryStringParameters && truthy(handler.event.queryStringParameters.verify);
            log('jwtdecode', stringify({verified: verify, params: handler.event.queryStringParameters}));

            if (verify) {
                log('jwtdecode - resolving jwksClient');
                let jwksClient = private.findJwksClient(decoded.payload.iss);
                log('jwtdecode - resolved jwksClient for', decoded.payload.iss);
                let getKey = (header, callback) => {
                    jwksClient.getSigningKey(header.kid, (err, key) => {
                        if (key) {
                            log('jwtdecode key ', key);
                            var signingKey = key.publicKey || key.rsaPublicKey;
                            if (signingKey) {
                                log('jwtdecode found public key', stringify(signingKey));
                                callback(null, signingKey);
                            } else {
                                log('jwtdecode - error - no public key for KID');
                                callback(err, "No public key for KID");
                            }
                        } else {
                            log('jwtdecode - error - no key passed to callback');
                            callback(err, "No public key for KID");
                        }
                    });
                };
                log('jwtdecode - verifying token');
                const psVerify = (token) => {
                    return new Promise((resolve, reject) => {
                        jwt.verify(token, getKey, (err, data) => {
                            if (err) reject(err);
                            resolve(data);
                        })
                    });
                };
                decoded = await psVerify(token);
                verified = true;
                log('jwtdecode verified', decoded);
            }
        } catch (e) {
            status = 500;
            log('jwtdecode - error', e);
            decoded = e;
        }
        return {
            statusCode: status,
            headers: { 'content-type': "application/json", pragma: 'nocache', 'X-JWT-Verified': verified },
            body: decoded
        }
    },
    awsAssertion: async (event, context) => {
        let id_token = handler.event.body.id_token;

    }
}

const eventHandler = async (event, context) => {
    switch (event.path) {
        case '/sign': return private.sign(event, context);
        case '/showConfig': return private.showConfig(event, context);
        case '/decode': return private.jwtdecode(event, context);
        case '/authorize': return private.redirectToGigya(event, context);
        case '/token':
        case '/userinfo':
        case '/refresh': return private.forwardToGigya(event, context, event.path);
        default: return {
            statusCode: 404,
            body: { "err": `unknown endpoint ${event.path}` }
        };
    }
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