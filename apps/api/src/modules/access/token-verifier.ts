import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import { AUTH_CONFIG, type AuthConfig } from '../../config.js';

@Injectable()
export class TokenVerifier {
  private readonly keys;
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    this.keys = createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 3000, cooldownDuration: 1000 });
  }
  async verify(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.config.issuer, audience: this.config.audience,
        algorithms: ['RS256'], requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat'], clockTolerance: 0,
      });
      // Keycloak access tokens have payload typ=Bearer. This rejects ID tokens too.
      if (!payload.sub || payload.sub.length > 255 || payload.typ !== 'Bearer' || payload.iat! > Math.floor(Date.now() / 1000)) throw new UnauthorizedException();
      return payload.sub;
    } catch (error) {
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError || error instanceof UnauthorizedException)) {
        throw new ServiceUnavailableException('Identity provider temporarily unavailable');
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
