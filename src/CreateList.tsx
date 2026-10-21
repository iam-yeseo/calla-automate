import { useEffect, useRef, useState } from 'react';
import { today } from './domain';
import type { ProductImport } from './importer';
import type { Product } from './types';
import { FileDropzone } from './interaction';
import './editor-redesign.css';
import { Button, Field, Modal, ModalCloseButton } from './ui';

type ListMetadata = { title: string; author: string; work_date: string; note: string };

export default function CreateList({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (metadata: ListMetadata, products: Product[]) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('임예서');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File>();
  const [emptyList, setEmptyList] = useState(true);
  const [preview, setPreview] = useState<{ file: File; result: ProductImport }>();
  const [reading, setReading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyLock = useRef(false);
  const downloadLock = useRef(false);
  const result = preview?.file === file ? preview?.result : undefined;
  const canCreate = !!title.trim() && !busy && !reading && (!file || !!result);

  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setError('');
    setReading(!!file);
    if (file) {
      void import('./importer').then(module => module.inspectProductImport(file, crypto.randomUUID(), 1))
        .then(value => { if (active) setPreview({ file, result: value }); })
        .catch(reason => { if (active) setError((reason as Error).message); })
        .finally(() => { if (active) setReading(false); });
    }
    return () => { active = false; };
  }, [file]);

  async function create() {
    if (busyLock.current || !canCreate) return;
    busyLock.current = true;
    setBusy(true);
    setError('');
    try { await onCreate({ title: title.trim(), author, work_date: today(), note }, result?.products ?? []); }
    catch (reason) { setError((reason as Error).message); }
    finally { busyLock.current = false; setBusy(false); }
  }

  async function download() {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(true);
    setError('');
    try { await (await import('./importer')).downloadTemplate(); }
    catch { setError('템플릿을 준비하지 못했습니다. 다시 시도해 주세요.'); }
    finally { downloadLock.current = false; setDownloading(false); }
  }

  return <Modal className="create-list-modal" title="리스트 만들기" subtitle="등록할 상품을 담을 내부 리스트를 만듭니다."
    onClose={() => { if (!busyLock.current) onClose(); }} dismissible={!busy} width={672}
    footer={<><span className="muted">내부 리스트 작업</span><ModalCloseButton disabled={busy}>취소</ModalCloseButton><Button variant="primary" disabled={!canCreate} onClick={() => void create()}>{busy ? '만드는 중…' : '리스트 만들기'}</Button></>}>
    <fieldset className="form-stack form-fieldset" disabled={busy}>
      {error && <div className="alert error" role="alert">{error}</div>}

        <Field label="리스트 이름"><input value={title} onChange={event => setTitle(event.target.value)} placeholder="예: 260930-신제품 상품 등록" autoFocus /></Field>
        <Field label="등록자"><input value={author} onChange={event => setAuthor(event.target.value)} /></Field>
        <Field label="설명 · 선택"><textarea rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="리스트에 대한 메모를 입력하세요." /></Field>
      <label className="check-label"><input type="checkbox" checked={emptyList} onChange={event=>{setEmptyList(event.target.checked);if(event.target.checked)setFile(undefined);}}/>빈 리스트로 시작하기</label>
      <p className="field-hint">만든 뒤 상품 추가 또는 Excel 가져오기를 할 수 있습니다.</p>
      {!emptyList&&<section className="create-list-import" aria-label="상품 파일 가져오기">
        <div className="editor-section-toolbar"><h3>Excel 가져오기</h3><span className="field-hint">선택한 파일의 상품을 함께 추가합니다.</span></div>
        <FileDropzone title="엑셀 파일을 끌어다 놓으세요" description="XLSX · CSV / 최대 10MB" accept=".xlsx,.csv" icon="box" file={file} disabled={busy}
          onClear={() => setFile(undefined)} onFile={setFile}>
          <Button variant="ghost" disabled={busy || downloading} onClick={() => void download()}>{downloading ? '다운로드 준비 중…' : 'Excel 템플릿 다운로드'}</Button>
        </FileDropzone>
        {reading && <p className="muted" role="status">상품 파일을 확인하고 있습니다…</p>}
        {result && <div className="form-stack" role="status" aria-label="파일 인식 결과">
          <div><strong>{result.products.length}개 상품을 인식했습니다.</strong><p className="muted">{result.sheetName ? `첫 번째 시트 ‘${result.sheetName}’` : 'CSV 파일'} · {result.headerRows.length}줄 제목을 기준으로 가져옵니다.</p></div>
          {!!result.missingNameRows.length && <div className="alert warning">상품명 없는 {result.missingNameRows.length}개는 모델명 등 원본 정보를 유지한 초안으로 가져옵니다. 가져온 뒤 상품명을 입력해 주세요.</div>}
        </div>}
      <p className="field-hint">파일을 선택하지 않으면 빈 리스트로 시작합니다.</p>
      </section>}
    </fieldset>
  </Modal>;
}
