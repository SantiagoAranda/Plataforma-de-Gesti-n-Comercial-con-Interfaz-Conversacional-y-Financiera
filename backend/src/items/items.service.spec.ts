import { ItemsService } from './items.service';

describe('ItemsService', () => {
  it('should be defined', () => {
    const service = new ItemsService({} as any, {} as any);
    expect(service).toBeDefined();
  });
});
