import { AccessTokenClaims } from '../../application/ports/access-token-verifier.port';

export type AuthUser = AccessTokenClaims & {
  accessToken: string;
};
