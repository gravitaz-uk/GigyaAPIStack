const
    crypto                  = require('crypto'),
    stringify               = require('json-stringify-safe'),
    truthy                  = require('truthy'),
    falsey                  = require('falsey'),
    unirest                 = require('unirest'),
    pkce                    = require('./pkce'),
    jwks                    = require('./jwks'),
    AWS                     = require('aws-sdk');

opts = {
    AWS_REGION: 'eu-west-2',
    ISSUER: 'oauth.gravitaz.co.uk',
    COGNITO_IDENTITY_POOL: 'eu-west-2:ab18d95b-773d-47ea-8ecc-107e6d0dd4d2'
}

endpoints = {
    log : function () { 
        if (truthy(process.env.DEBUG)) { 
            console.log(...arguments) 
        } 
    },
    jwtdecode: async (event, context) => {
        let token = (event.body && event.body.token) || event.queryStringParameters.token;
        let noverify = (event.queryStringParameters && falsey(event.queryStringParameters.verify));

        return await jwks.jwtdecode(token, !noverify);
    },
    awsAssertion: async (event, context) => {
        let token = (event.body && event.body.token) || event.queryStringParameters.token;
        endpoints.log(stringify({method: 'awsAssertion', ...context}));

        AWS.config.region = opts.AWS_REGION; // Region
        let cognitoidentity = new AWS.CognitoIdentity();
        let loginTokens = {};
        loginTokens[opts.ISSUER] = token;
        let id = await cognitoidentity.getId({
            IdentityPoolId: opts.COGNITO_IDENTITY_POOL,
            Logins: loginTokens
        }).promise();
        endpoints.log(stringify(id));
        let creds = await cognitoidentity.getCredentialsForIdentity({
            ...id,
            Logins: loginTokens
        }).promise();
        return {
            statusCode: 200,
            body: creds
        }
    }
}

pkce.configure({TABLE_NAME: process.env.VERIFIER_TABLE_NAME, log: endpoints.log});
jwks.configure({log: endpoints.log});

module.exports = endpoints