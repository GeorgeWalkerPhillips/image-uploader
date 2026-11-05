import { fitWithin, thumbPathFor, THUMB_MAX_EDGE } from './thumbnail';

describe('thumbPathFor', () => {
  it('appends .thumb.jpg to the storage path (matches the DB CHECK constraint)', () => {
    expect(thumbPathFor('evt/123_abc_photo.jpg')).toBe('evt/123_abc_photo.jpg.thumb.jpg');
  });
});

describe('fitWithin', () => {
  it('scales a landscape photo so its long edge is the max', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: THUMB_MAX_EDGE, height: 450 });
  });

  it('scales a portrait photo so its long edge is the max', () => {
    expect(fitWithin(3000, 4000)).toEqual({ width: 450, height: THUMB_MAX_EDGE });
  });

  it('never upscales a small image', () => {
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    expect(fitWithin(8000, 1)).toEqual({ width: THUMB_MAX_EDGE, height: 1 });
  });

  it('returns null for missing or invalid dimensions', () => {
    expect(fitWithin(0, 100)).toBeNull();
    expect(fitWithin(undefined, undefined)).toBeNull();
    expect(fitWithin(-5, 10)).toBeNull();
  });
});
