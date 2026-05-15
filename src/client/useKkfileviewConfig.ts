import { useEffect, useState } from 'react';
import { configReady, kkfileviewConfig, subscribeConfig } from './configCache';

/**
 * 直接读取全局配置缓存的 React Hook。
 *
 * - 首次渲染立即返回缓存中的配置（含默认值）。
 * - 当 `syncConfigCacheFromServer()` 完成后，会触发重渲染以使用最新配置。
 * - 不发起任何 API 请求，避免每次打开预览弹窗都重复请求。
 */
export function useKkfileviewConfig(): { config: typeof kkfileviewConfig; ready: boolean } {
    const [ready, setReady] = useState(configReady);
    const [, setVersion] = useState(0);

    useEffect(() => {
        // 若挂载时配置已就绪，直接同步状态
        if (configReady && !ready) {
            setReady(true);
        }
        // 订阅后续更新
        const unsubscribe = subscribeConfig(() => {
            // 每次配置变更都刷新一次，确保读取到最新缓存值
            setReady(configReady);
            setVersion((value) => value + 1);
        });
        return unsubscribe;
    }, [ready]);

    return { config: kkfileviewConfig, ready };
}
