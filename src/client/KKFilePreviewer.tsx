/**
 * @jsxRuntime classic
 * 旧版 `/admin` 入口强制使用 classic JSX runtime，避免开发态 `jsx-dev-runtime` 与旧后台 React 加载链路冲突。
 */
import React from 'react';
import { useAPIClient, useCurrentUserContext, useApp } from '@nocobase/client';
import { useT } from './locale';
import { BaseKKFilePreviewer, PreviewerProps } from './components/BaseKKFilePreviewer';

export type { PreviewFileRecord, PreviewerProps } from './components/BaseKKFilePreviewer';

export const KKFilePreviewer = (props: PreviewerProps) => {
  const adapters = { useAPIClient, useCurrentUserContext, useApp, useT };
  return <BaseKKFilePreviewer {...props} adapters={adapters} />;
};
