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
      type: 'object', additionalProperties: false, required: ['timetableType', 'periods', 'recurrence', 'reviewReasons', 'weekdayHeaderVisible', 'visibleDays', 'lessons', 'warnings'],
      properties: {
        periods: { type: 'array', items: {
          type: 'object', additionalProperties: false, required: ['period', 'start', 'end'],
          properties: { period: { type: 'integer' }, start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] } },
        } },
        timetableType: { type: 'string', enum: ['school', 'university', 'shift', 'work', 'personal', 'study', 'unknown'] },
        recurrence: { type: 'string', enum: ['weekly', 'dated', 'unknown'] },
        reviewReasons: { type: 'array', items: { type: 'string' } },
        weekdayHeaderVisible: { type: 'boolean' },
        visibleDays: { type: 'array', items: { type: 'integer', enum: [0,1,2,3,4,5,6] } },
        warnings: { type: 'array', items: { type: 'string' } },
        lessons: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['title', 'kind', 'employeeName', 'period', 'location', 'dayOfWeek', 'start', 'end'],
          properties: {
            employeeName: { type: ['string', 'null'] },
            period: { type: ['integer', 'null'] },
            kind: { type: 'string', enum: ['class', 'job', 'event', 'flexible', 'unknown'] },
            title: { type: 'string' }, location: { type: 'string' },
            dayOfWeek: { type: 'array', items: { type: 'integer', enum: [0,1,2,3,4,5,6] } },
            start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] },
          },
        } },
      },
    },
  },
};
