import React from 'react';
import { useAPIClient, useCurrentUserContext, useApp } from './hooks';
import { useT } from './locale';
import { BaseKKFilePreviewer, PreviewerProps } from '../client/components/BaseKKFilePreviewer';

export type { PreviewFileRecord, PreviewerProps } from '../client/components/BaseKKFilePreviewer';

export const KKFilePreviewer = (props: PreviewerProps) => {
  const adapters = { useAPIClient, useCurrentUserContext, useApp, useT };
  return <BaseKKFilePreviewer {...props} adapters={adapters} />;
};
