import { useEffect, useState } from 'react';
import { desktop, type DesktopState } from './desktop';
import { Badge, Button } from './ui';

export function DesktopTitlebar() {
  if (!desktop) return null;
  return <div className="desktop-titlebar"><span className="desktop-app-name">CALLA-AUTOMATE <span>상품 운영</span></span><div className="desktop-titlebar-connections"><span className="desktop-titlebar-status"><span className="desktop-status-dot ready" />이 Mac에서 실행 중</span><div id="desktop-mall-status" /></div></div>;
}

export function DesktopRunnerDetails() {
  const [state, setState] = useState<DesktopState>();
  useEffect(() => { if (desktop) void desktop.getState().then(setState); }, []);
  if (!desktop) return null;
  return <div className="desktop-runner-details"><p className="muted">앱에 포함된 실행기가 자동으로 연결됩니다. 창을 닫아도 메뉴 막대에서 작업이 계속됩니다.</p><dl className="details-list"><dt>Google Chrome</dt><dd><Badge state={state?.chromeAvailable ? 'success' : 'warning'}>{state?.chromeAvailable ? '설치됨' : '설치 필요'}</Badge></dd><dt>웹과 데이터 공유</dt><dd>cauto.yeseo.im</dd><dt>앱 버전</dt><dd>{state?.version || '—'}</dd></dl>{state && !state.chromeAvailable && <p className="alert warning">고도몰 등록을 사용하려면 Google Chrome을 응용 프로그램 폴더에 설치해 주세요.</p>}<Button onClick={() => void desktop?.openWeb()}>웹 버전 열기 ↗</Button></div>;
}
