# Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

Before deploying package up Javascript code using zip -fr code.zip lambda

Configuration - create parameters in AWS System Manager Parameter Store:

/dev/gigyapoc/api_key - API Key of Gigya Site
/dev/gigyapoc/client_id - Client ID of RP
/dev/gigyapoc/client_secret - Client Secret of RP
/dev/gigyapoc/partner_secret - Partner Secret from Gigya tenant. Only required for Signature endpoint
