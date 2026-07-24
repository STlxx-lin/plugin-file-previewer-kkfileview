import React from 'react';
import { useAPIClient, useCurrentUserContext, useApp } from '@nocobase/client';
import { useT } from './locale';
import { BaseKKFilePreviewer, PreviewerProps } from './components/BaseKKFilePreviewer';

export type { PreviewFileRecord, PreviewerProps } from './components/BaseKKFilePreviewer';

export const KKFilePreviewer = (props: PreviewerProps) => {
  const adapters = { useAPIClient, useCurrentUserContext, useApp, useT };
  return <BaseKKFilePreviewer {...props} adapters={adapters} />;
};
