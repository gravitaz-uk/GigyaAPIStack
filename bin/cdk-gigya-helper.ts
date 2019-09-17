#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { CdkGigyaHelperStack } from '../lib/cdk-gigya-helper-stack';

const app = new cdk.App();
new CdkGigyaHelperStack(app, 'CdkGigyaOIDCServicesStack', );
