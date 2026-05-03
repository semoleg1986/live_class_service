import { Global, Module } from '@nestjs/common';

import { JwksAccessTokenVerifier } from '../../infrastructure/auth/jwks-access-token-verifier';
import { BearerAuthGuard } from './bearer-auth.guard';

@Global()
@Module({
  providers: [
    JwksAccessTokenVerifier,
    {
      provide: 'ACCESS_TOKEN_VERIFIER',
      useExisting: JwksAccessTokenVerifier
    },
    BearerAuthGuard
  ],
  exports: [BearerAuthGuard, 'ACCESS_TOKEN_VERIFIER']
})
export class AuthModule {}
