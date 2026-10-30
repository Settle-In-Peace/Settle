import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkiptraceService } from './skiptrace.service';
import { SkipTraceLookupInput } from './skiptrace-provider.interface';

interface AuthenticatedRequest extends Request {
  user?: { sub?: string; id?: string };
}

@Controller('skiptrace')
@UseGuards(JwtAuthGuard)
export class SkiptraceController {
  constructor(private readonly skiptrace: SkiptraceService) {}

  /**
   * POST /skiptrace/lookup — trace 1..100 contacts by name + property address.
   * Returns ranked phone candidates with vendor DNC/TCPA/litigator flags.
   */
  @Post('lookup')
  lookup(
    @Body()
    body: {
      inputs: SkipTraceLookupInput[];
      leadId?: string;
      orgId?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    const agentId = req.user?.sub ?? req.user?.id;
    return this.skiptrace.run(body.inputs, {
      leadId: body.leadId,
      orgId: body.orgId,
      agentId,
    });
  }

  /** GET /skiptrace/history — audit trail of lookups. */
  @Get('history')
  history(@Query('orgId') orgId?: string) {
    return this.skiptrace.history(orgId);
  }
}
