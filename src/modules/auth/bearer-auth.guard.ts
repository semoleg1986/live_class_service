import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AccessTokenVerifierPort } from '../../application/ports/access-token-verifier.port';
import { AuthUser } from './auth-user.interface';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject('ACCESS_TOKEN_VERIFIER')
    private readonly verifier: AccessTokenVerifierPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Требуется Bearer токен.');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    request.user = await this.verifier.verifyAccessToken(token);

    return true;
  }
}
