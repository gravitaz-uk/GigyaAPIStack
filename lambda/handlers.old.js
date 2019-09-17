const 
    crypto = require('crypto'),
    middy = require('middy'),
    { ssm, httpHeaderNormalizer, jsonBodyParser, httpErrorHandler, urlEncodeBodyParser, httpPartialResponse } = require('middy/middlewares'),
    unirest = require('unirest'),
    SSM_CONFIG = {
        cache: true,
        paths: {
            CONFIG: '/dev/gigyapoc'
        }
    };

const gigyaHelperMiddleware = (config) => {
    return ({
        before: (handler, next) => {
            console.log('gigyaHelperMiddleware.before');
            if (handler && handler.event) {
                handler.event.body = handler.event.body || {};
                if (handler.event.headers && handler.event.headers.Authorization && handler.event.headers.Authorization.startsWith("Bearer")) {
                    try {
                        handler.event.bearerAuthHeader = handler.event.headers.Authorization;
                    } catch (e) {
                        console.error("Error parsing Bearer Token ", e);
                    }
                }
                console.log(JSON.stringify(handler.event));
            }
            next();
        },
        after: (handler, next) => {
            if (handler && handler.response && handler.response.body && (handler.response.body instanceof Object)) {
                handler.response.body = JSON.stringify(handler.response.body);
            };
            next();
        }
    })
}

let basicAuthHeader = `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`;

let endpoints = {
    'token': `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/token`,
    'userinfo': `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/userinfo`
}

let signConsent = (consent) => {
    const hash = crypto.createHmac('sha1', Buffer.from(process.env.CONFIG_PARTNER_SECRET, 'base64'));
    const consent_str = JSON.stringify(consent?consent:'default');
    const sig = hash.update(JSON.stringify(consent_str)).digest('base64').replace(/=$/g, '').replace(/\//g, '_').replace(/[+]/g, '-');
    return sig; 
}

let gigyaRestAPICall = async (params, event, context, authheader = basicAuthHeader, endpoint = 'token', method = 'POST') => {
    console.log('gigyaRestAPICall - request:', JSON.stringify({'event': event, 'params': params, 'context': context }, undefined, 2));
    let gigyaResponse = await unirest (
        method,
        `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/${endpoint}`,
        {
            "Authorization": authHeader,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        params
    );
    console.log('gigyaRestAPICall - Gigya response:', JSON.stringify(gigyaResponse, undefined, 2));
    let gigyaRestAPICall = { 
        "headers": { 'content-type': gigyaResponse.headers['content-type'], pragma: 'nocache' },
        "statusCode": gigyaResponse.statusCode,
        "body": gigyaResponse.body 
    }
    console.log('gigyaRestAPICall - API response:', JSON.stringify(gigyaRestAPICall, undefined, 2));
    return gigyaRestAPICall;
}

let restAPICall = async ({method = 'POST', uri = endpoints.token, authHeader = basicAuthHeader, body = {}}) => {
    let headers = {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
    };
    console.log('gigyaRestAPICall - request:', JSON.stringify({'method': method, 'uri': uri, 'headers': headers, 'body': body }, undefined, 2));
    let gigyaResponse = await unirest (method, uri, headers, body);
    console.log('gigyaRestAPICall - Gigya response:', JSON.stringify(gigyaResponse, undefined, 2));
    let response = { 
        "headers": { 'content-type': gigyaResponse.headers['content-type'], pragma: 'nocache' },
        "statusCode": gigyaResponse.statusCode,
        "body": gigyaResponse.body 
    }
    console.log('gigyaRestAPICall - API response:', JSON.stringify(response, undefined, 2));
    return response;
}

let handlers = {
    getTokenFromRT : async (event, context) => {
        let params={
            "grant_type": "refresh_token",
            "refresh_token": event.refresh_token 
        }
        if (event.scope) params.scope = event.scope;
        return restAPICall({
            body: params
        });
    },
    getTokenFromCode : async (event, context) => {
        return restAPICall({
            body: {
                "grant_type": "authorization_code",
                "code": event.code,
                "redirect_uri": event.redirect_uri || event.uri
            }
        });
    },
    introspectToken : async (event, context) => { 
        return restAPICall({authHeader: event.bearerAuthHeader, body: {token: event.token}});
    },
    getUserInfo : async (event, context) => {
        return restAPICall({method: 'GET', uri: endpoints.userinfo, authHeader: event.bearerAuthHeader});
    },
    sign : async function(event, context) {!440
        console.log('request:', JSON.stringify(event, undefined, 2));
        const sig = signConsent(event.body, process.env.CONFIG_PARTNER_SECRET);
        return {
            statusCode: 200,
            body: sig
        };
    },
    showConfig : async (event, context) => {
        console.log('showConfig - request:', JSON.stringify(event, undefined, 2));
        let response = {
            statusCode: 200,
            headers: { 'content-type': "application/json", pragma: 'nocache' },
            body: {
                "API_KEY": process.env.CONFIG_API_KEY, 
                "CLIENT_ID": process.env.CONFIG_CLIENT_ID
            }
        };
        console.log('showConfig - response:', JSON.stringify(response, undefined, 2));
        return response;
    }
}
//inject config parameters into handlers, stored outside of CDK as they include secrets
constMiddyHandlers = Object.entries(handlers).reduce((nh, h)=> {
    nh[h[0]]=
        middy(h[1])
        .use(ssm(SSM_CONFIG))
        .use(httpHeaderNormalizer())
        .use(jsonBodyParser())
        .use(urlEncodeBodyParser())
        .use(httpErrorHandler())
        .use(httpPartialResponse())
        .use(gigyaHelperMiddleware()) // will stringify body if it is an object else get errors with API Gateway
    return nh
},{});
module.exports = { ...constMiddyHandlers }