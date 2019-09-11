const 
    crypto = require('crypto'),
    middy = require('middy'),
    { ssm } = require('middy/middlewares'),
    unirest = require('unirest'),
    SSM_CONFIG = {
        cache: true,
        paths: {
            CONFIG: '/dev/gigyapoc'
        }
    };

let signConsent = (consent) => {
    const hash = crypto.createHmac('sha1', Buffer.from(process.env.CONFIG_PARTNER_SECRET, 'base64'));
    const consent_str = JSON.stringify(consent?consent:'default');
    const sig = hash.update(JSON.stringify(consent_str)).digest('base64').replace(/=$/g, '').replace(/\//g, '_').replace(/[+]/g, '-');
    return sig; 
}
let handlers = {
    sign : async function(event, context) {
        console.log('request:', JSON.stringify(event, undefined, 2));
        const sig = signConsent(event.body, process.env.CONFIG_PARTNER_SECRET);
        return {
            statusCode: 200,
            body: sig
        };
    },
    showConfig : async (event, context) => {
        return {
            API_KEY: process.env.CONFIG_API_KEY, 
            CLIENT_ID: process.env.CONFIG_CLIENT_ID
        };
    },
    getTokenFromRT : async (event, context) => {
        return await unirest (
            "POST",
            `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/token`,
            {
                "Authorization": `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            {
                "grant_type": "refresh_token",
                "refresh_token": event.refresh_token
            }
        );
    },
    getTokenFromCode : async (event, context) => {
        return await unirest (
            "POST",
            `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/token`,
            {
                "Authorization": `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            {
                "grant_type": "authorization_code",
                "code": event.code,
                "redirect_uri": event.uri
            }
        );
    },
    introspectToken : async (event, context) => { 
        return await unirest (
            "POST",
            `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/introspect`,
            {
                "Authorization": `Basic ${Buffer.from(process.env.CONFIG_CLIENT_ID + ":" + process.env.CONFIG_CLIENT_SECRET).toString('base64')}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            {
                "access_token": event.access_token
            }
        );
    },
    getUserInfo : async (event, context) => {
        return await unirest (
            "POST",
            `https://fidm.eu1.gigya.com/oidc/op/v1.0/${process.env.CONFIG_API_KEY}/userinfo`,
            {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            {
                "access_token": event.access_token
            }
        );
    }
}
handlers = Object.entries(handlers).reduce((nh, h)=> {nh[h[0]]=middy(h[1]).use(ssm(SSM_CONFIG));return nh},{});
module.exports = { ...handlers }