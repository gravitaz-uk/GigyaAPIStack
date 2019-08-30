#!/usr/bin/env node

// @ts-ignore: Cannot find declaration file
require('source-map-support/register');
const cdk = require('@aws-cdk/core');
const { CdkGigyaHelperStack } = require('../lib/cdk-gigya-helper-stack');

const app = new cdk.App();
new CdkGigyaHelperStack(app, 'CdkGigyaHelperStack');
