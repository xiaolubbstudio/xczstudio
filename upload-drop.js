(() => {
  'use strict';
  function hasFiles(transfer) {
    return Boolean(transfer && ([...transfer.types || []].includes('Files') || [...transfer.items || []].some(item => item.kind === 'file') || transfer.files?.length));
  }
  async function collect(transfer, signal) {
    // Capture entries while the drop event still owns its DataTransfer store.
    const items = [...transfer?.items || []].filter(item => item.kind === 'file');
    const sources = items.map(item => ({ entry: item.webkitGetAsEntry?.(), file: item.getAsFile?.() }));
    if (!sources.length) sources.push(...[...transfer?.files || []].map(file => ({ file })));
    const result = []; let folders = 0;
    function add(file, relativePath) {
      signal?.throwIfAborted();
      if (!file) throw new Error('无法读取拖入的文件，请使用“选择文件”重试。');
      if (result.length >= 5000) throw new Error('一次最多上传 5000 个文件，请分批拖入。');
      result.push({ file, relativePath });
    }
    async function visit(entry, parent = '') {
      signal?.throwIfAborted();
      if (!entry.name || /[\\/\u0000-\u001f]/.test(entry.name) || ['.', '..'].includes(entry.name)) throw new Error('拖入的文件夹包含无效名称。');
      const relativePath = parent + entry.name;
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        add(file, relativePath);
      } else if (entry.isDirectory) {
        if (++folders > 100) throw new Error('一次最多上传 100 个文件夹，请分批拖入。');
        const reader = entry.createReader();
        for (;;) {
          signal?.throwIfAborted();
          const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!batch.length) break;
          for (const child of batch) await visit(child, relativePath + '/');
        }
      } else throw new Error('无法读取拖入的项目，请使用“选择文件夹”重试。');
    }
    for (const source of sources) {
      if (source.entry) await visit(source.entry);
      else add(source.file, source.file?.webkitRelativePath || source.file?.name);
    }
    return result;
  }
  const api = { hasFiles, collect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.StudioUploadDrop = api;
})();
