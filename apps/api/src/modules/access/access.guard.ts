import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH_CONFIG, type AuthConfig } from '../../config.js';
import { OPERATION, policies } from './policies.js';
import { ACCESS_REPOSITORY, type AccessRepository, type Principal } from './types.js';
import { TokenVerifier } from './token-verifier.js';
export interface AuthRequest extends Request { principal?: Principal; identity?: { issuer: string; subject: string }; requestId: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    @Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const operation = this.reflector.getAllAndOverride<keyof typeof policies>(OPERATION, [context.getHandler(), context.getClass()]);
    const policy = operation ? policies[operation] : undefined;
    // Missing/unknown metadata never makes a new endpoint public.
    if (!policy) throw new ForbiddenException('No access policy configured');
    if (policy === 'public') return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = req.headers.authorization;
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i);
    if (!match || match[1]!.length > 16384) throw new UnauthorizedException('Bearer token required');
    const subject = await this.verifier.verify(match[1]!);
    req.identity = { issuer: this.config.issuer, subject };
    if (policy === 'identity') return true;
    const principal = await this.repository.findPrincipal(this.config.issuer, subject);
    if (!principal) throw new ForbiddenException('Account is not provisioned or is disabled');
    req.principal = principal;
    if (policy === 'authenticated') return true;
    if (policy === 'buyer') {
      if (!principal.roles.includes('BUYER')) throw new ForbiddenException('Buyer role required');
      return true;
    }
    const staff = principal.roles.includes('STAFF');
    if (policy === 'venue') {
      if (!staff) throw new ForbiddenException('Staff role required');
      const venueId = req.params.venueId;
      if (typeof venueId !== 'string' || !uuid.test(venueId) || !await this.repository.hasMembership(principal.id, venueId)) {
        throw new NotFoundException();
      }
      const offerId = req.params.offerId;
      if (offerId !== undefined && (typeof offerId !== 'string' || !uuid.test(offerId) || await this.repository.findOfferVenue(offerId) !== venueId)) {
        throw new NotFoundException();
      }
      return true;
    }
    const orderId = req.params.orderId;
    if (typeof orderId !== 'string' || !uuid.test(orderId)) throw new NotFoundException();
    const order = await this.repository.findOrderScope(orderId);
    if (!order) throw new NotFoundException();
    const owner = principal.roles.includes('BUYER') && order.buyerId === principal.id;
    const venueStaff = staff && await this.repository.hasMembership(principal.id, order.venueId);
    if (!(policy === 'order-staff' ? venueStaff : owner || venueStaff)) throw new NotFoundException();
    return true;
  }
}
