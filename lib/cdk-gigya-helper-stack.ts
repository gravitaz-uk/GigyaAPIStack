import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
import apigw = require('@aws-cdk/aws-apigateway');
import { Role, ServicePrincipal, PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import ssm = require('@aws-cdk/aws-ssm');
import { Duration } from '@aws-cdk/core';
import { EndpointType } from '@aws-cdk/aws-apigateway';
import { Certificate } from '@aws-cdk/aws-certificatemanager';

//import secretsmanager = require('@aws-cdk/aws-secretsmanager');

export class CdkGigyaHelperStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaExecutionRole = new Role(this, 'GigyaLambdaExecutionRole', {
      roleName: 'GigyaLambdaExecutionRole',
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    });

    lambdaExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ['*'],
      actions: [
        'ssm:GetParameters',
        'ssm:GetParametersByPath',
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ]
    }));

    // note if you change the lambda code you need to manually create a 'code.zip' file in the working directory prior to either
    // issuing a cdk deploy or manually uploading via console/cli. Create using zip -fr code.zip lambda node_modules/

    const proxy = new lambda.Function(this, 'ProxyHandler', {
      functionName: 'GigyaProxyHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.proxyHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12),
      description: 'Proxy function for Gigya OIDC endpoints',
      environment: {
        'EMBED_STATUS_CODE': 'true', // do not relay actual Gigya status codes as this will prevent actual error from reaching client
        'GIGYA_SSM_PATH': '/dev/gigyapoc' // tell lambda code where to find Gigya config secrets
      }
    });

    const domainCertificate = Certificate.fromCertificateArn(this, 'GravitazCertificate', 
      'arn:aws:acm:eu-west-2:384538104517:certificate/c0e83125-6b75-4c80-b146-18e7d09c7bb8');
    
    new apigw.LambdaRestApi(this, 'ProxyEndpoint', {
      restApiName: 'GigyaProxyEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: proxy,
      description: 'Provides a proxy layer on top of Gigya endpoints to support OIDC',
      domainName: {
        certificate: domainCertificate,
        domainName: 'api.gravitaz.co.uk'
      }
    });
  }
}