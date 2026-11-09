import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Access, Roles } from './common/ctx';
import { notFound } from './common/errors';
import { X3Reader } from './x3/x3-reader';
import { SimGateway } from './x3/sim/sim-gateway';

/**
 * Simulation only (X3_MODE=sim): stands in for the warehouse working in X3, so
 * an order can be taken through allocation, preparation, dispatch and
 * invoicing in a demo or a test. Not registered in live mode.
 */
@Controller('sim')
export class SimController {
  constructor(private sim: SimGateway, private reader: X3Reader) {}

  @Post('orders/:id/advance') @HttpCode(200) @Roles('ADMIN', 'SUPERVISOR') @Access('orders')
  async advance(@Param('id') id: string) {
    const step = await this.sim.advanceOrder(id);
    if (step === null) throw notFound();
    this.reader.invalidate();
    return { step };
  }
}
