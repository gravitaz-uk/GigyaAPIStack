/**
    # Gigya Proxy handler
    Provides an proxy layer between OIDC RP and Gigya endpoints. Features:
    1. hides Gigya configuration from clients - API keys, client ID, client and partner secrets
    2. Inserts an Authorisation header if not present formed from client id and secret
    3. Supports AWS X-Ray (not tested)
    4. Provides a mechanism for implementing additional security/services not supported by Gigya e.g.
    4.1 PKCE
    4.2 Dynamic Client registration

    Config parameters are currently stored in SSM and accessed within lambda. An alternative is to handle these within CDK.
 */

const 
    crypto = require('crypto'),
    middy = require('middy'),
    stringify = require('json-stringify-safe'),
    truthy = require('truthy'),
    AWSXRay = require('aws-xray-sdk');

AWSXRay.captureHTTPsGlobal(require('http'));

var log = console.log;

const
    unirest = require('unirest'),
    { ssm, httpHeaderNormalizer, jsonBodyParser, httpErrorHandler, urlEncodeBodyParser, httpPartialResponse } = require('middy/middlewares'),
    SSM_CONFIG = {
        cache: true,
        paths: {
            CONFIG: process.env.GIGYA_SSM_PATH || '/dev/gigyapoc'
        }
    };

const gigyaHelperMiddleware = (config) => {
    return ({
        before: (handler, next) => {
            // insert a basic authorisation header if not supplied by caller
            if (handler && handler.event) {
                log('event', JSON.stringify(handler.event));
                if (handler.event.headers && !handler.event.headers.Authorization) {
                    handler.event.headers.Authorization = 
                        `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`;
                }
            }
            next();
        },
        after: (handler, next) => {
            if (handler && handler.response && handler.response.body && (handler.response.body instanceof Object)) {
                handler.response.body = stringify(handler.response.body);
            };
            next();
        }
    })
}

let forwardAPICall = async (event, context, endpoint = '/token') => {
    let uri = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}${endpoint}`;
    delete event.headers.Host;
    let response = await unirest (
        event.httpMethod || 'POST', 
        uri,
        event.headers,
        event.body);
    if (truthy(process.env.EMBED_STATUS_CODE) && response.body && response.statusCode!=200 ) {
        response.body.proxyStatusCode = response.statusCode;
        response.statusCode = 200
    }
    return { 
        statusCode: response.statusCode, 
        body: response.body 
    };
}

let handlers = {
    sign : async function(event, context) {
        const hash = crypto.createHmac('sha1', Buffer.from(process.env.CONFIG_PARTNER_SECRET||"TIM", 'base64'));
        const consent_str = stringify(event.body.consent?event.body.consent:'default');
        const sig = hash.update(stringify(consent_str)).digest('base64').replace(/=$/g, '').replace(/\//g, '_').replace(/[+]/g, '-');
        return {
            statusCode: 200,
            body: sig
        };
    },
    showConfig : async (event, context) => {
        return {
            statusCode: 200,
            headers: { 'content-type': "application/json", pragma: 'nocache' },
            body: {
                "API_KEY": process.env.CONFIG_API_KEY, 
                "CLIENT_ID": process.env.CONFIG_CLIENT_ID
            }
        };
    },
    doRedirect: async (event, context) => {
        const queryParams = event.queryStringParameters ? 
            '?' + Object.keys(event.queryStringParameters).map(i=>`${i}=${event.queryStringParameters[i]}`).join('&') : "";
        const gigyaAuthorize = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/authorize${queryParams}`;
        log ('Redirecting to ', JSON.stringify(gigyaAuthorize));
        return {
            statusCode: 302,
            headers: { 'location': gigyaAuthorize}
        }
    },
    proxyHandler : async (event, context) => {
        switch (event.path) {
            case '/sign':       return handlers.sign(event, context);
            case '/showConfig': return handlers.showConfig(event, context);
            case '/authorize':  return handlers.doRedirect(event, context);
            case '/token':
            case '/userinfo':
            case '/refresh':    return forwardAPICall(event, context, event.path); 
            default:            return {
                statusCode: 404,
                body: {"err": `unknown endpoint ${event.path}`}
            }; 
        }
    }
}

constMiddyHandlers = Object.entries(handlers).reduce((nh, h)=> {
    nh[h[0]]=
        middy(h[1])
        .use(ssm(SSM_CONFIG))         //inject config parameters into handlers, stored outside of CDK as they include secrets  
        .use(httpHeaderNormalizer())
        .use(jsonBodyParser())
        .use(urlEncodeBodyParser())
        .use(httpErrorHandler())
        .use(httpPartialResponse())
        .use(gigyaHelperMiddleware()) // will stringify body if it is an object else get errors with API Gateway
    return nh
},{});
module.exports = { ...constMiddyHandlers }