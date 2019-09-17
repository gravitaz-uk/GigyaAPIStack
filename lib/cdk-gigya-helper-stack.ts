import cdk = require('@aws-cdk/core');
import lambda = require('@aws-cdk/aws-lambda');
import apigw = require('@aws-cdk/aws-apigateway');
import { Role, ServicePrincipal, PolicyStatement, Effect } from '@aws-cdk/aws-iam';
import ssm = require('@aws-cdk/aws-ssm');
import { Duration } from '@aws-cdk/core';
import { EndpointType } from '@aws-cdk/aws-apigateway';

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
        "logs:PutLogEvents"
      ]
    }));

    const proxy = new lambda.Function(this, 'ProxyHandler', {
      functionName: 'ProxyHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.proxyHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });

    new apigw.LambdaRestApi(this, 'ProxyEndpoint', {
      restApiName: 'ProxyEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: proxy
    });
  }
}