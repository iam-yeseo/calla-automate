/* Shared data contract. No DOM or database dependencies. */
var AutomationCore = (function () {
  var BASE = 'https://calla.hgodo.com/product/';
  var EXTENSIONS = ['jpg', 'png', 'webp', 'gif'];
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  /* 브랜드 비교 키: 대소문자·공백·기호 차이를 무시합니다. (TILTA = tilta = Tilta-) */
  function brandKey(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3]/g, ''); }
  function hangulInitials(v) {
    var initials = [0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e];
    return Array.from(String(v || '')).map(function (ch) {
      var code = ch.charCodeAt(0) - 0xAC00;
      if (code < 0 || code > 11171) return ch;
      return String.fromCharCode(initials[Math.floor(code / 588)]);
    }).join('');
  }
  function brandSearchText(brand) {
    brand = brand || {};
    var aliases = Array.isArray(brand.aliases) ? brand.aliases : [];
    var text = [brand.name, brand.code].concat(aliases).filter(Boolean).join(' ');
    return text + ' ' + hangulInitials(brand.name) + ' ' + aliases.map(hangulInitials).join(' ');
  }
  function brandMatches(brand, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return brandKey(brandSearchText(brand)).indexOf(brandKey(q)) > -1 ||
      hangulInitials(brandSearchText(brand)).indexOf(q.replace(/\s/g, '')) > -1;
  }
  /* 입력 문자열과 같은 브랜드를 목록에서 찾습니다. 없으면 null. */
  function matchBrand(brands, text) {
    var key = brandKey(text);
    if (!key) return null;
    return (brands || []).find(function (b) { return brandKey(b.name) === key; }) || null;
  }
  function normalizeSettings(s) {
    if (s && typeof s === 'object' && !Array.isArray(s.brands)) s.brands = [];
    return s;
  }
  /* 고도몰 상품명은 <font …> 같은 태그를 포함할 수 있습니다.
     원문은 저장·복사·전달에 그대로 쓰고, 목록 표시에만 이 함수로 읽기용 텍스트를 만듭니다.
     결과는 항상 텍스트로만 출력해야 하며 DOM에 그대로 삽입하지 않습니다. */
  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodeEntities(text) {
    return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (whole, body) {
      if (body.charAt(0) === '#') {
        var code = body.charAt(1) === 'x' || body.charAt(1) === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        if (!isFinite(code) || code < 1 || code > 0x10ffff) return whole;
        try { return String.fromCodePoint(code); } catch (e) { return whole; }
      }
      var named = ENTITIES[body.toLowerCase()];
      return named === undefined ? whole : named;
    });
  }
  function hasMarkup(value) { return /<[a-zA-Z/!][^>]*>/.test(String(value == null ? '' : value)); }
  /* 스마트스토어 상품명 자동 규칙: `/` 를 공백 한 칸으로 바꾸고 연속 공백을 하나로 정리합니다.
     상품명 HTML 원문에는 `</font>` 처럼 `/` 가 들어 있으므로, 읽기용 텍스트를 먼저 뽑고 규칙을 적용합니다.
     원문 자체는 그대로 보존되고 여기서 만든 값은 name_naver 에만 쓰입니다. */
  function smartName(value) {
    return displayName(value).replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
  }
  /* 직접 입력 중에는 `/` 만 공백으로 바꾸고 나머지 입력은 건드리지 않습니다. (타이핑 방해 방지) */
  function smartNameInput(value) {
    return String(value == null ? '' : value).replace(/\//g, ' ');
  }
  function displayName(value) {
    var raw = String(value == null ? '' : value);
    if (raw.indexOf('<') === -1 && raw.indexOf('&') === -1) return raw;
    var text = raw
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '');
    return decodeEntities(text).replace(/\s+/g, ' ').trim();
  }
  function normalize(value) {
    var a = value && typeof value === 'object' && !Array.isArray(value) ? clone(value) : {};
    a.categoryCodes = Object.assign({ retail: '', wholesale: '' }, a.categoryCodes);
    a.detailImages = Array.isArray(a.detailImages) ? a.detailImages : [];
    a.generator = Object.assign({ brand: '', product: '', folder: '', extension: 'jpg', count: 1 }, a.generator);
    /* 생성용 브랜드·모델명은 기본 설정값을 따르고 '직접 입력'일 때만 따로 보관합니다.
       기존 데이터는 값이 남아 있으면 직접 입력으로 봅니다. */
    a.generator.brandManual = typeof a.generator.brandManual === 'boolean' ? a.generator.brandManual : !!a.generator.brand;
    a.generator.productManual = typeof a.generator.productManual === 'boolean' ? a.generator.productManual : !!a.generator.product;
    a.naverNameMode = a.naverNameMode === 'manual' ? 'manual' : 'auto';
    a.origin = typeof a.origin === 'string' ? a.origin.trim() : '';
    a.schemaVersion = 1;
    return a;
  }
  function path(categories, code) {
    var parts = [], seen = new Set();
    while (code && !seen.has(code)) {
      seen.add(code);
      var c = categories.find(function (n) { return n.code === code; });
      if (!c) return '';
      parts.unshift(c.name); code = c.parentCode;
    }
    return parts.join(' > ');
  }
  function defaultFolder(categories, code) {
    var seen = new Set();
    while (code && !seen.has(code)) {
      seen.add(code);
      var c = categories.find(function (n) { return n.code === code; });
      if (!c) break;
      if (c.folder) return c.folder;
      code = c.parentCode;
    }
    return '';
  }
  function imageUrl(image) {
    var folder = String(image.folder || '').trim();
    var filename = String(image.filename || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(folder)) return '';
    if (!/^[a-z0-9][a-z0-9_.-]*\.(jpg|png|webp|gif)$/.test(filename) || filename.includes('..')) return '';
    return BASE + folder + '/' + filename;
  }
  /* 이미지 주소 생성에 실제로 쓰는 값. 직접 입력이 아니면 상품 기본 정보를 따릅니다. */
  function generatorValues(item) {
    var a = normalize(item && item.automation), g = a.generator;
    return Object.assign({}, g, {
      brand: g.brandManual ? g.brand : (item && item.brand) || '',
      product: g.productManual ? g.product : (item && item.model) || ''
    });
  }
  function generate(g) {
    var brand = slug(g.brand), product = slug(g.product), count = Number(g.count);
    if (!brand || !product) throw new Error('영문 브랜드와 파일명용 제품명을 입력해 주세요.');
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('이미지 수는 1~50장으로 입력해 주세요.');
    if (!EXTENSIONS.includes(g.extension)) throw new Error('확장자를 선택해 주세요.');
    var images = Array.from({ length: count }, function (_, i) {
      return { folder: g.folder, filename: brand + '-' + product + (count > 1 ? '-' + (i + 1) : '') + '.' + g.extension };
    });
    if (!imageUrl(images[0])) throw new Error('이미지 폴더를 선택해 주세요.');
    return images;
  }
  function imageLinkUrl(image) {
    var value = String(image.linkUrl || '').trim();
    if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return '';
    try { var parsed = new URL(value); return parsed.hostname && !parsed.username && !parsed.password ? value : ''; } catch (e) { return ''; }
  }
  function imageLinkIssue(image) {
    return image.linkEnabled === true && !imageLinkUrl(image) ? '바로가기 링크에 http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.' : '';
  }
  function htmlAttribute(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function html(images) {
    if (!images.length || images.some(function (i) { return !imageUrl(i) || imageLinkIssue(i); })) return '';
    return '<div align="center">\n' + images.map(function (i) { var tag = '<img src="' + imageUrl(i) + '">'; return '  ' + (i.linkEnabled === true ? '<a href="' + htmlAttribute(imageLinkUrl(i)) + '" target="_blank" rel="noopener noreferrer">' + tag + '</a>' : tag); }).join('\n') + '\n</div>';
  }
  function validation(image) {
    var v = image.validation;
    if (!v || v.url !== imageUrl(image) || v.status === 'checking') return { status: 'unchecked' };
    return clone(v);
  }
  function readyIssues(item, settings) {
    var a = normalize(item.automation), issues = [];
    ['retail', 'wholesale'].forEach(function (store) {
      if (item['need_' + store] !== '필요') return;
      var c = settings.categories[store].find(function (c) { return c.code === a.categoryCodes[store]; });
      if (!c || c.active === false) issues.push((store === 'retail' ? '소매몰' : '도매몰') + ' 카테고리 미선택 또는 사용 중지');
    });
    if (!item.name_own) issues.push('자사몰 상품명 미입력');
    if (!item.image_url && !(item.done && a.thumbnail && a.thumbnail.deletedAt)) issues.push('썸네일 미등록');
    if (!a.detailImages.length) issues.push('상세 이미지 미등록');
    a.detailImages.forEach(function (img, i) {
      if (imageLinkIssue(img)) issues.push((i + 1) + '번 이미지 ' + imageLinkIssue(img));
      if (!imageUrl(img)) issues.push((i + 1) + '번 이미지 주소 형식 오류');
      else if (validation(img).status !== 'valid') issues.push((i + 1) + '번 이미지 정상 확인 필요');
    });
    return issues;
  }
  function exportItem(item, settings) {
    var a = normalize(item.automation), brand = matchBrand(settings.brands, item.brand);
    return Object.assign({}, item, { automation: undefined, brand_custom: undefined, link_np: undefined, content: undefined, categoryCodes: a.categoryCodes, origin: a.origin,
      brandCode: brand ? brand.code : '', brandRegistered: !!brand,
      categoryPaths: { retail: path(settings.categories.retail, a.categoryCodes.retail), wholesale: path(settings.categories.wholesale, a.categoryCodes.wholesale) },
      thumbnail: Object.assign({}, a.thumbnail, { url: item.image_url || '' }),
      detailImages: a.detailImages.map(function (img, i) { return { order: i + 1, folder: img.folder, filename: img.filename, url: imageUrl(img), linkEnabled: img.linkEnabled === true, linkUrl: String(img.linkUrl || ''), validation: validation(img) }; }),
      detailHtml: html(a.detailImages), issues: readyIssues(item, settings) });
  }
  function validateSettings(s) {
    if (!s || !s.categories || !Array.isArray(s.folders)) throw new Error('설정 형식이 올바르지 않습니다.');
    normalizeSettings(s);
    var brandKeys = new Set(), brandCodes = new Set();
    s.brands.forEach(function (b) {
      var name = String(b && b.name || '').trim(), code = String(b && b.code || '').trim();
      if (!name || name.length > 30 || name !== b.name) throw new Error('브랜드 이름은 1~30자이며 앞뒤 공백이 없어야 합니다.');
      if (brandKeys.has(brandKey(name))) throw new Error('"' + name + '" 브랜드가 이미 있습니다. 대소문자·공백만 다른 이름도 같은 브랜드로 봅니다.');
      brandKeys.add(brandKey(name));
      if (b.aliases !== undefined) {
        if (!Array.isArray(b.aliases) || b.aliases.some(function (alias) { return typeof alias !== 'string' || alias.trim() !== alias || alias.length > 30; })) {
          throw new Error('브랜드 한글 검색 별칭을 확인해 주세요.');
        }
      }
      if (code) {
        if (!/^[A-Za-z0-9_-]{1,20}$/.test(code) || code !== b.code) throw new Error('브랜드 코드는 20자 이내의 영문·숫자·대시·밑줄입니다.');
        if (brandCodes.has(code)) throw new Error('브랜드 코드 ' + code + '이(가) 중복됩니다.');
        brandCodes.add(code);
      }
    });
    var folders = new Set();
    s.folders.forEach(function (f) {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(f) || folders.has(f)) throw new Error('폴더 이름은 중복 없는 영문 소문자·숫자·대시·밑줄이어야 합니다.');
      folders.add(f);
    });
    ['retail','wholesale'].forEach(function (store) {
      var cats = s.categories[store], codes = new Set();
      if (!Array.isArray(cats)) throw new Error('몰별 카테고리 목록이 필요합니다.');
      cats.forEach(function (c) {
        if (!/^(?:\d{3}){1,4}$/.test(c.code) || codes.has(c.code) || !String(c.name || '').trim()) throw new Error('카테고리 이름·코드를 확인해 주세요. 코드는 3·6·9·12자리이며 몰 안에서 중복될 수 없습니다.');
        codes.add(c.code);
        if (c.folder && !folders.has(c.folder)) throw new Error('카테고리에 연결한 폴더가 없습니다.');
      });
      cats.forEach(function (c) {
        var expected = c.code.slice(0, -3);
        if ((c.parentCode || '') !== expected || (expected && !codes.has(expected))) throw new Error(c.code + ': 상위 카테고리와 코드가 맞지 않습니다.');
      });
    });
    return s;
  }
  return { BASE: BASE, EXTENSIONS: EXTENSIONS, clone: clone, slug: slug, brandKey: brandKey, hangulInitials: hangulInitials, brandSearchText: brandSearchText, brandMatches: brandMatches, matchBrand: matchBrand, normalizeSettings: normalizeSettings, normalize: normalize, path: path, defaultFolder: defaultFolder, imageUrl: imageUrl, imageLinkUrl: imageLinkUrl, imageLinkIssue: imageLinkIssue, generate: generate, generatorValues: generatorValues, displayName: displayName, hasMarkup: hasMarkup, smartName: smartName, smartNameInput: smartNameInput, html: html, validation: validation, readyIssues: readyIssues, exportItem: exportItem, validateSettings: validateSettings };
})();
export default AutomationCore;
