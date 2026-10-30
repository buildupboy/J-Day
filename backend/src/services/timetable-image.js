import sharp from 'sharp';

const MAX_PIXELS = 40_000_000;
export async function preprocessTimetable(image) {
  const buffer = Buffer.from(image.split(',')[1], 'base64');
  try {
    const jpeg = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate().resize({ width: 1600, height: 2400, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
    return { image: `data:image/jpeg;base64,${jpeg.toString('base64')}` };
  } catch {
    throw Object.assign(new Error('이미지를 읽지 못했어요. 정상 PNG 또는 JPG 사진으로 다시 올려 주세요.'), { status: 422 });
  }
}

export const TIMETABLE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'timetable_capture', strict: true,
    schema: {
      type: 'object', additionalProperties: false, required: ['weekdayHeaderVisible', 'visibleDays', 'lessons', 'warnings'],
      properties: {
        weekdayHeaderVisible: { type: 'boolean' },
        visibleDays: { type: 'array', items: { type: 'integer', enum: [0,1,2,3,4,5,6] } },
        warnings: { type: 'array', items: { type: 'string' } },
        lessons: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['title', 'location', 'dayOfWeek', 'start', 'end'],
          properties: {
            title: { type: 'string' }, location: { type: 'string' },
            dayOfWeek: { type: 'array', items: { type: 'integer', enum: [0,1,2,3,4,5,6] } },
            start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] },
          },
        } },
      },
    },
  },
};
