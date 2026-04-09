import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

import {
  AccessTokenClaims,
  AccessTokenVerifierPort,
} from '../../application/ports/access-token-verifier.port';

@Injectable()
export class JwksAccessTokenVerifier implements AccessTokenVerifierPort {
  private readonly issuer: string;
  private readonly jwksUrl: string;
  private readonly jwksResolver: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly configService: ConfigService) {
    this.issuer = this.configService.get<string>(
      'liveClass.authIssuer',
      'auth_service',
    );
    this.jwksUrl = this.configService.get<string>(
      'liveClass.authJwksUrl',
      'http://localhost:8000/.well-known/jwks.json',
    );
    this.jwksResolver = createRemoteJWKSet(new URL(this.jwksUrl));
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const verified = await jwtVerify(token, this.jwksResolver, {
        issuer: this.issuer,
        algorithms: ['EdDSA'],
      });
      return this.mapClaims(verified.payload);
    } catch {
      throw new UnauthorizedException('Некорректный access token.');
    }
  }

  private mapClaims(payload: JWTPayload): AccessTokenClaims {
    const accountId = String(payload.sub ?? '').trim();
    const rolesRaw = payload.roles;
    const roles = Array.isArray(rolesRaw)
      ? rolesRaw.map((role) => String(role).trim()).filter(Boolean)
      : [];

    if (!accountId || roles.length === 0) {
      throw new UnauthorizedException(
        'JWT должен содержать sub и непустой массив roles.',
      );
    }

    return {
      accountId,
      roles,
      tokenId: payload.jti ? String(payload.jti) : null,
    };
  }
}
