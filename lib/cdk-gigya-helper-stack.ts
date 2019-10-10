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
    
    // Context variables (override with -c on command line, defaults in cdk.json
    const
      DOMAIN_NAME               = this.node.tryGetContext('API_DOMAIN_NAME'),
      CERTIFICATE_URN           = this.node.tryGetContext('CERT_URN'),
      API_ENDPOINT_NAME         = this.node.tryGetContext('API_ENDPOINT_NAME') || "GigyaProxyEndpoint",
      GIGYA_API_KEY             = this.node.tryGetContext('GIGYA_API_KEY'),
      GIGYA_CLIENT_ID           = this.node.tryGetContext('GIGYA_CLIENT_ID'),
      GIGYA_CLIENT_SECRET       = this.node.tryGetContext('GIGYA_CLIENT_SECRET'),
      GIGYA_SIGNATURE_ALGORITHM = this.node.tryGetContext('GIGYA_SIGNATURE_ALGORITHM') || "sha1",
      EMBED_STATUS_CODE         = this.node.tryGetContext('EMBED_STATUS_CODE') || "true",
      DEBUG                     = this.node.tryGetContext('DEBUG') || "true",
      VERIFIER_TABLE_NAME       = this.node.tryGetContext('VERIFIER_TABLE_NAME') || "PKCE_VERIFIER";
    
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

    const verifierStore = new dynamodb.Table(this, VERIFIER_TABLE_NAME, {
      partitionKey: {
        name: 'code_challenge',
        type: dynamodb.AttributeType.STRING
      },
      tableName: VERIFIER_TABLE_NAME,
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
      code: lambda.Code.fromAsset('lambda'),
      handler: 'lambda/handlers.proxyHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12),
      description: 'Proxy function for Gigya OIDC endpoints',
      environment: {
        'EMBED_STATUS_CODE'         : EMBED_STATUS_CODE, // do not relay actual Gigya status codes as this will prevent actual error from reaching client
        'VERIFIER_TABLE_NAME'       : VERIFIER_TABLE_NAME, // where we will store code verifiers between authorize and token calls
        'GIGYA_API_KEY'             : GIGYA_API_KEY,
        'GIGYA_CLIENT_ID'           : GIGYA_CLIENT_ID,
        'GIGYA_CLIENT_SECRET'       : GIGYA_CLIENT_SECRET,
        'GIGYA_SIGNATURE_ALGORITHM' : GIGYA_SIGNATURE_ALGORITHM,
        'DEBUG'                     : DEBUG
      }
    });

    // grant RW access to DD table to lambda function
    verifierStore.grantReadWriteData(proxy);

    // reference to previously provisioned certificate '*.gravitaz.co.uk' - a domain that I own. 
    // need to create CNAME for 'api' subdomain.
    const domainCertificate = Certificate.fromCertificateArn(this, 'SSLCertificate', CERTIFICATE_URN);
    
    // define API endpoint
    const api = new apigw.LambdaRestApi(this, 'ProxyEndpoint', {
      restApiName: API_ENDPOINT_NAME,
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: proxy,
      description: 'Provides a proxy layer on top of Gigya endpoints to support OIDC',
      domainName: {
        certificate: domainCertificate,
        domainName: DOMAIN_NAME
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