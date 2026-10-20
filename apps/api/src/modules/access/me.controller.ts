import { Controller, Get, Inject, Req } from '@nestjs/common';
import { OperationAccess } from './policies.js';
import { ACCESS_REPOSITORY, type AccessRepository } from './types.js';
import type { AuthRequest } from './access.guard.js';
@Controller()
export class MeController {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}
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
