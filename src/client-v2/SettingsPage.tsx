/**
 * @jsxRuntime classic
 * 旧版 `/admin` 入口强制使用 classic JSX runtime，避免开发态 `jsx-dev-runtime` 与旧后台 React 加载链路冲突。
 */
import React from 'react';
import { useAPIClient, useCurrentUserContext, useApp } from './hooks';
import { useT } from './locale';
import { BaseSettingsPage } from '../client/components/BaseSettingsPage';

export const SettingsPage = () => {
  const adapters = { useAPIClient, useCurrentUserContext, useApp, useT };
  return <BaseSettingsPage adapters={adapters} />;
};
