import { Fragment } from 'react';
import { MALLS } from './godomall-types';
import { DELIVERY_DEFAULT_NAMES, GUIDE_DEFAULT_NAMES } from './registration-defaults';
import type { Channel } from './types';

export default function RegistrationDefaults({ malls }: { malls: Channel[] }) {
  return <dl className="details-list registration-defaults" aria-label="자동 적용되는 배송·이용안내">
    {malls.map(mall => <Fragment key={mall}><dt>{MALLS[mall].name} 배송 설정</dt><dd>{DELIVERY_DEFAULT_NAMES[mall]}</dd></Fragment>)}
    <dt>배송안내</dt><dd>{GUIDE_DEFAULT_NAMES.delivery}</dd>
    <dt>AS안내</dt><dd>{GUIDE_DEFAULT_NAMES.as}</dd>
    <dt>환불안내</dt><dd>{GUIDE_DEFAULT_NAMES.refund}</dd>
  </dl>;
}
