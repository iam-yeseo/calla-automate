import { useEffect, useRef, useState } from 'react';
import { api, DEMO } from './api';
import { mallBrands } from './mall-settings';
import type { MallConnection } from './godomall-types';
import type { Channel, Settings } from './types';
import { Badge, Button, Empty, Icon, PageFooter, PageTitle } from './ui';
import './settings-redesign.css';

const malls: Channel[] = ['retail', 'wholesale'];
const mallName = (mall: Channel) => mall === 'retail' ? '고도몰 소매' : '고도몰 도매';
function syncDate(value: string | null | undefined) {
  if (!value) return '기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}

export default function Sync({ settings, syncAt, admin, onRefresh, onNavigate }: {
  settings: Settings; syncAt: string; admin: boolean; onRefresh: () => Promise<void>; onNavigate: (page: string) => void;
}) {
  const [connections, setConnections] = useState<MallConnection[]>([]), [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController(); controller.current = request;
    api<{ connections: MallConnection[] }>('/godomall/connections', { signal: request.signal }).then(result => { if (!request.signal.aborted) setConnections(result.connections); }).catch(failure => { if (!request.signal.aborted) setError(failure.message); }).finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, []);
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setRefreshing(true); setError('');
    try {
      await onRefresh();
      const result = await api<{ connections: MallConnection[] }>('/godomall/connections', { signal: controller.current?.signal });
      if (!controller.current?.signal.aborted) setConnections(result.connections);
    } catch (failure) { if (!controller.current?.signal.aborted) setError((failure as Error).message); }
    finally { lock.current = false; if (!controller.current?.signal.aborted) setRefreshing(false); }
  }
  const records = malls.flatMap(mall => (['categories', 'brands'] as const).flatMap(kind => {
    const at = settings.taxonomySyncedAt?.[mall]?.[kind];
    return at ? [{ id: `${mall}-${kind}`, at, target: `${mall === 'retail' ? '소매' : '도매'} · ${kind === 'categories' ? '카테고리' : '브랜드'}`, detail: `${kind === 'categories' ? settings.categories[mall].length : mallBrands(settings, mall).length}개 ${kind === 'categories' ? '카테고리' : '브랜드'} 데이터 업데이트` }] : [];
  })).sort((a, b) => b.at.localeCompare(a.at));
  const needsSetup = !loading && !DEMO && connections.some(connection => !connection.configured || connection.connected === false);
  return <div className="sync-redesign">
    <PageTitle title="동기화" description="저장된 상품·설정 데이터를 새로 불러오고 몰별 API 연결 상태를 확인합니다." actions={<Button variant="primary" disabled={loading || refreshing} onClick={() => void refresh()}>{refreshing ? '새로 불러오는 중…' : '지금 새로고침'}</Button>} />
    {error && <div className="alert error sync-notice" role="alert"><Icon name="info"/><span>{error}</span><Button disabled={refreshing} onClick={() => void refresh()}>다시 시도</Button></div>}
    {needsSetup && <div className="alert sync-notice warning"><Icon name="info"/><span>확인이 필요한 고도몰 연결이 있습니다. 몰별 연결 상태를 확인해 주세요. 저장된 기존 데이터는 유지됩니다.</span><Button onClick={() => onNavigate('automation')}>연결 상태 확인</Button></div>}
    <section className="sync-section"><h2>몰별 동기화 상태</h2><div className="card table-wrap sync-table-wrap"><table className="data-table sync-status-table"><thead><tr><th>대상</th><th>분류 마지막 업데이트</th><th>API 연결</th><th>내용</th><th>행동</th></tr></thead><tbody>{malls.map(mall => {
      const connection = connections.find(row => row.mallId === mall), updated = settings.taxonomySyncedAt?.[mall], at = [updated?.categories, updated?.brands].filter((date): date is string => !!date).sort().at(-1);
      const state = loading ? 'pending' : DEMO ? 'pending' : connection?.connected ? 'connected' : 'warning';
      const label = loading ? '확인 중' : DEMO ? '미리보기' : connection?.connected ? '연결 확인' : !connection ? '미확인' : !connection.configured ? '설정 필요' : '연결 확인 필요';
      return <tr key={mall}><td>{mallName(mall)}</td><td>{syncDate(at)}</td><td><Badge state={state}>{label}</Badge></td><td><span>카테고리 {settings.categories[mall].length}개 · 브랜드 {mallBrands(settings, mall).length}개</span><small className="secondary">{connection?.message || (loading ? '연결 정보를 불러오고 있습니다.' : '연결 정보를 확인하지 못했습니다.')}</small></td><td><Button onClick={() => onNavigate('categories')}>{admin ? '분류 관리' : '분류 조회'}</Button></td></tr>;
    })}</tbody></table></div></section>
    <section className="sync-section"><h2>동기화 환경</h2><div className="sync-environment">
      <div><div><strong>작업 공간 데이터 새로고침</strong><p>상품 리스트와 저장된 설정 데이터를 다시 불러옵니다.</p></div><Badge state="pending">수동 새로고침</Badge></div>
      <div><div><strong>카테고리와 브랜드 업데이트</strong><p>관리자가 소매·도매별로 고도몰 데이터를 가져올 수 있습니다.</p></div><Button onClick={() => onNavigate('categories')}>카테고리와 브랜드</Button></div>
      <div><div><strong>상품 등록 결과 확인</strong><p>자동 상품 등록에서 몰별 등록 결과와 확인이 필요한 작업을 검토합니다.</p></div><Button onClick={() => onNavigate('automation')}>등록 결과 보기</Button></div>
    </div></section>
    <section className="sync-section"><h2>최근 분류 업데이트</h2><div className="card table-wrap sync-table-wrap"><table className="data-table sync-history-table"><thead><tr><th>일시</th><th>대상</th><th>내용</th><th>상태</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td>{syncDate(record.at)}</td><td>{record.target}</td><td>{record.detail}</td><td><Badge state="connected">업데이트 완료</Badge></td></tr>)}</tbody></table>{!records.length && <Empty title="아직 분류 업데이트 기록이 없습니다" description="카테고리와 브랜드 화면에서 몰별 데이터를 업데이트할 수 있습니다."/>}</div></section>
    <PageFooter><p>{syncAt ? `작업 공간 마지막 새로고침 · ${syncDate(syncAt)}` : '새로고침하면 저장된 상품 리스트와 설정을 다시 불러옵니다.'}</p><span className="spacer"/><span className="muted sync-footer-note">{DEMO ? '로컬 미리보기' : '고도몰 API 연동'}</span></PageFooter>
  </div>;
}
