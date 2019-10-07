import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
import apigw = require('@aws-cdk/aws-apigateway');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import { Role, ServicePrincipal, PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import { Duration, CfnOutput } from '@aws-cdk/core';
import { EndpointType } from '@aws-cdk/aws-apigateway';
import { Certificate } from '@aws-cdk/aws-certificatemanager';

export class CdkGigyaHelperStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const     
      DOMAIN_NAME     = new cdk.CfnParameter(this, 'API_DOMAINNAME', { 
        type: 'String',
        description: 'domain name to use for API endpoint',
        default: "api.gravitaz.co.uk"
      }),
      CERTIFICATE_URN = new cdk.CfnParameter(this, 'CERT_URN', { 
        type: 'String',
        description: 'URN of SSL certificate to use with API endpoint',
        default: "arn:aws:acm:eu-west-2:384538104517:certificate/c0e83125-6b75-4c80-b146-18e7d09c7bb8"
      }),
      API_ENDPOINT_NAME = new cdk.CfnParameter(this, 'API_ENDPOINT_NAME', { 
        type: 'String',
        description: 'Name of API endpoint to use within the stack',
        default: "GigyaProxyEndpoint"
      }),
      GIGYA_API_KEY = new cdk.CfnParameter(this, 'GIGYA_API_KEY', {
          type: 'String',
          description: 'API KEY within Gigya',
          default: '3_1P2DV2VJMA_9HuJ7UWPR-IpsC6aCAio3knEz0tloRrmggSIX3wLzRCcl_oTXpcPb'
      }),
      GIGYA_CLIENT_ID = new cdk.CfnParameter(this, 'GIGYA_CLIENT_ID', {
        type: 'String',
        description: 'Client ID within Gigya',
        default: 'txLT1xNyH_4XccoeWYcTGyc8'
      }),
      GIGYA_CLIENT_SECRET = new cdk.CfnParameter(this, 'GIGYA_CLIENT_SECRET', {
        type: 'String',
        description: 'Client Secret within Gigya',
        default: 'XvdLrm6t_3q5L1_oea4YXVS5wcSEHBNxXpMeNBDxATzy2bX4JeB9JVYrU4T7W3_pgkF1FVcaOmscoM_-MLEC-Q',
        noEcho: true
      });

      // create a bespoke role for our stack for lambda execution
    const lambdaExecutionRole = new Role(this, 'GigyaLambdaExecutionRole', {
      roleName: 'GigyaLambdaExecutionRole',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    });

    // extend role with specific required permissions
    lambdaExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ['*'],
      actions: [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams",
      ]
    }));

    // PKCE support - create a DynamoDB table to store code challenges. Note we can't associate these with authorisation codes as
    // we never see them (Gigya sends the directly to the browser) so we have to store the hash and when we receive the code verifier
    // we hash that, then see if we saw that hash earlier (i.e. as part of an authorize call). We can't link the two calls together.

    const verifierTableName = 'PKCE_VERIFIER';
    const verifierStore = new dynamodb.Table(this, verifierTableName, {
      partitionKey: {
        name: 'code_challenge',
        type: dynamodb.AttributeType.STRING
      },
      tableName: verifierTableName,
      removalPolicy: cdk.RemovalPolicy.DESTROY // table contents are ephemeral
    });

    // lambda application code is in lambda subdirectory. It has it's own package.json and node_modules subtree. CDK will automatically 
    // package up this subtree and include it during a cdk deploy action. 
    // To update lambda code only:
    //  1. zip -r code.zip lambda/
    //  2. aws lambda update-function-code --function-name GigyaProxyHandler --zip-file fileb://code.zip [--publish]
    // 
    
    const proxy = new lambda.Function(this, 'ProxyHandler', {
      functionName: 'GigyaProxyHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.asset('lambda'),
      handler: 'lambda/handlers.proxyHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12),
      description: 'Proxy function for Gigya OIDC endpoints',
      environment: {
        'EMBED_STATUS_CODE': 'true', // do not relay actual Gigya status codes as this will prevent actual error from reaching client
        'GIGYA_SSM_PATH': '/dev/gigyapoc', // tell lambda code where to find Gigya config secrets
        'VERIFIER_TABLE_NAME': verifierTableName, // where we will store code verifiers between authorize and token calls
        'CONFIG_API_KEY': GIGYA_API_KEY.valueAsString,
        'CONFIG_CLIENT_ID': GIGYA_CLIENT_ID.valueAsString,
        'CONFIG_CLIENT_SECRET': GIGYA_CLIENT_SECRET.valueAsString,
      }
    });

    // grant RW access to DD table to lambda function
    verifierStore.grantReadWriteData(proxy);

    // reference to previously provisioned certificate '*.gravitaz.co.uk' - a domain that I own. 
    // need to create CNAME for 'api' subdomain.
    const domainCertificate = Certificate.fromCertificateArn(this, 'SSLCertificate', CERTIFICATE_URN.valueAsString);
    
    // define API endpoint
    const api = new apigw.LambdaRestApi(this, 'ProxyEndpoint', {
      restApiName: API_ENDPOINT_NAME.valueAsString,
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: proxy,
      description: 'Provides a proxy layer on top of Gigya endpoints to support OIDC',
      domainName: {
        certificate: domainCertificate,
        domainName: DOMAIN_NAME.valueAsString
      }
    });

    const dn = api.domainName;

    if (dn) {
      new CfnOutput(this, 'CertifiedProxyEndpointAlias', {
        value: dn.domainName + ' -> ' + dn.domainNameAliasDomainName + ' -> ' + api.url
      })
    };

  }
}