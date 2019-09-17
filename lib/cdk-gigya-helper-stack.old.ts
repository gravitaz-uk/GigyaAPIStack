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

/*    const secret = secretsmanager.Secret.fromSecretAttributes(scope, 'ImportedSecret', {
      secretArn: 'arn:aws:secretsmanager:eu-west-2:384538104517:secret:GigyaPOC4NAP-CjiDx6'
      // If the secret is encrypted using a KMS-hosted CMK, either import or reference that key:
    });
*/
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
    
    const signapi = new lambda.Function(this, 'SignHandler', {
      functionName: 'SignHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.sign',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });

    new apigw.LambdaRestApi(this, 'SignEndpoint', {
      restApiName: 'SignEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: signapi
    });

    const token_endpoint = new lambda.Function(this, 'TokenHandler', {
      functionName: 'TokenHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.tokenHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });

    new apigw.LambdaRestApi(this, 'TokenEndpoint', {
      restApiName: 'TokenEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: token_endpoint
    });

    const userinfo_endpoint = new lambda.Function(this, 'UserInfoHandler', {
      functionName: 'UserInfoHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.userinfoHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });

    new apigw.LambdaRestApi(this, 'UserInfoEndpoint', {
      restApiName: 'UserInfoEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: userinfo_endpoint
    });

    const introspect_endpoint = new lambda.Function(this, 'IntrospectHandler', {
      functionName: 'IntrospectHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.introspectHandler',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });

    new apigw.LambdaRestApi(this, 'IntrospectEndpoint', {
      restApiName: 'IntrospectEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: introspect_endpoint
    });

    const showconfig_endpoint = new lambda.Function(this, 'ShowConfigHandler', {
      functionName: 'ShowConfigHandler',
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset('code.zip'),
      handler: 'lambda/handlers.showConfig',
      role: lambdaExecutionRole,
      timeout: Duration.seconds(12)
    });
  
    new apigw.LambdaRestApi(this, 'ShowConfigEndpoint', {
      restApiName: 'ShowConfigEndpoint',
      endpointTypes: [ EndpointType.REGIONAL ],
      handler: showconfig_endpoint
    }); }

}