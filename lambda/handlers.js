const 
    crypto = require('crypto'),
    middy = require('middy'),
    stringify = require('json-stringify-safe'),
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
            // insert a basic authorisation header if not supplied by caller
            if (handler && handler.event) {
                console.log(JSON.stringify(handler.event));
                if (handler.event.headers && !handler.event.headers.Authorization) {
                    handler.event.headers.Authorization = 
                        `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`;
                }
                console.log(stringify(handler.event.headers));
            }
            next();
        },
        after: (handler, next) => {
            if (handler && handler.response && handler.response.body && (handler.response.body instanceof Object)) {
                handler.response.body = stringify(handler.response.body);
            };
            console.log('gigyaHelperMiddleware.after');
            console.log(stringify(handler.response));
            next();
        }
    })
}

let forwardAPICall = async (event, context, endpoint = 'token') => {
    let uri = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}${endpoint}`;
    delete event.headers.Host;
    console.log('forwarding to ' + uri)
    let response = await unirest (
        event.httpMethod || 'POST', 
        uri,
        event.headers,
        event.body);
    if (response.statusCode>200) {
        response.body.gigyaStatusCode = response.statusCode;
        response.statusCode = 200
    }
    return { 
        statusCode: response.statusCode, 
        body: response.body 
    };
}

let handlers = {
    tokenHandler : async (event, context) => {
        return forwardAPICall(event, context, '/token');
    },
    introspectHandler : async (event, context) => {
        return forwardAPICall(event, context, '/introspect');
    },
    userinfoHandler : async (event, context) => {
        return forwardAPICall(event, context, '/userinfo');
    },
    sign : async function(event, context) {
        console.log(process.env.CONFIG_PARTNER_SECRET)
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
    proxyHandler : async (event, context) => {
        console.log('Switching on ' + event.path);
        switch (event.path) {
            case '/sign': return handlers.sign(event, context);
            case '/showConfig': return handlers.showConfig(event, context);
            default: return forwardAPICall(event, context, event.path); 
        }
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