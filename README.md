# Gigya API Proxy
Provides an proxy layer between OIDC RP and Gigya endpoints. Features:
1. Hides Gigya configuration from clients - API keys, client ID, client and partner secrets
2. Inserts a configurable Authorisation header if not present formed from Gigya client id and secret
3. Might supports AWS X-Ray (not tested)
4. Provides a mechanism for implementing additional security/services not supported by Gigya e.g.
4.1 PKCE - implemented
4.2 Dynamic Client registration - not implemented

## Implementation
Implemented using [AWS CDK](https://docs.aws.amazon.com/cdk/) 
Details [here](https://confluence.nap/pages/viewpage.action?pageId=288113277)

# Useful commands
 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

Before deploying package up Javascript code using zip -fr code.zip lambda

Configuration - 

Parameters for Gigya API_KEY, client id and client secret are now part of the CDK stack using Cdk.Parameter constructs