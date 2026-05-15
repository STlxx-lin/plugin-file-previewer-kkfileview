import React, { useMemo, useRef } from 'react';
import { Watermark } from 'antd';
import { useCurrentUserContext } from '@nocobase/client';
import { useKkfileviewConfig } from './useKkfileviewConfig';
import { resolveWatermarkTemplate } from './watermarkTemplate';

export const GlobalWatermarkProvider = (props: { children: React.ReactNode }) => {
  const { config: kkfileviewConfig, ready } = useKkfileviewConfig();
  const currentUserContext = useCurrentUserContext();
  const currentUser = currentUserContext?.data?.data || currentUserContext?.data || null;
  const requestedAtRef = useRef<Date>(new Date());

  const watermarkText = useMemo(
    () => resolveWatermarkTemplate(kkfileviewConfig.watermark || '', { user: currentUser, requestedAt: requestedAtRef.current }).trim(),
    [kkfileviewConfig.watermark, currentUser]
  );

  if (!ready || kkfileviewConfig.watermarkType !== 'global' || !watermarkText) {
    return <>{props.children}</>;
  }

  return (
    <Watermark
      content={watermarkText}
      font={{ color: 'rgba(0, 0, 0, 0.12)', fontSize: 16 }}
      zIndex={2147483647}
      style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}
    >
      {props.children}
    </Watermark>
  );
};
