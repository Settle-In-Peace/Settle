import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seat, SeatStatus } from '../seats/seat.entity';

/**
 * DialerAccessGuard — who may originate/manage provider calls.
 *
 * Two access paths:
 *   1. Platform staff: user.role 'sales' or 'admin' (same as SalesGuard).
 *   2. DaaS agents: the user holds an ACTIVE seat in any org — suspended or
 *      released seats cannot dial (seat suspend = immediate call cutoff).
 *
 * TCPA/DNC compliance still runs in DialerService#assertDialable.
 */
@Injectable()
export class DialerAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(Seat)
    private readonly seatsRepository: Repository<Seat>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.role === 'sales' || user.role === 'admin') {
      return true;
    }
    const seat = await this.seatsRepository.findOne({
      where: { userId: user.sub, status: SeatStatus.ACTIVE },
    });
    if (seat) return true;
    throw new ForbiddenException(
      'Sales access or an active dialer seat required',
    );
  }
}
