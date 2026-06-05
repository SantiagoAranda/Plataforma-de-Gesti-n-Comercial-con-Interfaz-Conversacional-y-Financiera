import { Test, TestingModule } from '@nestjs/testing';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BusinessActiveGuard } from '../common/guards/business-active.guard';

describe('MovementsController', () => {
  let controller: MovementsController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [MovementsController],
      providers: [
        {
          provide: MovementsService,
          useValue: {},
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BusinessActiveGuard)
      .useValue({ canActivate: () => true });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<MovementsController>(MovementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
