import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'kkfileviewPreviewRecordItems',
  title: 'kkFileView Preview Record Items',
  fields: [
    {
      type: 'string',
      name: 'operator',
      defaultValue: '-',
    },
    {
      type: 'string',
      name: 'fileName',
      defaultValue: '',
    },
    {
      type: 'string',
      name: 'previewService',
      defaultValue: '',
    },
    {
      type: 'text',
      name: 'fileUrl',
      defaultValue: '',
    },
    {
      type: 'date',
      name: 'requestedAt',
    },
  ],
});
