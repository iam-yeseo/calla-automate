import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, DEMO } from './api';
import { desktop } from './desktop';
import { MALLS, type MallConnection } from './godomall-types';
import type { Channel } from './types';

export default function MallStatus() {
  const [connections, setConnections] = useState<MallConnection[]>([]), [busy, setBusy] = useState<Channel[]>([]);
  const [errors, setErrors] = useState<Partial<Record<Channel, string>>>({});
  useEffect(() => {
    if (DEMO) return;
    const controller = new AbortController();
    const refresh = () => api<{ connections: MallConnection[] }>('/godomall/connections', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setConnections(data.connections); }).catch(() => {});
    void refresh(); const timer = setInterval(refresh, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  async function check(mall: Channel) {
    if (busy.includes(mall)) return; setBusy(old => [...old, mall]); setErrors(old => ({ ...old, [mall]: undefined }));
    try { const { connection } = await api<{ connection: MallConnection }>(`/godomall/${mall}/connection`); setConnections(old => [...old.filter(c => c.mallId !== mall), connection]); }
    catch (error) { setErrors(old => ({ ...old, [mall]: (error as Error).message })); }
    finally { setBusy(old => old.filter(m => m !== mall)); }
  }
  const content = <div className="gnb-mall-status" aria-label="고도몰 API 연결 상태">{(['retail', 'wholesale'] as const).map(mall => {
    const connection = connections.find(c => c.mallId === mall), loading = busy.includes(mall);
    const state = errors[mall] || connection?.connected === false ? 'error' : connection?.connected ? 'connected' : 'unknown';
    const label = loading ? '확인 중' : DEMO ? '미리보기' : state === 'connected' ? '연결됨' : state === 'error' ? '확인 필요' : '미확인';
    const checked = connection?.checkedAt ? ` · 마지막 확인 ${new Date(connection.checkedAt).toLocaleString('ko-KR')}` : '';
    return <button key={mall} className="gnb-mall-chip" data-state={state} disabled={loading || DEMO} onClick={() => void check(mall)} aria-label={`${MALLS[mall].name} ${label}, 연결 다시 확인`} title={`${errors[mall] || connection?.message || label}${checked}`}><span className="gnb-mall-dot" aria-hidden="true" /><span>{MALLS[mall].name}</span><small>{label}</small></button>;
  })}</div>;
  const host = desktop ? document.getElementById('desktop-mall-status') : null;
  return host ? createPortal(content, host) : content;
}
