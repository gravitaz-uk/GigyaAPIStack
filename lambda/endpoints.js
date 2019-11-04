const
    crypto                  = require('crypto'),
    stringify               = require('json-stringify-safe'),
    truthy                  = require('truthy'),
    unirest                 = require('unirest'),
    pkce                    = require('./pkce'),
    jwks                    = require('./jwks'),
    AWS                     = require('aws-sdk');

pkce.setTableName(process.env.VERIFIER_TABLE_NAME);

endpoints = {
    log : function () { 
        if (truthy(process.env.DEBUG)) { 
            console.log(...arguments) 
        } 
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
        if (event.queryStringParameters && event.queryStringParameters.code_challenge) {
            await pkce.saveCodeRequest(event.queryStringParameters)
        }
        const queryParams = event.queryStringParameters ?
            '?' + Object.keys(event.queryStringParameters).map(i => `${i}=${event.queryStringParameters[i]}`).join('&') : "";
        const gigyaAuthorize = `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.GIGYA_API_KEY}/authorize${queryParams}`;
        endpoints.log('Redirecting to ', stringify(gigyaAuthorize));
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
                endpoints.log('PKCE check failed');
                return {
                    statusCode: 403,
                    body: {
                        errMsg: 'PKCE verification failure'
                    }
                }
            }
            endpoints.log('PKCE check OK');
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
        let token = (event.body && event.body.token) || event.queryStringParameters.token;
        let verify = event.queryStringParameters && truthy(event.queryStringParameters.verify);

        return await jwks.jwtdecode(token, verify);
    },
    awsAssertion: async (event, context) => {
        let token = (event.body && event.body.token) || event.queryStringParameters.token;

        AWS.config.region = 'eu-west-2'; // Region
        let cognitoidentity = new AWS.CognitoIdentity();
        let id = await cognitoidentity.getId({
            IdentityPoolId: 'eu-west-2:ab18d95b-773d-47ea-8ecc-107e6d0dd4d2',
            Logins: {
                'oauth.gravitaz.co.uk': token
            }
        }).promise();
        endpoints.log(stringify(id));
        let creds = await cognitoidentity.getCredentialsForIdentity({
            ...id,
            Logins: {
                'oauth.gravitaz.co.uk': token
            }
        }).promise();
        return {
            statusCode: 200,
            body: creds
        }
    }
}
module.exports = endpoints