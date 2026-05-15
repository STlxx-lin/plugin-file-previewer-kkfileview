import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'kkfileviewModificationRecordItems',
  title: 'kkFileView Modification Record Items',
  fields: [
    {
      type: 'string',
      name: 'operator',
      defaultValue: '-',
    },
    {
      type: 'text',
      name: 'summary',
      defaultValue: '',
    },
    {
      type: 'text',
      name: 'changedFields',
      defaultValue: '[]',
    },
    {
      type: 'text',
      name: 'content',
      defaultValue: '',
    },
  ],
});
