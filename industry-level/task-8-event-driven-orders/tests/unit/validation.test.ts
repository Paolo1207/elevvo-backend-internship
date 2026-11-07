import { AppError } from '../../src/lib/errors';
import { isRecord, parseId, parsePrice, queryPositiveInt, queryString } from '../../src/lib/validation';

describe('parseId', () => {
  it('accepts positive integers', () => {
    expect(parseId('7')).toBe(7);
  });

  it.each(['0', '-1', '1.5', 'abc', '', undefined])('rejects %p with a 400', (value) => {
    expect(() => parseId(value)).toThrow(AppError);
    try {
      parseId(value);
    } catch (error) {
      expect((error as AppError).status).toBe(400);
    }
  });

  it('uses the given name in the message', () => {
    expect(() => parseId('x', 'userId')).toThrow('"userId" must be a positive integer');
  });
});

describe('parsePrice', () => {
  it.each([['24.99', '24.99'], [10, '10'], ['5.5', '5.5'], [' 3 ', '3']])('accepts %p', (input, expected) => {
    expect(parsePrice(input, 'price')).toBe(expected);
  });

  it.each(['0', '-5', '1.234', 'abc', '', null, undefined, '123456789'])('rejects %p', (input) => {
    expect(() => parsePrice(input, 'price')).toThrow(AppError);
  });
});

describe('queryString / queryPositiveInt', () => {
  it('trims strings and treats empty values as missing', () => {
    expect(queryString('  mouse ')).toBe('mouse');
    expect(queryString('   ')).toBeUndefined();
    expect(queryString(undefined)).toBeUndefined();
    expect(queryString(['a', 'b'])).toBeUndefined();
  });

  it('parses optional positive integers', () => {
    expect(queryPositiveInt('3', 'userId')).toBe(3);
    expect(queryPositiveInt(undefined, 'userId')).toBeUndefined();
    expect(() => queryPositiveInt('-3', 'userId')).toThrow(AppError);
  });
});

describe('isRecord', () => {
  it('only accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('text')).toBe(false);
  });
});