import { BadRequestException, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { OperationAccess } from './policies.js';
import { ACCESS_REPOSITORY, type AccessRepository } from './types.js';
import type { AuthRequest } from './access.guard.js';
@Controller()
export class MeController {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}
  @Post('me/registration')
  @HttpCode(200)
  @OperationAccess('registerBuyer')
  async register(@Req() req: AuthRequest) {
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) {
      throw new BadRequestException('Registration does not accept profile, password or role fields');
    }
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) throw new BadRequestException('Idempotency-Key UUID required');
    const identity = req.identity!;
    const user = await this.repository.registerBuyer(identity.issuer, identity.subject);
    if (!user) throw new ForbiddenException('Account is disabled');
    return { id: user.id, roles: user.roles, venues: user.roles.includes('STAFF') ? await this.repository.listVenues(user.id) : [] };
  }
  @Get('me')
  @OperationAccess('getMe')
  async me(@Req() req: AuthRequest) {
    const user = req.principal!;
    return { id: user.id, roles: user.roles, venues: user.roles.includes('STAFF') ? await this.repository.listVenues(user.id) : [] };
  }
  @Get('health')
  @OperationAccess('health')
  health() { return { status: 'ok' }; }
}
