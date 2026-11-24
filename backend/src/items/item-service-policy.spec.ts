import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import {
  assertAppointmentService,
  assertReservableSchedule,
  assertUnscheduledItems,
  servicePolicyData,
} from './item-service-policy';
import { toPublicItem } from './item-public-view';

describe('F1.5 service contract', () => {
  it('distinguishes legacy defaults, explicit new-form values and products', () => {
    expect(servicePolicyData('SERVICE', {})).toEqual({
      requiresAppointment: true,
      allowWalkIn: true,
    });
    expect(
      servicePolicyData('SERVICE', {
        requiresAppointment: true,
        allowWalkIn: false,
      }),
    ).toEqual({ requiresAppointment: true, allowWalkIn: false });
    expect(servicePolicyData('PRODUCT', {})).toEqual({
      requiresAppointment: false,
      allowWalkIn: false,
    });
    expect(() =>
      servicePolicyData('PRODUCT', { requiresAppointment: true }),
    ).toThrow();
    expect(
      servicePolicyData(
        'SERVICE',
        {},
        { requiresAppointment: false, allowWalkIn: false },
      ),
    ).toEqual({ requiresAppointment: false, allowWalkIn: false });
  });
  it.each([null, 'false', 0])(
    'rejects non-boolean policy %p on create and patch',
    (value) => {
      for (const Dto of [CreateItemDto, UpdateItemDto]) {
        const errors = validateSync(
          plainToInstance(Dto as typeof CreateItemDto, {
            type: 'SERVICE',
            name: 'Test',
            price: 10,
            requiresAppointment: value,
            allowWalkIn: value,
          }),
        );
        expect(errors.map((e) => e.property)).toEqual(
          expect.arrayContaining(['requiresAppointment', 'allowWalkIn']),
        );
      }
    },
  );
  it('does not apply F1.8 authorization yet', () => {
    expect(() =>
      assertAppointmentService({ type: 'SERVICE', requiresAppointment: true }),
    ).not.toThrow();
    expect(() =>
      assertAppointmentService({ type: 'SERVICE', requiresAppointment: false }),
    ).toThrow();
  });
  it('accepts a commercial mix only when no item requires an appointment', () => {
    expect(() =>
      assertUnscheduledItems([
        { type: 'PRODUCT' },
        { type: 'SERVICE', requiresAppointment: false },
      ]),
    ).not.toThrow();
    expect(() =>
      assertUnscheduledItems([{ type: 'PRODUCT' }, { type: 'SERVICE' }]),
    ).toThrow();
  });
  it('publishes modality without exposing the internal permission or hidden price', () => {
    expect(
      toPublicItem({
        price: 123,
        publishWithoutPrice: true,
        requiresAppointment: false,
        allowWalkIn: true,
      }),
    ).toEqual({
      price: null,
      publishWithoutPrice: true,
      requiresAppointment: false,
    });
  });
  it('requires a usable duration and a fitting non-overlapping window', () => {
    const window = { weekday: 'MON', startMinute: 480, endMinute: 600 };
    expect(() => assertReservableSchedule(95, [window])).not.toThrow();
    for (const duration of [null, 0, 1500, 121])
      expect(() => assertReservableSchedule(duration, [window])).toThrow();
    expect(() => assertReservableSchedule(60, [])).toThrow();
    expect(() =>
      assertReservableSchedule(60, [window, { ...window, startMinute: 590 }]),
    ).toThrow();
  });
});
