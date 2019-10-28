const 
    truthy = require('truthy'),
    jwt    = require('jsonwebtoken'),
    jwks   = require('jwks-rsa');

let jwksClients = {}; // TODO refactor to use a proper managed cache, probably

var log = function () { if (truthy(process.env.DEBUG)) { console.log(...arguments) } };

const findJwksClient = function (issuer) {
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
};

module.exports = {
    jwtdecode: async function (token, verify) {
        let verified = false,
            response = {};
        try {
            response.statusCode = 200;
            response.body = jwt.decode(token, { complete: true });

            if (verify) {
                let jwksClient = findJwksClient(response.body.payload.iss);
                let getKey = (header, callback) => {
                    jwksClient.getSigningKey(header.kid, (err, key) => {
                        if (key) {
                            var signingKey = key.publicKey || key.rsaPublicKey;
                            if (signingKey) {
                                callback(null, signingKey);
                            } else {
                                callback(err, "No public key for KID");
                            }
                        } else {
                            callback(err, "No public key for KID");
                        }
                    });
                };
                const psVerify = (token) => {
                    return new Promise((resolve, reject) => {
                        jwt.verify(token, getKey, (err, data) => {
                            if (err) reject(err);
                            resolve(data);
                        })
                    });
                };
                response.body = await psVerify(token);
                verified = true;
            }
        } catch (e) {
            response.statusCode = 500;
            log('jwks.jwtdecode - error', e);
            response.decoded = e;
        }
        response.headers = { 'content-type': "application/json", pragma: 'nocache', 'X-JWT-Verified': verified };
        return response;
    }
};