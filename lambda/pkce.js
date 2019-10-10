const 
    AWS = require('aws-sdk'),
    stringify = require('json-stringify-safe'),
    { fromBase64 } = require('base64url');

const log = console.log;
const ddb = new AWS.DynamoDB.DocumentClient();

module.exports.setTableName = (newTableName) => { TABLE_NAME = newTableName};

module.exports.saveCodeRequest = async ({client_id, code_challenge, code_challenge_method, state}) => {
    let d = (new Date()).toJSON();
    let item = {
        'state'                 : {'S': state},
        'client_id'             : {'S': client_id},
        'code_challenge'        : {'S': code_challenge},
        'code_challenge_method' : {'S': code_challenge_method},
        'timestamp'             : {'S': d}
    };

    let ddbArgs = {
        'TableName': TABLE_NAME,
        'Item': item
    };

    log('storing', stringify(ddbArgs));
    try {
        await ddb.putItem(ddbArgs).promise();
    } catch (e) {
        log('error writing to dd', stringify(e))
    }       
}

const findThenDeleteItem = async(itemKey) => {
    let ddbArgs = {
        'TableName': TABLE_NAME,
        'Key': {
            'code_challenge': {
                S: itemKey
            }
        }
    };

    let response=undefined;

    log('search ddb for', stringify(ddbArgs));

    try {
        response = await ddb.getItem(ddbArgs).promise();
    } catch (e) {
        log('error reading from dd', stringify(e));
        return false;
    }
    log('retrieved', itemKey, stringify(response));

    if (!response || !response.Item) {
        return false;
    }

    let item = response.Item;
    ddb.deleteItem(ddbArgs).promise().then(log(ddbArgs, 'deleted from ddb'));
    return (item.code_challenge && (item.code_challenge.S==itemKey));

}

// only gigya knows the code prior to this so our solution is a bit crap and not sufficient for production use
module.exports.verifyCodeChallenge = async ({client_id, code_verifier, state}) => {
    if (!code_verifier) {
        return false;
    }
    // try plain then S256
    
    let found=await findThenDeleteItem(code_verifier);
    if (!found) {
        let originalChallenge = fromBase64(crypto.createHash('sha256').update(code_verifier).digest('base64'));
        found = await findThenDeleteItem(originalChallenge);
    }

    return found;
}